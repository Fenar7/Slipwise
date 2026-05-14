import "server-only";

import type { WebSocket, Server as WsServer } from "ws";
import {
  type ClientCommand,
  type ServerMessage,
  type RealtimeErrorCode,
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

/**
 * Messaging WebSocket Gateway.
 *
 * Accepts authenticated connections using short-lived realtime session tokens,
 * maintains session lifecycle, enforces subscription authorization, and handles
 * heartbeat-based idle expiry.
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
}

export interface GatewayConnectionState {
  sessionId: string | null;
  connectedAt: number;
  lastActivityAt: number;
}

export class MessagingGateway {
  private tokenSecret: string;
  private sessions: SessionRegistry;
  private diagnostics: RealtimeDiagnostics;
  private idleTimeoutMs: number;
  private sweepIntervalMs: number;
  private clockSkewSeconds: number;
  private sweepTimer: NodeJS.Timeout | null = null;
  private wsConnections = new WeakMap<WebSocket, GatewayConnectionState>();

  constructor(options: GatewayOptions) {
    this.tokenSecret = options.tokenSecret;
    this.sessions = options.sessionRegistry ?? new InMemorySessionRegistry();
    this.diagnostics = options.diagnostics ?? new ConsoleRealtimeDiagnostics();
    this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_SESSION_IDLE_TIMEOUT_MS;
    this.sweepIntervalMs = options.sweepIntervalMs ?? 30_000;
    this.clockSkewSeconds = options.clockSkewSeconds ?? 30;
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
    let parsed: unknown;
    try {
      const text =
        typeof rawData === "string"
          ? rawData
          : rawData instanceof Buffer
            ? rawData.toString("utf8")
            : "";
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

    switch (command.type) {
      case "subscribe_conversation":
        this.handleSubscribe(socket, connState, command.payload.conversationId, requestId);
        break;
      case "unsubscribe_conversation":
        this.handleUnsubscribe(socket, connState, command.payload.conversationId, requestId);
        break;
      case "heartbeat":
        this.handleHeartbeat(socket, connState, requestId);
        break;
      case "resume_session":
        this.handleResumeSession(socket, connState, command.payload.sessionToken, requestId);
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
  ): Promise<void> {
    const session = this.requireSession(socket, connState, requestId);
    if (!session) return;

    const authResult = await authorizeConversationSubscription(session, conversationId);
    if (!authResult.allowed) {
      const denied = authResult as import("./subscription-auth").SubscriptionAuthResult & { allowed: false };
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
  ): Promise<void> {
    // If already authenticated, reject duplicate resume.
    if (connState.sessionId) {
      this.sendError(socket, "invalid_command", "session already established", false, connState.sessionId, requestId);
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

    // If the session was evicted but the token is still valid, create a new session record.
    if (!session) {
      session = this.sessions.createSession(claims);
    }

    connState.sessionId = session.sessionId;
    this.sessions.updateHeartbeat(session.sessionId);

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
    for (const conversationId of existingSubs) {
      const reauth = await reauthorizeConversationSubscription(session, conversationId);
      if (!reauth.allowed) {
        const denied = reauth as import("./subscription-auth").SubscriptionAuthResult & { allowed: false };
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
      }
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
      // We close the session but keep the record briefly in case of reconnect.
      // A sweep job will eventually remove stale closed sessions.
      this.sessions.closeSession(connState.sessionId, reason);
    }
    this.wsConnections.delete(socket);
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
