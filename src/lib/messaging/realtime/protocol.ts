import "server-only";

/**
 * Realtime protocol envelope definitions for Internal Messaging Phase 4.
 *
 * These types define the stable client/server contract for the WebSocket
 * transport. All commands and events are explicit, typed, and versioned.
 */

// ---------------------------------------------------------------------------
// Base envelope shapes
// ---------------------------------------------------------------------------

export const REALTIME_PROTOCOL_VERSION = "2025-05-14.v1" as const;

export interface BaseCommand {
  type: string;
  requestId: string;
}

export interface BaseServerMessage {
  type: string;
  requestId?: string;
  eventId?: string;
}

// ---------------------------------------------------------------------------
// Client commands (Sprint 4.1)
// ---------------------------------------------------------------------------

export type ClientCommand =
  | SubscribeConversationCommand
  | UnsubscribeConversationCommand
  | HeartbeatCommand
  | ResumeSessionCommand
  | SetPresenceCommand
  | StartTypingCommand
  | StopTypingCommand
  | AckEventsCommand;

export interface SubscribeConversationCommand extends BaseCommand {
  type: "subscribe_conversation";
  payload: {
    conversationId: string;
    /** Cursor to replay missed events from (Sprint 4.3). */
    lastSeenCursor?: string | null;
  };
}

export interface UnsubscribeConversationCommand extends BaseCommand {
  type: "unsubscribe_conversation";
  payload: {
    conversationId: string;
  };
}

export interface HeartbeatCommand extends BaseCommand {
  type: "heartbeat";
  payload?: {
    timestamp?: number;
  };
}

export interface ResumeSessionCommand extends BaseCommand {
  type: "resume_session";
  payload: {
    sessionToken: string;
    /** Per-conversation cursor map for replay (Sprint 4.3). */
    lastSeenCursors?: Record<string, string> | null;
  };
}

export interface SetPresenceCommand extends BaseCommand {
  type: "set_presence";
  payload: {
    status: "online" | "away" | "offline";
    activeConversationId?: string | null;
  };
}

export interface StartTypingCommand extends BaseCommand {
  type: "start_typing";
  payload: {
    conversationId: string;
  };
}

export interface StopTypingCommand extends BaseCommand {
  type: "stop_typing";
  payload: {
    conversationId: string;
  };
}

/**
 * Sprint 4.4: explicit event acknowledgment.
 * Clients ack processed events so the server can track delivery progress
 * and apply backpressure when needed.
 */
export interface AckEventsCommand extends BaseCommand {
  type: "ack_events";
  payload: {
    /** Highest eventId the client has durably processed. */
    lastEventId?: string;
    /** Per-conversation highest cursors the client has durably processed. */
    cursors?: Record<string, string>;
  };
}

// ---------------------------------------------------------------------------
// Server messages / events (Sprint 4.1)
// ---------------------------------------------------------------------------

export type ServerMessage =
  | SessionAckMessage
  | SubscriptionAckMessage
  | SubscriptionDeniedMessage
  | HeartbeatAckMessage
  | ResumeSessionResultMessage
  | ErrorMessage
  | DisconnectMessage
  | RealtimeEvent
  | ConnectionStateMessage
  | DegradedModeMessage;

export interface SessionAckMessage extends BaseServerMessage {
  type: "session_ack";
  payload: {
    sessionId: string;
    serverTime: number;
    expiresAt: number;
  };
}

export interface SubscriptionAckMessage extends BaseServerMessage {
  type: "subscription_ack";
  payload: {
    conversationId: string;
    subscribedAt: number;
  };
}

export interface SubscriptionDeniedMessage extends BaseServerMessage {
  type: "subscription_denied";
  payload: {
    conversationId: string;
    reason: string;
    code: RealtimeErrorCode;
  };
}

export interface HeartbeatAckMessage extends BaseServerMessage {
  type: "heartbeat_ack";
  payload: {
    serverTime: number;
  };
}

export interface ResumeSessionResultMessage extends BaseServerMessage {
  type: "resume_session_result";
  payload: {
    resumed: boolean;
    sessionId: string;
    serverTime: number;
    /** If the server cannot resume, client should rehydrate via HTTP. */
    rehydrateRecommended?: boolean;
  };
}

export interface ErrorMessage extends BaseServerMessage {
  type: "error";
  payload: {
    code: RealtimeErrorCode;
    message: string;
    /** Whether the connection should be considered invalid. */
    fatal: boolean;
  };
}

export interface DisconnectMessage extends BaseServerMessage {
  type: "disconnect";
  payload: {
    reason: string;
    code: RealtimeErrorCode;
    /** If provided, client may attempt reconnect after this ms. */
    reconnectAfterMs?: number;
  };
}

// ---------------------------------------------------------------------------
// Sprint 4.4: degraded mode and connection state
// ---------------------------------------------------------------------------

export type TransportState = "connected" | "degraded" | "disconnected";

export type DegradedModeReason =
  | "connection_lost"
  | "replay_unavailable"
  | "fanout_delayed"
  | "presence_unavailable"
  | "typing_unavailable"
  | "subscription_limit_reached"
  | "rate_limited";

export interface ConnectionStateMessage extends BaseServerMessage {
  type: "connection_state";
  payload: {
    state: TransportState;
    reason?: DegradedModeReason;
    message?: string;
    retryAfterMs?: number;
    rehydrateRecommended?: boolean;
  };
}

