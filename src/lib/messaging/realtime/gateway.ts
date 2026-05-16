import "server-only";

import type { WebSocket, Server as WsServer } from "ws";
import {
  type ClientCommand,
  type ServerMessage,
  type RealtimeErrorCode,
  type RealtimeEvent,
  isValidClientCommand,
} from "./protocol";
import {
  verifyRealtimeSessionToken,
} from "./token";
import {
  type SessionRegistry,
  InMemorySessionRegistry,
  DEFAULT_SESSION_IDLE_TIMEOUT_MS,
} from "./session";
import {
  authorizeConversationSubscription,
  reauthorizeConversationSubscription,
} from "./subscription-auth";
import {
  type RealtimeDiagnostics,
  ConsoleRealtimeDiagnostics,
} from "./diagnostics";
import { upsertPresence, startTyping, stopTyping, clearTypingForUser } from "../presence-service";
import { replayConversationEvents } from "./event-log-service";
import { db } from "@/lib/db";
import {
  type SafetyLimits,
  SessionRateLimiter,
  createBackpressureState,
  type BackpressureState,
  DEFAULT_SAFETY_LIMITS,
} from "./safety-limits";
import { type DegradedModeReason, makeDegradedState } from "./degraded-mode";

/**
 * Messaging WebSocket Gateway.
 *
 * Accepts authenticated connections using short-lived realtime session tokens,
 * maintains session lifecycle, enforces subscription authorization, handles
 * heartbeat-based idle expiry, and provides conversation-scoped fanout.
 *
 * Architecture note: this gateway is designed as a standalone module that can
 * be instantiated inside a custom Node.js server or a separate service process.
 * In the current Next.js App Router deployment model, the bootstrap endpoint
 * lives in a route handler; the gateway server should be wired into the
 * deployment topology (e.g., custom server, container, or Edge runtime) as the
 * platform matures.
 */

export interface GatewayOptions {
  tokenSecret: string;
  sessionRegistry?: SessionRegistry;
  diagnostics?: RealtimeDiagnostics;
  /** Max idle time before heartbeat expiry (ms). Default 60s. */
  idleTimeoutMs?: number;
  /** Interval for the periodic sweep job (ms). Default 30s. */
  sweepIntervalMs?: number;
  /** Clock skew tolerance for token verification (seconds). Default 30. */
  clockSkewSeconds?: number;
  /** Typing indicator TTL (ms). Default 5s. */
  typingTtlMs?: number;
  /** Safety limits for subscriptions, rate limits, and backpressure. */
  safetyLimits?: SafetyLimits;
}

export interface GatewayConnectionState {
  sessionId: string | null;
  connectedAt: number;
  lastActivityAt: number;
}

interface SessionAuxiliaryState {
  rateLimiter: SessionRateLimiter;
  backpressure: BackpressureState;
  degradedReasons: Set<DegradedModeReason>;
  /** FIFO of unacknowledged event IDs for real backpressure tracking. */
  sentEventIds: string[];
}

export class MessagingGateway {
  private tokenSecret: string;
  private sessions: SessionRegistry;
  private diagnostics: RealtimeDiagnostics;
  private idleTimeoutMs: number;
  private sweepIntervalMs: number;
  private clockSkewSeconds: number;
  private typingTtlMs: number;
  private safetyLimits: SafetyLimits;
  private sweepTimer: NodeJS.Timeout | null = null;
  private wsConnections = new WeakMap<WebSocket, GatewayConnectionState>();
  /** sessionId -> active socket.  Only one transport per session at a time. */
  private sessionSockets = new Map<string, WebSocket>();
  /** sessionId:conversationId -> typing expiry timer. */
  private typingTimers = new Map<string, NodeJS.Timeout>();
  /** sessionId -> auxiliary state (rate limiter, backpressure, degraded flags). */
  private sessionAux = new Map<string, SessionAuxiliaryState>();

