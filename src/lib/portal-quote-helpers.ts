/**
 * Portal Quote Helpers — Centralized actionability, visibility, and status semantics
 * for the Client Hub quote response experience.
 *
 * All helpers are pure/deterministic and designed to be used from both
 * server actions and page components. They never trust client input.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuoteStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CONVERTED";

export type QuoteStaleOutcome = "already_accepted" | "already_declined" | "expired" | "converted";

export interface QuoteLike {
  status: QuoteStatus | string;
  validUntil: Date | string;
}

export type PortalQuoteDisplayStatus =
  | "awaiting_response"
  | "accepted"
  | "declined"
  | "expired"
  | "converted"
  | "draft"
  | "unknown";

// ─── Status Semantics ─────────────────────────────────────────────────────────

/**
 * Maps a raw quote status to a customer-safe display status.
 * Never exposes internal-only states or admin workflow details.
 */
export function getQuoteDisplayStatus(
  status: QuoteStatus | string,
): PortalQuoteDisplayStatus {
  switch (status) {
    case "SENT":
      return "awaiting_response";
    case "ACCEPTED":
      return "accepted";
    case "DECLINED":
      return "declined";
    case "EXPIRED":
      return "expired";
    case "CONVERTED":
      return "converted";
    case "DRAFT":
      return "draft";
    default:
      return "unknown";
  }
}

/**
 * Human-readable label for a quote status, safe for customer display.
 */
export function getQuoteStatusLabel(status: QuoteStatus | string): string {
  switch (status) {
    case "SENT":
      return "Awaiting Response";
    case "ACCEPTED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
    case "EXPIRED":
      return "Expired";
    case "CONVERTED":
      return "Converted to Invoice";
    case "DRAFT":
      return "Draft";
    default:
      return "Unknown";
  }
}

/**
 * Tailwind class string for a quote status badge.
 * Uses the Client Hub color system where possible.
 */
export function getQuoteStatusBadgeClass(status: QuoteStatus | string): string {
  switch (status) {
    case "SENT":
      return "bg-sky-50 text-sky-700 ring-sky-100/80";
    case "ACCEPTED":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100/80";
    case "DECLINED":
      return "bg-rose-50 text-rose-700 ring-rose-100/80";
    case "EXPIRED":
      return "bg-slate-100 text-slate-500 ring-slate-200/80";
    case "CONVERTED":
      return "bg-teal-50 text-teal-700 ring-teal-100/80";
    case "DRAFT":
      return "bg-slate-100 text-slate-600 ring-slate-200/80";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200/80";
  }
}

// ─── Actionability Guards ─────────────────────────────────────────────────────

/**
 * Server-side expiry check. Computes against the current instant,
 * not a client-provided value.
 */
export function isQuoteExpired(validUntil: Date | string): boolean {
  const expiry = validUntil instanceof Date ? validUntil : new Date(validUntil);
  return expiry.getTime() < Date.now();
}

/**
 * Centralized "can this customer act on this quote right now?" check.
 *
 * A quote is actionable when ALL of:
 * - Policy allows quote acceptance (portalQuoteAcceptanceEnabled)
 * - Status is SENT (awaiting customer response)
 * - validUntil is in the future (not expired)
 *
 * This single function must be the source of truth for:
 * - Quote list (whether to show action indicators)
 * - Quote detail (whether to show accept/reject controls)
 * - Accept/decline mutations (server-side guard)
 *
 * Keeping this centralized prevents list/detail/mutations from drifting.
 */
export function canQuoteBeRespondedTo(
  status: QuoteStatus | string,
  validUntil: Date | string,
  policyEnabled: boolean,
): boolean {
  if (!policyEnabled) return false;
  if (status !== "SENT") return false;
  if (isQuoteExpired(validUntil)) return false;
  return true;
}

/**
 * Determines whether a quote should be visible to a portal customer.
 * DRAFT quotes are never visible in the portal.
 */
export function isQuoteVisibleToPortal(
  status: QuoteStatus | string,
): boolean {
  return status !== "DRAFT";
}

/**
 * Returns a safe, customer-facing explanation for why a quote
 * cannot be responded to. Returns null if the quote IS actionable.
 */
export function getQuoteActionabilityReason(
  status: QuoteStatus | string,
  validUntil: Date | string,
  policyEnabled: boolean,
): string | null {
  if (!policyEnabled) {
    return "Quote responses are not currently enabled for this portal.";
  }
  if (status === "ACCEPTED") {
    return "This quote has already been accepted.";
  }
  if (status === "DECLINED") {
    return "This quote has already been declined.";
  }
  if (status === "EXPIRED") {
    return "This quote has expired and is no longer available for response.";
  }
  if (status === "CONVERTED") {
    return "This quote was accepted and has been converted to an invoice.";
  }
  if (status === "DRAFT") {
    return "This quote has not been sent yet.";
  }
  if (status === "SENT" && isQuoteExpired(validUntil)) {
    return "This quote expired and is no longer available for response.";
  }
  if (status !== "SENT") {
    return "This quote is not available for response.";
  }
  return null;
}

// ─── Stale Outcome Messaging ──────────────────────────────────────────────────

/**
 * Maps a server-returned QuoteStaleOutcome to a safe, customer-facing message.
 * Never exposes internal-only statuses or raw DB values.
 *
 * Used by both Client Hub and legacy portal quote response UIs to ensure
 * truthful messaging when a quote action is submitted against a stale state.
 */
export function getStaleOutcomeMessage(outcome: QuoteStaleOutcome): string {
  switch (outcome) {
    case "already_accepted":
      return "This quote has already been accepted.";
    case "already_declined":
      return "This quote has already been declined.";
    case "expired":
      return "This quote has expired and is no longer available for response.";
    case "converted":
      return "This quote was accepted and converted to an invoice.";
  }
}

// ─── Input Validation ─────────────────────────────────────────────────────────

const DECLINE_REASON_MAX_LENGTH = 2000;

/**
 * Normalizes and validates a decline reason from portal customer input.
 * - Trims leading/trailing whitespace
 * - Converts empty or whitespace-only input to null
 * - Enforces a reasonable maximum length
 * - Returns a safe error for oversized input
 *
 * Returns `{ valid: true, reason: string | null }` on success,
 * or `{ valid: false, error: string }` on validation failure.
 */
export function normalizeDeclineReason(
  raw: string | undefined | null,
): { valid: true; reason: string | null } | { valid: false; error: string } {
  if (raw === undefined || raw === null) {
    return { valid: true, reason: null };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { valid: true, reason: null };
  }

  if (trimmed.length > DECLINE_REASON_MAX_LENGTH) {
    return {
      valid: false,
      error: `Decline reason must be ${DECLINE_REASON_MAX_LENGTH} characters or fewer.`,
    };
  }

  return { valid: true, reason: trimmed };
}