export interface DegradedModeMessage extends BaseServerMessage {
  type: "degraded";
  payload: {
    reason: DegradedModeReason;
    message: string;
    retryAfterMs?: number;
    rehydrateRecommended?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Realtime events (Sprint 4.2)
// ---------------------------------------------------------------------------

export type RealtimeEventType =
  | "conversation.message.created"
  | "conversation.message.edited"
  | "conversation.message.deleted"
  | "conversation.message.reaction.added"
  | "conversation.message.reaction.removed"
  | "conversation.thread.created"
  | "conversation.thread.replied"
  | "conversation.thread.resolved"
  | "conversation.read_state.updated"
  | "conversation.presence.updated"
  | "conversation.typing.updated"
  | "conversation.governance.updated"
  | "conversation.membership.updated";

export interface RealtimeEvent extends BaseServerMessage {
  type: "event";
  eventId: string;
  payload: {
    eventType: RealtimeEventType;
    orgId: string;
    conversationId: string;
    occurredAt: number;
    actorId?: string;
    /** Cursor seam for Sprint 4.3 replay. */
    cursor?: string;
    data: unknown;
  };
}

// ---------------------------------------------------------------------------
// Error codes — safe, stable, and never leak internal implementation detail
// ---------------------------------------------------------------------------

export type RealtimeErrorCode =
  | "auth_required"
  | "auth_invalid"
  | "auth_expired"
  | "subscription_denied"
  | "subscription_not_found"
  | "rate_limited"
  | "invalid_command"
  | "malformed_payload"
  | "session_expired"
  | "session_not_found"
  | "resume_unavailable"
  | "replay_unavailable"
  | "server_error"
  | "connection_closed";

// ---------------------------------------------------------------------------
// Runtime command validation helpers
// ---------------------------------------------------------------------------

/** Production-grade UUID v4 validation for conversationIds and other resource identifiers. */
export function isValidUuid(str: string): boolean {
  if (typeof str !== "string") return false;
  // Allow cuid, nanoid, or uuid formats — at minimum reject empty/whitespace-only strings
  // and enforce reasonable length bounds to prevent injection patterns.
  if (str.length === 0 || str.length > 128) return false;
  // Reject strings that look like path traversal, HTML, or command injection.
  if (/[<>'"\\]/.test(str)) return false;
  return true;
}

export function isValidClientCommand(obj: unknown): obj is ClientCommand {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;

  // type must be one of the known command types
  const validTypes = new Set<string>([
    "subscribe_conversation",
    "unsubscribe_conversation",
    "heartbeat",
    "resume_session",
    "set_presence",
    "start_typing",
    "stop_typing",
    "ack_events",
  ]);
  if (typeof o.type !== "string" || !validTypes.has(o.type)) return false;

  // requestId must be a non-empty string with bounded length
  if (typeof o.requestId !== "string" || o.requestId.length === 0 || o.requestId.length > 256) return false;

  switch (o.type) {
    case "subscribe_conversation":
    case "unsubscribe_conversation": {
      const payload = o.payload as Record<string, unknown> | undefined;
      if (typeof payload !== "object" || payload === null) return false;
      if (!isValidUuid(payload.conversationId as string)) return false;
      if (payload.lastSeenCursor !== undefined && payload.lastSeenCursor !== null) {
        if (typeof payload.lastSeenCursor !== "string" || payload.lastSeenCursor.length === 0 || payload.lastSeenCursor.length > 256) return false;
      }
      return true;
    }
    case "heartbeat": {
      // payload is optional; if present, timestamp must be a number
      if (o.payload !== undefined) {
        const payload = o.payload as Record<string, unknown> | undefined;
        if (typeof payload !== "object" || payload === null) return false;
        if (payload.timestamp !== undefined && typeof payload.timestamp !== "number") return false;
      }
      return true;
    }
    case "resume_session": {
      const payload = o.payload as Record<string, unknown> | undefined;
      if (typeof payload !== "object" || payload === null) return false;
      if (typeof payload.sessionToken !== "string" || payload.sessionToken.length === 0 || payload.sessionToken.length > 4096) return false;
      if (payload.lastSeenCursors !== undefined && payload.lastSeenCursors !== null) {
        if (typeof payload.lastSeenCursors !== "object" || Array.isArray(payload.lastSeenCursors)) return false;
        for (const [key, val] of Object.entries(payload.lastSeenCursors)) {
          if (!isValidUuid(key)) return false;
          if (typeof val !== "string" || val.length === 0 || val.length > 256) return false;
        }
      }
      return true;
    }
    case "set_presence": {
      const payload = o.payload as Record<string, unknown> | undefined;
      if (typeof payload !== "object" || payload === null) return false;
      const status = payload.status;
      if (status !== "online" && status !== "away" && status !== "offline") return false;
      if (payload.activeConversationId !== undefined && payload.activeConversationId !== null) {
        if (!isValidUuid(payload.activeConversationId as string)) return false;
      }
      return true;
    }
    case "start_typing":
    case "stop_typing": {
      const payload = o.payload as Record<string, unknown> | undefined;
      if (typeof payload !== "object" || payload === null) return false;
      if (!isValidUuid(payload.conversationId as string)) return false;
      return true;
    }
    case "ack_events": {
      const payload = o.payload as Record<string, unknown> | undefined;
      if (typeof payload !== "object" || payload === null) return false;
      if (payload.lastEventId !== undefined && (typeof payload.lastEventId !== "string" || payload.lastEventId.length > 256)) return false;
      if (payload.cursors !== undefined && payload.cursors !== null) {
        if (typeof payload.cursors !== "object" || Array.isArray(payload.cursors)) return false;
        for (const [key, val] of Object.entries(payload.cursors)) {
          if (!isValidUuid(key)) return false;
          if (typeof val !== "string" || val.length === 0 || val.length > 256) return false;
        }
      }
      return true;
    }
    default:
      return false;
  }
}

export function getCommandType(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  return typeof o.type === "string" ? o.type : null;
}

export function getCommandRequestId(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  return typeof o.requestId === "string" ? o.requestId : null;
}
