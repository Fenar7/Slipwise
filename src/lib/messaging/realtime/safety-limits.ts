import "server-only";

/**
 * Operational safety limits and backpressure configuration.
 *
 * These limits are intentionally centralized so they can be adjusted
 * without scattering ad hoc checks across the gateway.
 *
 * All limits are per-session unless otherwise noted.
 */

export interface SafetyLimits {
  /** Maximum conversations a single session may subscribe to. */
  maxSubscriptionsPerSession: number;
  /** Maximum commands per window before rate limiting. */
  maxCommandsPerWindow: number;
  /** Command rate limit window in milliseconds. */
  commandWindowMs: number;
  /** Maximum events to queue for a single socket before dropping. */
  maxEventQueueDepth: number;
  /** Maximum payload size for a single WebSocket message (bytes). */
  maxMessagePayloadBytes: number;
  /** Maximum resume_session attempts per minute. */
  maxResumeAttemptsPerMinute: number;
  /** Maximum typing start commands per window. */
  maxTypingCommandsPerWindow: number;
  /** Typing command rate limit window in milliseconds. */
  typingWindowMs: number;
}

export const DEFAULT_SAFETY_LIMITS: SafetyLimits = {
  maxSubscriptionsPerSession: 50,
  maxCommandsPerWindow: 120,
  commandWindowMs: 60_000,
  maxEventQueueDepth: 500,
  maxMessagePayloadBytes: 65_536,
  maxResumeAttemptsPerMinute: 10,
  maxTypingCommandsPerWindow: 30,
  typingWindowMs: 60_000,
};

// ---------------------------------------------------------------------------
// Rate-limit tracking (in-memory, per-session)
// ---------------------------------------------------------------------------

export interface RateLimitWindow {
  count: number;
  windowStart: number;
}

export class SessionRateLimiter {
  private commandWindow: RateLimitWindow = { count: 0, windowStart: 0 };
  private typingWindow: RateLimitWindow = { count: 0, windowStart: 0 };
  private resumeAttempts: Array<number> = [];

  constructor(private limits: SafetyLimits) {}

  /** Check if a generic command is allowed. */
  checkCommandAllowed(): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    if (now - this.commandWindow.windowStart > this.limits.commandWindowMs) {
      this.commandWindow = { count: 0, windowStart: now };
    }

    const allowed = this.commandWindow.count < this.limits.maxCommandsPerWindow;
    const remaining = Math.max(0, this.limits.maxCommandsPerWindow - this.commandWindow.count);
    const resetAt = this.commandWindow.windowStart + this.limits.commandWindowMs;

    if (allowed) {
      this.commandWindow.count++;
    }

    return { allowed, remaining, resetAt };
  }

  /** Check if a typing command is allowed. */
  checkTypingAllowed(): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    if (now - this.typingWindow.windowStart > this.limits.typingWindowMs) {
      this.typingWindow = { count: 0, windowStart: now };
    }

    const allowed = this.typingWindow.count < this.limits.maxTypingCommandsPerWindow;
    const remaining = Math.max(0, this.limits.maxTypingCommandsPerWindow - this.typingWindow.count);
    const resetAt = this.typingWindow.windowStart + this.limits.typingWindowMs;

    if (allowed) {
      this.typingWindow.count++;
    }

    return { allowed, remaining, resetAt };
  }

  /** Check if a resume attempt is allowed. */
  checkResumeAllowed(): { allowed: boolean; remaining: number } {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;
    this.resumeAttempts = this.resumeAttempts.filter((t) => t > oneMinuteAgo);

    const allowed = this.resumeAttempts.length < this.limits.maxResumeAttemptsPerMinute;
    const remaining = Math.max(0, this.limits.maxResumeAttemptsPerMinute - this.resumeAttempts.length);

    if (allowed) {
      this.resumeAttempts.push(now);
    }

    return { allowed, remaining };
  }

  /** Reset all windows (e.g., on session close). */
  reset(): void {
    this.commandWindow = { count: 0, windowStart: 0 };
    this.typingWindow = { count: 0, windowStart: 0 };
    this.resumeAttempts = [];
  }
}

// ---------------------------------------------------------------------------
// Backpressure state
// ---------------------------------------------------------------------------

export interface BackpressureState {
  /** Whether the transport is currently applying backpressure. */
  active: boolean;
  /** Reason for backpressure. */
  reason: "queue_full" | "socket_slow" | "memory_pressure" | null;
  /** Number of events sent but not yet acknowledged by the client. */
  outstandingEvents: number;
  /** Number of events dropped due to backpressure in this session. */
  droppedEvents: number;
}

export function createBackpressureState(): BackpressureState {
  return {
    active: false,
    reason: null,
    outstandingEvents: 0,
    droppedEvents: 0,
  };
}
