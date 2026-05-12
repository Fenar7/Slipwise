import "server-only";

/**
 * Sprint 3.4 — Sync failure classification, recovery rules, and state transitions.
 *
 * This module codifies how the product reacts to every sync failure class.
 * It is the single source of truth for:
 *   - mapping raw provider errors to domain failure classes
 *   - deciding whether to retry, replay, reconnect, or block
 *   - deciding what connection state to enter after a failure
 *   - deciding what connection state to clear after recovery
 *
 * Rules:
 * - No UI-facing code here. This is domain logic only.
 * - All decisions are deterministic and testable.
 * - Stringly-typed blobs are forbidden; use the typed unions below.
 */

import type { MailboxProviderErrorCategory } from "./provider-contracts";

// ─── Domain failure classes ───────────────────────────────────────────────────

/**
 * Product-level failure classes for mailbox sync and recovery.
 *
 * These are coarser than provider error categories because the product
 * behavior (retry, replay, reconnect) is what matters to callers.
 */
export type MailboxSyncFailureClass =
  | "auth_expired" // token revoked or expired → reconnect required
  | "auth_insufficient" // missing scopes → reconnect required
  | "cursor_invalid" // delta cursor expired or history lost → replay required
  | "transient" // temporary provider/network failure → retry allowed
  | "rate_limited" // provider rate limit or quota → retry allowed with backoff
  | "unknown"; // unclassified → safe degraded, no blind retry

/**
 * The recovery action the product should surface for a failure class.
 */
export type MailboxRecoveryAction =
  | "retry" // transient / rate-limited → retry sync
  | "replay" // cursor invalid → reset cursor and run initial sync
  | "reconnect" // auth issue → re-authorize via OAuth
  | "none"; // no action possible / nothing needed

// ─── Classification ───────────────────────────────────────────────────────────

/**
 * Map a provider error category to the product-level failure class.
 *
 * This is the ONLY place where provider categories are translated into
 * mailbox sync semantics. If a new provider is added, this mapping may
 * need to be extended, but the rest of the codebase stays unchanged.
 */
export function classifyProviderError(
  category: MailboxProviderErrorCategory,
): MailboxSyncFailureClass {
  switch (category) {
    case "auth_expired":
      return "auth_expired";
    case "auth_insufficient":
      return "auth_insufficient";
    case "watch_expired":
      return "cursor_invalid";
    case "rate_limited":
      return "rate_limited";
    case "quota_exceeded":
      return "rate_limited";
    case "provider_unavailable":
      return "transient";
    case "not_found":
      // In sync context, not_found usually means a thread/message was
      // deleted between list and detail fetch. Treat as transient
      // because the next delta sync will skip it.
      return "transient";
    case "unknown":
      return "unknown";
    default:
      return "unknown";
  }
}

// ─── Recovery rules ───────────────────────────────────────────────────────────

/**
 * Resolve the recovery action for a failure class.
 */
export function resolveRecoveryAction(
  failureClass: MailboxSyncFailureClass,
): MailboxRecoveryAction {
  switch (failureClass) {
    case "auth_expired":
    case "auth_insufficient":
      return "reconnect";
    case "cursor_invalid":
      return "replay";
    case "transient":
    case "rate_limited":
      return "retry";
    case "unknown":
      return "none";
    default:
      return "none";
  }
}

/**
 * Whether a retry is expected to be safe for this failure class.
 *
 * Retry is safe when the failure is likely transient and does not
 * depend on mutable external state (auth, cursors).
 */
export function isRetryAllowed(
  failureClass: MailboxSyncFailureClass,
): boolean {
  return failureClass === "transient" || failureClass === "rate_limited";
}

/**
 * Whether a full replay (clear cursor + initial sync) is required.
 */
export function isReplayRequired(
  failureClass: MailboxSyncFailureClass,
): boolean {
  return failureClass === "cursor_invalid";
}

/**
 * Whether the user/admin must re-authorize the mailbox.
 */
export function isReconnectRequired(
  failureClass: MailboxSyncFailureClass,
): boolean {
  return failureClass === "auth_expired" || failureClass === "auth_insufficient";
}

/**
 * Whether the failure should put the connection into a degraded state.
 *
 * Degraded means "still connected but sync is struggling".
 * We do NOT degrade on auth issues (those go straight to RECONNECT_REQUIRED).
 * We do NOT degrade on cursor invalid (the next sync will be INITIAL).
 * We do NOT degrade on concurrent sync (that's not a failure of the connection).
 */
