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
  | ResumeSessionCommand;

export interface SubscribeConversationCommand extends BaseCommand {
  type: "subscribe_conversation";
  payload: {
    conversationId: string;
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
    lastSeenCursor?: string | null;
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
  | DisconnectMessage;

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
  | "server_error"
  | "connection_closed";

// ---------------------------------------------------------------------------
// Runtime command validation helpers
// ---------------------------------------------------------------------------

export function isValidClientCommand(obj: unknown): obj is ClientCommand {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.type !== "string") return false;
  if (typeof o.requestId !== "string" || o.requestId.length === 0) return false;

  switch (o.type) {
    case "subscribe_conversation":
    case "unsubscribe_conversation": {
      const payload = o.payload as Record<string, unknown> | undefined;
      return (
        typeof payload === "object" &&
        payload !== null &&
        typeof payload.conversationId === "string" &&
        payload.conversationId.length > 0
      );
    }
    case "heartbeat": {
      return true; // payload is optional
    }
    case "resume_session": {
      const payload = o.payload as Record<string, unknown> | undefined;
      return (
        typeof payload === "object" &&
        payload !== null &&
        typeof payload.sessionToken === "string" &&
        payload.sessionToken.length > 0
      );
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
