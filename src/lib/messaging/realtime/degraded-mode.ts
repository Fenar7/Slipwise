import "server-only";

import type { RealtimeErrorCode } from "./protocol";

/**
 * Degraded-mode state model and explicit recovery behavior.
 *
 * Goals:
 * - Make transport degradation explicit to clients, not silent.
 * - Preserve message correctness even when presence/typing/replay are impaired.
 * - Define clear recovery paths via authoritative HTTP APIs.
 * - Provide typed reason codes for diagnostics and supportability.
 *
 * Degraded modes:
 * - CONNECTION_LOST: websocket disconnected, client should reconnect.
 * - REPLAY_UNAVAILABLE: cursor invalid/stale, client should rehydrate via HTTP.
 * - FANOUT_DELAYED: events are being queued but delivery is slow.
 * - PRESENCE_UNAVAILABLE: presence updates are temporarily not propagated.
 * - TYPING_UNAVAILABLE: typing indicators are temporarily not propagated.
 * - SUBSCRIPTION_LIMIT_REACHED: too many subscriptions, further subs denied.
 * - RATE_LIMITED: command rate limit exceeded, backoff required.
 */

export type DegradedModeReason =
  | "connection_lost"
  | "replay_unavailable"
  | "fanout_delayed"
  | "presence_unavailable"
  | "typing_unavailable"
  | "subscription_limit_reached"
  | "rate_limited";

export interface DegradedState {
  degraded: true;
  reason: DegradedModeReason;
  /** Human-readable context for clients. */
  message: string;
  /** If provided, client may retry/reconnect after this ms. */
  retryAfterMs?: number;
  /** If true, client should rehydrate conversation state via HTTP. */
  rehydrateRecommended?: boolean;
  /** Error code for protocol compatibility. */
  code: RealtimeErrorCode;
}

export interface HealthyState {
  degraded: false;
}

export type TransportHealthState = HealthyState | DegradedState;

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

export function makeDegradedState(
  reason: DegradedModeReason,
  overrides?: Partial<DegradedState>,
): DegradedState {
  const base: Record<DegradedModeReason, DegradedState> = {
    connection_lost: {
      degraded: true,
      reason: "connection_lost",
      message: "Realtime connection interrupted. Reconnecting...",
      code: "connection_closed",
      retryAfterMs: 2000,
    },
    replay_unavailable: {
      degraded: true,
      reason: "replay_unavailable",
      message: "Event history is unavailable. Fetching latest state...",
      code: "replay_unavailable",
      rehydrateRecommended: true,
      retryAfterMs: 0,
    },
    fanout_delayed: {
      degraded: true,
      reason: "fanout_delayed",
      message: "Live updates are delayed. Recent messages may appear shortly.",
      code: "server_error",
      retryAfterMs: 5000,
    },
    presence_unavailable: {
      degraded: true,
      reason: "presence_unavailable",
      message: "Presence status is temporarily unavailable.",
      code: "server_error",
    },
    typing_unavailable: {
      degraded: true,
      reason: "typing_unavailable",
      message: "Typing indicators are temporarily unavailable.",
      code: "server_error",
    },
    subscription_limit_reached: {
      degraded: true,
      reason: "subscription_limit_reached",
      message: "Conversation subscription limit reached. Unsubscribe before adding more.",
      code: "subscription_denied",
      retryAfterMs: 0,
    },
    rate_limited: {
      degraded: true,
      reason: "rate_limited",
      message: "Too many commands. Please slow down.",
      code: "rate_limited",
      retryAfterMs: 5000,
    },
  };

  return { ...base[reason], ...overrides };
}

export function makeHealthyState(): HealthyState {
  return { degraded: false };
}

// ---------------------------------------------------------------------------
// Server-to-client degraded mode messages
// ---------------------------------------------------------------------------

export interface ConnectionStateMessage {
  type: "connection_state";
  payload: {
    state: "connected" | "degraded" | "disconnected";
    reason?: DegradedModeReason;
    message?: string;
    retryAfterMs?: number;
    rehydrateRecommended?: boolean;
  };
}

export interface DegradedModeMessage {
  type: "degraded";
  payload: {
    reason: DegradedModeReason;
    message: string;
    retryAfterMs?: number;
    rehydrateRecommended?: boolean;
  };
}

// ---------------------------------------------------------------------------
// Advisory degradation helpers
// ---------------------------------------------------------------------------

/**
 * Determine whether a degraded reason affects message correctness.
 * Returns true if the degradation is advisory-only (presence/typing).
 */
export function isAdvisoryDegradation(reason: DegradedModeReason): boolean {
  return reason === "presence_unavailable" || reason === "typing_unavailable";
}

/**
 * Determine whether a degraded reason requires HTTP rehydration.
 */
export function requiresRehydration(reason: DegradedModeReason): boolean {
  return reason === "replay_unavailable" || reason === "connection_lost";
}