export function shouldDegradeConnection(
  failureClass: MailboxSyncFailureClass,
): boolean {
  return (
    failureClass === "transient" ||
    failureClass === "rate_limited" ||
    failureClass === "unknown"
  );
}

// ─── State transition rules ───────────────────────────────────────────────────

/**
 * Given a current connection status and a failure class, compute the
 * target status after a sync failure.
 *
 * Rules:
 * - ACTIVE + auth failure → RECONNECT_REQUIRED
 * - ACTIVE + degrading failure → DEGRADED
 * - DEGRADED + degrading failure → DEGRADED (stay)
 * - DEGRADED + auth failure → RECONNECT_REQUIRED
 * - RECONNECT_REQUIRED + anything → RECONNECT_REQUIRED (sticky)
 * - DISCONNECTED + anything → DISCONNECTED (sticky)
 * - cursor_invalid → preserve current status (next sync will be INITIAL)
 */
export function resolveStatusAfterFailure(
  currentStatus: "ACTIVE" | "DEGRADED" | "RECONNECT_REQUIRED" | "DISCONNECTED",
  failureClass: MailboxSyncFailureClass,
): "ACTIVE" | "DEGRADED" | "RECONNECT_REQUIRED" | "DISCONNECTED" {
  if (currentStatus === "DISCONNECTED") return "DISCONNECTED";
  if (currentStatus === "RECONNECT_REQUIRED") return "RECONNECT_REQUIRED";

  if (isReconnectRequired(failureClass)) return "RECONNECT_REQUIRED";
  if (shouldDegradeConnection(failureClass)) return "DEGRADED";

  // cursor_invalid and any unhandled cases: keep current status so the
  // next sync attempt can fall back to INITIAL without alarming the user.
  return currentStatus;
}

/**
 * Whether a successful sync should clear a previously degraded/error state.
 *
 * A successful sync ALWAYS clears error text and category.
 * It clears DEGRADED → ACTIVE, but leaves RECONNECT_REQUIRED and DISCONNECTED
 * alone because those require explicit admin action.
 */
export function resolveStatusAfterSuccess(
  currentStatus: "ACTIVE" | "DEGRADED" | "RECONNECT_REQUIRED" | "DISCONNECTED",
): "ACTIVE" | "DEGRADED" | "RECONNECT_REQUIRED" | "DISCONNECTED" {
  if (currentStatus === "DEGRADED") return "ACTIVE";
  return currentStatus;
}

// ─── Sync mode rules ──────────────────────────────────────────────────────────

/**
 * Determine the sync mode to use for a recovery action.
 *
 * - retry  → keep the mode that would have been used (auto-resolve)
 * - replay → force INITIAL (cursor will be cleared by caller)
 * - reconnect → no sync mode (auth flow, not a sync)
 */
export function resolveRecoverySyncMode(
  recoveryAction: MailboxRecoveryAction,
  previousMode: "INITIAL" | "DELTA",
): "INITIAL" | "DELTA" {
  if (recoveryAction === "replay") return "INITIAL";
  if (recoveryAction === "retry") return previousMode;
  // reconnect / none → not applicable; return previousMode for type safety
  return previousMode;
}

// ─── Safe summaries ───────────────────────────────────────────────────────────

/**
 * Human-readable summary for a failure class.
 * Safe for UI and audit surfaces. No raw provider internals.
 */
export function getFailureClassSummary(
  failureClass: MailboxSyncFailureClass,
): string {
  switch (failureClass) {
    case "auth_expired":
      return "Mailbox authorization has expired. Please reconnect.";
    case "auth_insufficient":
      return "Mailbox authorization is missing required permissions. Please reconnect.";
    case "cursor_invalid":
      return "Sync history has expired. A full resync is required.";
    case "transient":
      return "A temporary error occurred while syncing. Please try again.";
    case "rate_limited":
      return "The provider rate limit was reached. Please wait a moment and retry.";
    case "unknown":
      return "An unexpected error occurred during sync. Please contact support if this persists.";
    default:
      return "Sync failed.";
  }
}

/**
 * Human-readable summary for a recovery action.
 */
export function getRecoveryActionSummary(
  action: MailboxRecoveryAction,
): string {
  switch (action) {
    case "retry":
      return "Retrying sync may resolve the issue.";
    case "replay":
      return "A full resync is required to restore incremental sync.";
    case "reconnect":
      return "Please reconnect the mailbox to restore access.";
    case "none":
      return "No automatic recovery is available.";
    default:
      return "";
  }
}