  constructor(options: GatewayOptions) {
    this.tokenSecret = options.tokenSecret;
    this.sessions = options.sessionRegistry ?? new InMemorySessionRegistry();
    this.diagnostics = options.diagnostics ?? new ConsoleRealtimeDiagnostics();
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 30_000;
    this.clockSkewSeconds = options.clockSkewSeconds ?? 30;
    this.typingTtlMs = options.typingTtlMs ?? 5_000;
    this.safetyLimits = options.safetyLimits ?? DEFAULT_SAFETY_LIMITS;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  attach(wsServer: WsServer): void {
    wsServer.on("connection", (socket) => {
      this.handleConnection(socket);
    });

    this.startSweepJob();
  }

  detach(wsServer: WsServer): void {
    this.stopSweepJob();
    wsServer.removeAllListeners("connection");
  }

  destroy(): void {
    this.stopSweepJob();
    for (const timer of Array.from(this.typingTimers.values())) {
      clearTimeout(timer);
    }
    this.typingTimers.clear();
    this.sessionAux.clear();
  }

  // -------------------------------------------------------------------------
  // Sprint 4.4: auxiliary state helpers
  // -------------------------------------------------------------------------

  private getOrCreateAux(sessionId: string): SessionAuxiliaryState {
    let aux = this.sessionAux.get(sessionId);
    if (!aux) {
      aux = {
        rateLimiter: new SessionRateLimiter(this.safetyLimits),
        backpressure: createBackpressureState(),
        degradedReasons: new Set(),
        sentEventIds: [],
      };
      this.sessionAux.set(sessionId, aux);
    }
    return aux;
  }

  private removeAux(sessionId: string): void {
    this.sessionAux.delete(sessionId);
  }

  private isSubscriptionLimitReached(sessionId: string): boolean {
    const subs = this.sessions.getSubscriptions(sessionId);
    return subs.size >= this.safetyLimits.maxSubscriptionsPerSession;
  }

  private sendDegradedState(
    socket: WebSocket,
    reason: DegradedModeReason,
    overrides?: { message?: string; retryAfterMs?: number; rehydrateRecommended?: boolean },
  ): void {
    const state = makeDegradedState(reason);
    this.sendMessage(socket, {
      type: "degraded",
      payload: {
        reason: state.reason,
        message: overrides?.message ?? state.message,
        retryAfterMs: overrides?.retryAfterMs ?? state.retryAfterMs,
        rehydrateRecommended: overrides?.rehydrateRecommended ?? state.rehydrateRecommended,
      },
    });
  }

  private enterDegradedMode(sessionId: string, reason: DegradedModeReason, rehydrateRecommended?: boolean): void {
    const aux = this.getOrCreateAux(sessionId);
    aux.degradedReasons.add(reason);
    this.diagnostics.emit({
      kind: "degraded_mode_entered",
      sessionId,
      reason,
      rehydrateRecommended,
    });
  }

  private exitDegradedMode(sessionId: string, reason: DegradedModeReason): void {
    const aux = this.getOrCreateAux(sessionId);
    aux.degradedReasons.delete(reason);
    this.diagnostics.emit({
      kind: "degraded_mode_recovered",
      sessionId,
      reason,
    });
  }

  // -------------------------------------------------------------------------
  // Connection handling
  // -------------------------------------------------------------------------

  private handleConnection(socket: WebSocket): void {
    const connectedAt = Date.now();
    const connState: GatewayConnectionState = {
      sessionId: null,
      connectedAt,
      lastActivityAt: connectedAt,
    };
    this.wsConnections.set(socket, connState);

    socket.on("message", (rawData) => {
      connState.lastActivityAt = Date.now();
      this.handleMessage(socket, connState, rawData);
    });

    socket.on("close", () => {
      this.handleDisconnect(socket, connState, "client_close");
    });

    socket.on("error", (error) => {
      this.handleDisconnect(socket, connState, `socket_error: ${error.message}`);
    });

    // If no authentication arrives within the idle timeout, close the socket.
    const authTimeout = setTimeout(() => {
      if (!connState.sessionId && socket.readyState === socket.OPEN) {
        this.sendFatalError(socket, "auth_required", "authentication timeout", connState);
        socket.close(1008, "auth timeout");
      }
    }, this.idleTimeoutMs);

    // Clean up the auth timeout timer when the socket closes.
    socket.once("close", () => clearTimeout(authTimeout));
  }

  // -------------------------------------------------------------------------
  // Message dispatch
  // -------------------------------------------------------------------------

  private handleMessage(
    socket: WebSocket,
    connState: GatewayConnectionState,
    rawData: unknown,
  ): void {
    let text: string;
    try {
      text =
        typeof rawData === "string"
          ? rawData
          : rawData instanceof Buffer
            ? rawData.toString("utf8")
            : "";
    } catch {
      this.sendError(socket, "malformed_payload", "invalid payload encoding", false, connState.sessionId);
      return;
    }

    // Sprint 4.4: enforce inbound payload size before parsing.
    const byteLength = Buffer.byteLength(text, "utf8");
    if (byteLength > this.safetyLimits.maxMessagePayloadBytes) {
      this.diagnostics.emit({
        kind: "payload_size_denied",
        sessionId: connState.sessionId ?? "unknown",
        byteLength,
        limit: this.safetyLimits.maxMessagePayloadBytes,
      });
      this.sendFatalError(socket, "malformed_payload", `payload exceeds ${this.safetyLimits.maxMessagePayloadBytes} bytes`, connState);
      socket.close(1009, "message too big");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.sendError(socket, "malformed_payload", "invalid JSON", false, connState.sessionId);
      return;
    }

    if (!isValidClientCommand(parsed)) {
      this.sendError(socket, "invalid_command", "unrecognized or malformed command", false, connState.sessionId);
      return;
    }

    const command = parsed as ClientCommand;
    const requestId = command.requestId;

    // Sprint 4.4: per-session command rate limiting.
    if (connState.sessionId) {
      const aux = this.getOrCreateAux(connState.sessionId);
      const rateResult = aux.rateLimiter.checkCommandAllowed();
      if (!rateResult.allowed) {
        this.diagnostics.emit({
          kind: "rate_limit_denied",
          sessionId: connState.sessionId,
          commandType: command.type,
          remaining: rateResult.remaining,
          resetAt: rateResult.resetAt,
        });
        this.sendError(socket, "rate_limited", "too many commands", false, connState.sessionId, requestId);
        return;
      }
    }

    switch (command.type) {
      case "subscribe_conversation":
        void this.handleSubscribe(
          socket,
          connState,
          command.payload.conversationId,
          requestId,
          command.payload.lastSeenCursor ?? undefined,
        );
        break;
      case "unsubscribe_conversation":
        this.handleUnsubscribe(socket, connState, command.payload.conversationId, requestId);
        break;
      case "heartbeat":
        this.handleHeartbeat(socket, connState, requestId);
        break;
      case "resume_session":
        void this.handleResumeSession(
          socket,
          connState,
          command.payload.sessionToken,
          requestId,
          command.payload.lastSeenCursors ?? undefined,
        );
        break;
      case "set_presence":
        void this.handleSetPresence(socket, connState, command.payload, requestId);
        break;
      case "start_typing":
        void this.handleStartTyping(socket, connState, command.payload.conversationId, requestId);
        break;
      case "stop_typing":
        void this.handleStopTyping(socket, connState, command.payload.conversationId, requestId);
        break;
      case "ack_events":
        this.handleAckEvents(socket, connState, command.payload, requestId);
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Command handlers
  // -------------------------------------------------------------------------

  private async handleSubscribe(
    socket: WebSocket,
    connState: GatewayConnectionState,
    conversationId: string,
    requestId: string,
    lastSeenCursor?: string,
  ): Promise<void> {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    // Sprint 4.4: enforce subscription limits.
    if (this.isSubscriptionLimitReached(session.sessionId)) {
      const currentCount = this.sessions.getSubscriptions(session.sessionId).size;
      this.diagnostics.emit({
        kind: "subscription_limit_denied",
        sessionId: session.sessionId,
        conversationId,
        currentCount,
        limit: this.safetyLimits.maxSubscriptionsPerSession,
      });
      this.sendDegradedState(socket, "subscription_limit_reached");
      return;
    }

    const authDetail = await authorizeConversationSubscription(session, conversationId);
    if (!authDetail.result.allowed) {
      const denied = authDetail.result as import("./subscription-auth").SubscriptionAuthResult & { allowed: false };
      this.diagnostics.emit({
        kind: "subscription_denied",
        sessionId: session.sessionId,
        conversationId,
        reason: denied.reason,
      });
      this.sendMessage(socket, {
        type: "subscription_denied",
        requestId,
        payload: {
          conversationId,
          reason: denied.reason,
          code: denied.code,
        },
      });
      return;
    }

    this.sessions.addSubscription(session.sessionId, conversationId);
    this.diagnostics.emit({
      kind: "subscription_accepted",
      sessionId: session.sessionId,
      conversationId,
    });
    this.sendMessage(socket, {
      type: "subscription_ack",
      requestId,
      payload: {
        conversationId,
        subscribedAt: Date.now(),
      },
    });

    // Sprint 4.3: replay missed events if client provided a cursor.
    if (lastSeenCursor) {
      await this.replayForSubscription(socket, session, conversationId, lastSeenCursor);
    }
  }

  private handleUnsubscribe(
    socket: WebSocket,
    connState: GatewayConnectionState,
    conversationId: string,
    requestId: string,
  ): void {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    const removed = this.sessions.removeSubscription(session.sessionId, conversationId);
    if (removed) {
      this.sendMessage(socket, {
        type: "subscription_ack",
        requestId,
        payload: {
          conversationId,
          subscribedAt: Date.now(),
        },
      });
    } else {
      this.sendError(socket, "subscription_not_found", "not subscribed", false, session.sessionId, requestId);
    }
  }

  private handleHeartbeat(
    socket: WebSocket,
    connState: GatewayConnectionState,
    requestId: string,
  ): void {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    const ok = this.sessions.updateHeartbeat(session.sessionId);
    if (!ok) {
      this.sendFatalError(socket, "session_expired", "session no longer valid", connState);
      socket.close(1008, "session expired");
      return;
    }

    this.sendMessage(socket, {
      type: "heartbeat_ack",
      requestId,
      payload: { serverTime: Date.now() },
    });
  }

  private async handleResumeSession(
    socket: WebSocket,
    connState: GatewayConnectionState,
    sessionToken: string,
    requestId: string,
    lastSeenCursors?: Record<string, string>,
  ): Promise<void> {
    // If already authenticated, reject duplicate resume.
    if (connState.sessionId) {
      this.sendError(socket, "invalid_command", "session already established", false, connState.sessionId, requestId);
      return;
    }

    // Sprint 4.4: enforce resume rate limits per connection.
    // Use a temporary aux keyed by socket until session is established.
    const resumeKey = `resume:${connState.connectedAt}`;
    let aux = this.sessionAux.get(resumeKey);
    if (!aux) {
      aux = {
        rateLimiter: new SessionRateLimiter(this.safetyLimits),
        backpressure: createBackpressureState(),
        degradedReasons: new Set(),
        sentEventIds: [],
      };
      this.sessionAux.set(resumeKey, aux);
    }
    const resumeCheck = aux.rateLimiter.checkResumeAllowed();
    if (!resumeCheck.allowed) {
      this.diagnostics.emit({
        kind: "rate_limit_denied",
        sessionId: resumeKey,
        commandType: "resume_session",
        remaining: resumeCheck.remaining,
        resetAt: Date.now() + 60_000,
      });
      this.sendFatalError(socket, "rate_limited", "too many resume attempts", connState, requestId);
      socket.close(1008, "rate limited");
      return;
    }

    const verifyResult = verifyRealtimeSessionToken(sessionToken, this.tokenSecret, {
      clockSkewSeconds: this.clockSkewSeconds,
    });

    if (!verifyResult.valid || !verifyResult.claims) {
      const code: RealtimeErrorCode =
        verifyResult.error === "expired" ? "auth_expired" : "auth_invalid";
      this.diagnostics.emit({
        kind: "connect_denied",
        reason: verifyResult.error ?? "invalid token",
        code,
      });
      this.sendFatalError(socket, code, verifyResult.error ?? "invalid token", connState, requestId);
      socket.close(1008, "auth failed");
      return;
    }

    const claims = verifyResult.claims;

    // Validate that the session still exists and is not closed.
    let session = this.sessions.getSession(claims.sid);
    if (session && session.closed) {
      this.diagnostics.emit({
        kind: "connect_denied",
        reason: "session closed",
        code: "session_not_found",
      });
      this.sendFatalError(socket, "session_not_found", "session has been closed", connState, requestId);
      socket.close(1008, "session closed");
      return;
    }

    if (!session) {
      // No existing session record — create a fresh one. This happens on first
      // connect or when the prior session was fully evicted.
      session = this.sessions.createSession(claims);
    }

    connState.sessionId = session.sessionId;
    this.sessions.updateHeartbeat(session.sessionId);
    this.sessionSockets.set(session.sessionId, socket);

    // Clean up temporary resume rate limiter.
    this.sessionAux.delete(`resume:${connState.connectedAt}`);

    this.diagnostics.emit({
      kind: "connect_success",
      sessionId: session.sessionId,
      orgId: session.orgId,
      userId: session.userId,
    });

    this.sendMessage(socket, {
      type: "session_ack",
      requestId,
      payload: {
        sessionId: session.sessionId,
        serverTime: Date.now(),
        expiresAt: session.expiresAt,
      },
    });

    // Re-authorize any existing subscriptions carried over from a previous connection.
    const existingSubs = this.sessions.getSubscriptions(session.sessionId);
    const allowedSubs: string[] = [];
    for (const conversationId of existingSubs) {
      const reauthDetail = await reauthorizeConversationSubscription(session, conversationId);
      if (!reauthDetail.result.allowed) {
        const denied = reauthDetail.result as import("./subscription-auth").SubscriptionAuthResult & { allowed: false };
        this.sessions.removeSubscription(session.sessionId, conversationId);
        this.diagnostics.emit({
          kind: "subscription_denied",
          sessionId: session.sessionId,
          conversationId,
          reason: denied.reason,
        });
        this.sendMessage(socket, {
          type: "subscription_denied",
          payload: {
            conversationId,
            reason: denied.reason,
            code: denied.code,
          },
        });
      } else {
        allowedSubs.push(conversationId);
      }
    }

    // Sprint 4.3: replay missed events for reauthorized subscriptions.
    // Each conversation is replayed against its own cursor so that a stale or
    // invalid cursor for conversation A never poisons replay for conversation B.
    let rehydrateRecommended = false;
    if (lastSeenCursors && allowedSubs.length > 0) {
      for (const conversationId of allowedSubs) {
        const cursor = lastSeenCursors[conversationId];
        if (!cursor) continue; // no cursor for this conversation, skip replay
        const replayOk = await this.replayForSubscription(socket, session, conversationId, cursor);
        if (!replayOk) {
          rehydrateRecommended = true;
        }
      }
    }

    // Send explicit resume result so the client knows whether continuity is satisfied.
    if (lastSeenCursors && allowedSubs.length > 0) {
      this.sendMessage(socket, {
        type: "resume_session_result",
        requestId,
        payload: {
          resumed: !rehydrateRecommended,
          sessionId: session.sessionId,
          serverTime: Date.now(),
          rehydrateRecommended,
        },
      });
    }
  }

  private async handleSetPresence(
    socket: WebSocket,
    connState: GatewayConnectionState,
    payload: { status: "online" | "away" | "offline"; activeConversationId?: string | null },
    requestId: string,
  ): Promise<void> {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    try {
      const presence = await upsertPresence({
        orgId: session.orgId,
        userId: session.userId,
        status: payload.status,
        activeConversationId: payload.activeConversationId ?? null,
        expiresAt: new Date(Date.now() + this.idleTimeoutMs),
      });

      this.diagnostics.emit({
        kind: "presence_updated",
        sessionId: session.sessionId,
        orgId: session.orgId,
        userId: session.userId,
        status: payload.status,
      });

      this.sendMessage(socket, {
        type: "heartbeat_ack",
        requestId,
        payload: { serverTime: Date.now() },
      });

      // Fanout presence update to org-scoped viewers.
      const event: RealtimeEvent = {
        type: "event",
        eventId: `presence:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        payload: {
          eventType: "conversation.presence.updated",
          orgId: session.orgId,
          conversationId: "_org",
          occurredAt: Date.now(),
          actorId: session.userId,
          data: {
            userId: presence.userId,
            status: presence.status,
            activeConversationId: presence.activeConversationId,
          },
        },
      };
      this.publishToOrg(session.orgId, event, { senderUserId: session.userId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "presence update failed";
      this.sendError(socket, "server_error", message, false, session.sessionId, requestId);
    }
  }

  private async handleStartTyping(
    socket: WebSocket,
    connState: GatewayConnectionState,
    conversationId: string,
    requestId: string,
  ): Promise<void> {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    // Sprint 4.4: typing rate limit.
    const aux = this.getOrCreateAux(session.sessionId);
    const typingRate = aux.rateLimiter.checkTypingAllowed();
    if (!typingRate.allowed) {
      this.diagnostics.emit({
        kind: "rate_limit_denied",
        sessionId: session.sessionId,
        commandType: "start_typing",
        remaining: typingRate.remaining,
        resetAt: typingRate.resetAt,
      });
      this.sendError(socket, "rate_limited", "typing rate limit exceeded", false, session.sessionId, requestId);
      return;
    }

    // Ensure the session is subscribed to this conversation.
    if (!this.sessions.getSubscriptions(session.sessionId).has(conversationId)) {
      this.sendError(socket, "subscription_denied", "not subscribed to conversation", false, session.sessionId, requestId);
      return;
    }

    try {
      const typing = await startTyping({
        orgId: session.orgId,
        conversationId,
        userId: session.userId,
        expiresAt: new Date(Date.now() + this.typingTtlMs),
      });

      this.diagnostics.emit({
        kind: "typing_started",
        sessionId: session.sessionId,
        conversationId,
        userId: session.userId,
      });

      // Set auto-expiry timer.
      this.clearTypingTimer(session.sessionId, conversationId);
      const timerKey = `${session.sessionId}:${conversationId}`;
      this.typingTimers.set(
        timerKey,
        setTimeout(() => {
          this.handleTypingExpired(session.sessionId, conversationId);
        }, this.typingTtlMs),
      );

      const event: RealtimeEvent = {
        type: "event",
        eventId: `typing:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        payload: {
          eventType: "conversation.typing.updated",
          orgId: session.orgId,
          conversationId,
          occurredAt: Date.now(),
          actorId: session.userId,
          data: {
            userId: typing.userId,
            status: typing.status,
            expiresAt: typing.expiresAt.toISOString(),
          },
        },
      };
      this.publishToConversation(session.orgId, conversationId, event);
    } catch (error) {
      const message = error instanceof Error ? error.message : "typing start failed";
      this.sendError(socket, "server_error", message, false, session.sessionId, requestId);
    }
  }

  private async handleStopTyping(
    socket: WebSocket,
    connState: GatewayConnectionState,
    conversationId: string,
    requestId: string,
  ): Promise<void> {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    try {
      await stopTyping({
        orgId: session.orgId,
        conversationId,
        userId: session.userId,
      });

      this.diagnostics.emit({
        kind: "typing_stopped",
        sessionId: session.sessionId,
        conversationId,
        userId: session.userId,
      });

      this.clearTypingTimer(session.sessionId, conversationId);

      const event: RealtimeEvent = {
        type: "event",
        eventId: `typing:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        payload: {
          eventType: "conversation.typing.updated",
          orgId: session.orgId,
          conversationId,
          occurredAt: Date.now(),
          actorId: session.userId,
          data: { userId: null, status: null },
        },
      };
      this.publishToConversation(session.orgId, conversationId, event);
    } catch (error) {
      const message = error instanceof Error ? error.message : "typing stop failed";
      this.sendError(socket, "server_error", message, false, session.sessionId, requestId);
    }
  }

  private handleAckEvents(
    socket: WebSocket,
    connState: GatewayConnectionState,
    payload: { lastEventId?: string; cursors?: Record<string, string> },
    requestId: string,
  ): void {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    const aux = this.getOrCreateAux(session.sessionId);

    // Sprint 4.4: ack_events must meaningfully reduce outstanding delivery backlog.
    if (payload.lastEventId && aux.sentEventIds.length > 0) {
      const idx = aux.sentEventIds.indexOf(payload.lastEventId);
      if (idx !== -1) {
        // Remove this event and all prior events from the outstanding queue.
        aux.sentEventIds = aux.sentEventIds.slice(idx + 1);
      } else {
        // Event ID not in queue — client may be acking an old pruned event.
        // Best-effort: assume at least one event was processed.
        aux.sentEventIds.shift();
      }
      aux.backpressure.outstandingEvents = aux.sentEventIds.length;
    } else if (payload.cursors && aux.sentEventIds.length > 0) {
      // Per-conversation cursors serve as a general ack signal when no lastEventId is given.
      // Best-effort: assume at least one event was processed.
      aux.sentEventIds.shift();
      aux.backpressure.outstandingEvents = aux.sentEventIds.length;
    }

    // Release backpressure if the outstanding backlog has dropped below the threshold.
    if (aux.backpressure.active && aux.backpressure.outstandingEvents <= this.safetyLimits.maxEventQueueDepth / 2) {
      aux.backpressure.active = false;
      aux.backpressure.reason = null;
      this.diagnostics.emit({
        kind: "backpressure_released",
        sessionId: session.sessionId,
        outstandingEvents: aux.backpressure.outstandingEvents,
      });
      this.sendMessage(socket, {
        type: "connection_state",
        payload: { state: "connected" },
      });
    }

    this.sendMessage(socket, {
      type: "heartbeat_ack",
      requestId,
      payload: { serverTime: Date.now() },
    });
  }

  /**
   * Replay missed events for a subscription from a durable cursor.
   * Returns true if replay succeeded (or was not needed), false if the cursor
   * was invalid/stale and the client should rehydrate.
   */
  private async replayForSubscription(
    socket: WebSocket,
    session: import("./session").RealtimeSession,
    conversationId: string,
    lastSeenCursor: string,
  ): Promise<boolean> {
    try {
      const result = await replayConversationEvents(db, {
        orgId: session.orgId,
        conversationId,
        afterCursor: lastSeenCursor,
        limit: 200,
      });

      if (result.status !== "ok") {
        this.diagnostics.emit({
          kind: "event_dropped",
          eventType: "replay",
          conversationId,
          reason: `replay_${result.status}`,
          sessionId: session.sessionId,
        });
        this.diagnostics.emit({
          kind: "replay_degraded",
          sessionId: session.sessionId,
          conversationId,
          reason: `replay_${result.status}`,
        });
        this.enterDegradedMode(session.sessionId, "replay_unavailable", true);
        this.sendError(socket, "replay_unavailable", `replay cursor ${result.status}`, false, session.sessionId);
        this.sendDegradedState(socket, "replay_unavailable");
        return false;
      }

      for (const event of result.events) {
        const envelope: RealtimeEvent = {
          type: "event",
          eventId: event.eventId,
          payload: {
            eventType: event.eventType,
            orgId: event.orgId,
            conversationId: event.conversationId,
            occurredAt: event.occurredAt,
            actorId: event.actorId ?? undefined,
            cursor: event.cursor.toString(),
            data: event.payload,
          },
        };
        this.sendMessage(socket, envelope);
      }

      this.diagnostics.emit({
        kind: "event_published",
        eventType: "replay",
        conversationId,
        recipientCount: result.events.length,
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "replay failed";
      this.diagnostics.emit({
        kind: "event_dropped",
        eventType: "replay",
        conversationId,
        reason: message,
        sessionId: session.sessionId,
      });
      this.diagnostics.emit({
        kind: "replay_degraded",
        sessionId: session.sessionId,
        conversationId,
        reason: message,
      });
      this.enterDegradedMode(session.sessionId, "replay_unavailable", true);
      this.sendError(socket, "replay_unavailable", message, false, session.sessionId);
      this.sendDegradedState(socket, "replay_unavailable");
      return false;
    }
  }

  private async handleTypingExpired(sessionId: string, conversationId: string): Promise<void> {
    const session = this.sessions.getSession(sessionId);
    if (!session) return;

    this.clearTypingTimer(sessionId, conversationId);

    // Clear persisted typing state so expiry is reflected in reads.
    try {
      await clearTypingForUser(session.orgId, conversationId, session.userId);
    } catch {
      // Best-effort cleanup; don't destabilize the gateway.
    }

    this.diagnostics.emit({
      kind: "typing_expired",
      sessionId,
      conversationId,
      userId: session.userId,
    });

    const event: RealtimeEvent = {
      type: "event",
      eventId: `typing:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      payload: {
        eventType: "conversation.typing.updated",
        orgId: session.orgId,
        conversationId,
        occurredAt: Date.now(),
        actorId: session.userId,
        data: { userId: null, status: null },
      },
    };
    this.publishToConversation(session.orgId, conversationId, event);
  }

  private clearTypingTimer(sessionId: string, conversationId: string): void {
    const timerKey = `${sessionId}:${conversationId}`;
    const existing = this.typingTimers.get(timerKey);
    if (existing) {
      clearTimeout(existing);
      this.typingTimers.delete(timerKey);
    }
  }

  // -------------------------------------------------------------------------
  // Disconnect / cleanup
  // -------------------------------------------------------------------------

  private handleDisconnect(
    socket: WebSocket,
    connState: GatewayConnectionState,
    reason: string,
  ): void {
    if (connState.sessionId) {
      this.diagnostics.emit({
        kind: "disconnect",
        sessionId: connState.sessionId,
        reason,
      });
      this.sessions.detachSession(connState.sessionId);
      this.sessionSockets.delete(connState.sessionId);
      this.removeAux(connState.sessionId);
      // Teardown typing: clear persistence, publish stopped, and clear timers.
      void this.teardownTypingForSession(connState.sessionId);
    }
    this.wsConnections.delete(socket);
  }

  private async teardownTypingForSession(sessionId: string): Promise<void> {
    const session = this.sessions.getSession(sessionId);
    if (!session) return;

    const entries = Array.from(this.typingTimers.entries()).filter(([key]) =>
      key.startsWith(`${sessionId}:`),
    );

    for (const [key, timer] of entries) {
      clearTimeout(timer);
      this.typingTimers.delete(key);
      const conversationId = key.slice(sessionId.length + 1);

      // Clear persisted typing state so disconnect is reflected in reads.
      try {
        await clearTypingForUser(session.orgId, conversationId, session.userId);
      } catch {
        // Best-effort cleanup.
      }

      const event: import("./protocol").RealtimeEvent = {
        type: "event",
        eventId: `typing:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        payload: {
          eventType: "conversation.typing.updated",
          orgId: session.orgId,
          conversationId,
          occurredAt: Date.now(),
          actorId: session.userId,
          data: { userId: null, status: null },
        },
      };
      this.publishToConversation(session.orgId, conversationId, event);
    }
  }

  // -------------------------------------------------------------------------
  // Fanout
  // -------------------------------------------------------------------------

  /**
   * Publish a message to all active sessions currently subscribed to a
   * conversation.  Enforces org isolation — only sessions in `orgId` receive
   * the message.
   */
  /**
   * Remove all live subscriptions for a user from a conversation.
   * Used when membership is revoked to cut off future delivery.
   */
  pruneSubscriptionsForUser(orgId: string, conversationId: string, userId: string): string[] {
    const pruned = this.sessions.pruneSubscriptionsForUser(orgId, conversationId, userId);
    for (const sessionId of pruned) {
      this.diagnostics.emit({
        kind: "subscription_denied",
        sessionId,
        conversationId,
        reason: "membership_revoked",
      });
    }
    return pruned;
  }

  /**
   * Publish a message to all active sessions currently subscribed to a
   * conversation.  Enforces org isolation and performs a narrow defense-in-depth
   * check that the session still claims the subscription.
   */
  publishToConversation(orgId: string, conversationId: string, message: ServerMessage): void {
    const sessions = this.sessions.getSessionsForConversation(conversationId);
    let sent = 0;

    for (const session of Array.from(sessions)) {
      if (session.orgId !== orgId) continue;
      // Defense in depth: skip if the session no longer claims this subscription.
      if (!session.subscriptions.has(conversationId)) continue;

      const socket = this.sessionSockets.get(session.sessionId);
      if (socket && socket.readyState === socket.OPEN) {
        this.sendMessage(socket, message);
        sent++;
      } else {
        this.diagnostics.emit({
          kind: "event_dropped",
          eventType: "conversation",
          conversationId,
          reason: "socket not open",
          sessionId: session.sessionId,
        });
      }
    }

    this.diagnostics.emit({
      kind: "event_published",
      eventType: "conversation",
      conversationId,
      recipientCount: sent,
    });
  }

  /**
   * Publish a message to all active sessions in an org.
   *
   * Presence safety: if the message payload contains an `activeConversationId`,
   * it is stripped for recipients who are not subscribed to that conversation.
   */
  publishToOrg(
    orgId: string,
    message: ServerMessage,
    options?: { senderUserId?: string },
  ): void {
    const sessions = this.sessions.getSessionsByOrg(orgId);
    let sent = 0;

    for (const session of sessions) {
      // Don't echo presence back to the sender.
      if (options?.senderUserId && session.userId === options.senderUserId) continue;

      const socket = this.sessionSockets.get(session.sessionId);
      if (socket && socket.readyState === socket.OPEN) {
        // Presence safety: strip activeConversationId for unauthorized viewers.
        const safeMessage = this.scrubPresenceMessageForRecipient(message, session);
        this.sendMessage(socket, safeMessage);
        sent++;
      }
    }

    this.diagnostics.emit({
      kind: "event_published",
      eventType: "presence",
      conversationId: "_org",
      recipientCount: sent,
    });
  }

  private scrubPresenceMessageForRecipient(
    message: ServerMessage,
    recipientSession: import("./session").RealtimeSession,
  ): ServerMessage {
    if (message.type !== "event") return message;
    const event = message as RealtimeEvent;
    if (event.payload.eventType !== "conversation.presence.updated") return message;

    const data = event.payload.data as Record<string, unknown> | undefined;
    if (!data || !data.activeConversationId) return message;

    const activeConversationId = data.activeConversationId as string;
    const subs = this.sessions.getSubscriptions(recipientSession.sessionId);
    if (subs.has(activeConversationId)) {
      return message; // recipient is authorized to see the active conversation
    }

    // Strip activeConversationId for unauthorized recipients.
    return {
      ...event,
      payload: {
        ...event.payload,
        data: {
          ...data,
          activeConversationId: undefined,
        },
      },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private requireSession(
    socket: WebSocket,
    connState: GatewayConnectionState,
    requestId?: string,
  ): import("./session").RealtimeSession | null {
    if (!connState.sessionId) {
      this.sendFatalError(socket, "auth_required", "session not established", connState, requestId);
      socket.close(1008, "auth required");
      return null;
    }
    const session = this.sessions.getSession(connState.sessionId);
    if (!session || session.closed) {
      this.sendFatalError(socket, "session_expired", "session expired or closed", connState, requestId);
      socket.close(1008, "session expired");
      return null;
    }
    return session;
  }

  private sendMessage(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== socket.OPEN) return;

    // Sprint 4.4: backpressure tracking based on actual unacknowledged events.
    const connState = this.wsConnections.get(socket);
    if (connState?.sessionId) {
      const aux = this.getOrCreateAux(connState.sessionId);

      // Only count RealtimeEvent messages toward outstanding delivery backlog.
      if (message.type === "event") {
        const eventMsg = message as RealtimeEvent;
        // If backpressure is active, drop this event but still allow control messages.
        if (aux.backpressure.active) {
          aux.backpressure.droppedEvents++;
          return;
        }
        aux.sentEventIds.push(eventMsg.eventId);
        // Cap queue to prevent unbounded growth if client never acks.
        const maxTracked = this.safetyLimits.maxEventQueueDepth * 2;
        if (aux.sentEventIds.length > maxTracked) {
          aux.sentEventIds.shift();
        }
        aux.backpressure.outstandingEvents = aux.sentEventIds.length;
        if (aux.backpressure.outstandingEvents > this.safetyLimits.maxEventQueueDepth) {
          aux.backpressure.active = true;
          aux.backpressure.reason = "queue_full";
          this.diagnostics.emit({
            kind: "backpressure_activated",
            sessionId: connState.sessionId,
            reason: "queue_full",
            outstandingEvents: aux.backpressure.outstandingEvents,
          });
          this.sendDegradedState(socket, "fanout_delayed");
        }
      }
    }

    try {
      socket.send(JSON.stringify(message));
    } catch {
      // Best-effort delivery.
    }
  }

  private sendError(
    socket: WebSocket,
    code: RealtimeErrorCode,
    message: string,
    fatal: boolean,
    sessionId: string | null,
    requestId?: string,
  ): void {
    if (sessionId) {
      this.diagnostics.emit({
        kind: "command_rejected",
        sessionId,
        commandType: "unknown",
        reason: message,
      });
    }
    this.sendMessage(socket, {
      type: "error",
      requestId,
      payload: { code, message, fatal },
    });
  }

  private sendFatalError(
    socket: WebSocket,
    code: RealtimeErrorCode,
    message: string,
    connState: GatewayConnectionState,
    requestId?: string,
  ): void {
    this.sendError(socket, code, message, true, connState.sessionId ?? null, requestId);
  }

  // -------------------------------------------------------------------------
  // Sweep job (idle expiry)
  // -------------------------------------------------------------------------

  private startSweepJob(): void {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => {
      const evicted = this.sessions.sweepExpiredSessions(this.idleTimeoutMs);
      for (const { sessionId, reason } of evicted) {
        this.diagnostics.emit({ kind: "session_sweep", sessionId, reason });
        this.sessionSockets.delete(sessionId);
        void this.teardownTypingForSession(sessionId);
      }
    }, this.sweepIntervalMs);
  }

  private stopSweepJob(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Public introspection (supportability)
  // -------------------------------------------------------------------------

  getSessionRegistry(): SessionRegistry {
    return this.sessions;
  }

  getDiagnostics(): RealtimeDiagnostics {
    return this.diagnostics;
  }
}
