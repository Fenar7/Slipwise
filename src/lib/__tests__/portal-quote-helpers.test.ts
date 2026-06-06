/**
 * Portal Quote Helpers — Unit Tests
 *
 * Covers: actionability, visibility, status semantics, expiry checks,
 * and customer-facing reason strings.
 */

import { describe, it, expect } from "vitest";
import {
  getQuoteDisplayStatus,
  getQuoteStatusLabel,
  getQuoteStatusBadgeClass,
  isQuoteExpired,
  canQuoteBeRespondedTo,
  isQuoteVisibleToPortal,
  getQuoteActionabilityReason,
  getStaleOutcomeMessage,
  normalizeDeclineReason,
} from "../portal-quote-helpers";

// ─── getQuoteDisplayStatus ────────────────────────────────────────────────────

describe("getQuoteDisplayStatus", () => {
  it("maps SENT to awaiting_response", () => {
    expect(getQuoteDisplayStatus("SENT")).toBe("awaiting_response");
  });

  it("maps ACCEPTED to accepted", () => {
    expect(getQuoteDisplayStatus("ACCEPTED")).toBe("accepted");
  });

  it("maps DECLINED to declined", () => {
    expect(getQuoteDisplayStatus("DECLINED")).toBe("declined");
  });

  it("maps EXPIRED to expired", () => {
    expect(getQuoteDisplayStatus("EXPIRED")).toBe("expired");
  });

  it("maps CONVERTED to converted", () => {
    expect(getQuoteDisplayStatus("CONVERTED")).toBe("converted");
  });

  it("maps DRAFT to draft", () => {
    expect(getQuoteDisplayStatus("DRAFT")).toBe("draft");
  });

  it("maps unknown status to unknown", () => {
    expect(getQuoteDisplayStatus("CUSTOM_STATUS")).toBe("unknown");
  });
});

// ─── getQuoteStatusLabel ──────────────────────────────────────────────────────

describe("getQuoteStatusLabel", () => {
  it("returns Awaiting Response for SENT", () => {
    expect(getQuoteStatusLabel("SENT")).toBe("Awaiting Response");
  });

  it("returns Accepted for ACCEPTED", () => {
    expect(getQuoteStatusLabel("ACCEPTED")).toBe("Accepted");
  });

  it("returns Declined for DECLINED", () => {
    expect(getQuoteStatusLabel("DECLINED")).toBe("Declined");
  });

  it("returns Expired for EXPIRED", () => {
    expect(getQuoteStatusLabel("EXPIRED")).toBe("Expired");
  });

  it("returns Converted to Invoice for CONVERTED", () => {
    expect(getQuoteStatusLabel("CONVERTED")).toBe("Converted to Invoice");
  });

  it("returns Draft for DRAFT", () => {
    expect(getQuoteStatusLabel("DRAFT")).toBe("Draft");
  });

  it("returns Unknown for unrecognized status", () => {
    expect(getQuoteStatusLabel("BOGUS")).toBe("Unknown");
  });
});

// ─── getQuoteStatusBadgeClass ─────────────────────────────────────────────────

describe("getQuoteStatusBadgeClass", () => {
  it("returns sky classes for SENT", () => {
    const cls = getQuoteStatusBadgeClass("SENT");
    expect(cls).toContain("sky");
  });

  it("returns emerald classes for ACCEPTED", () => {
    const cls = getQuoteStatusBadgeClass("ACCEPTED");
    expect(cls).toContain("emerald");
  });

  it("returns rose classes for DECLINED", () => {
    const cls = getQuoteStatusBadgeClass("DECLINED");
    expect(cls).toContain("rose");
  });

  it("returns slate classes for EXPIRED", () => {
    const cls = getQuoteStatusBadgeClass("EXPIRED");
    expect(cls).toContain("slate");
  });

  it("returns teal classes for CONVERTED", () => {
    const cls = getQuoteStatusBadgeClass("CONVERTED");
    expect(cls).toContain("teal");
  });
});

// ─── isQuoteExpired ───────────────────────────────────────────────────────────

describe("isQuoteExpired", () => {
  it("returns true when validUntil is in the past", () => {
    const past = new Date(Date.now() - 86_400_000);
    expect(isQuoteExpired(past)).toBe(true);
  });

  it("returns false when validUntil is in the future", () => {
    const future = new Date(Date.now() + 86_400_000);
    expect(isQuoteExpired(future)).toBe(false);
  });

  it("returns true when validUntil is exactly now (past boundary)", () => {
    const now = new Date(Date.now() - 1);
    expect(isQuoteExpired(now)).toBe(true);
  });

  it("accepts ISO date strings", () => {
    const pastStr = new Date(Date.now() - 86_400_000).toISOString();
    expect(isQuoteExpired(pastStr)).toBe(true);
  });

  it("accepts future ISO date strings", () => {
    const futureStr = new Date(Date.now() + 86_400_000).toISOString();
    expect(isQuoteExpired(futureStr)).toBe(false);
  });
});

// ─── canQuoteBeRespondedTo ────────────────────────────────────────────────────

describe("canQuoteBeRespondedTo", () => {
  const futureDate = new Date(Date.now() + 86_400_000);
  const pastDate = new Date(Date.now() - 86_400_000);

  it("returns true for SENT + future + policy enabled", () => {
    expect(canQuoteBeRespondedTo("SENT", futureDate, true)).toBe(true);
  });

  it("returns false when policy is disabled", () => {
    expect(canQuoteBeRespondedTo("SENT", futureDate, false)).toBe(false);
  });

  it("returns false when status is ACCEPTED", () => {
    expect(canQuoteBeRespondedTo("ACCEPTED", futureDate, true)).toBe(false);
  });

  it("returns false when status is DECLINED", () => {
    expect(canQuoteBeRespondedTo("DECLINED", futureDate, true)).toBe(false);
  });

  it("returns false when status is EXPIRED", () => {
    expect(canQuoteBeRespondedTo("EXPIRED", futureDate, true)).toBe(false);
  });

  it("returns false when status is CONVERTED", () => {
    expect(canQuoteBeRespondedTo("CONVERTED", futureDate, true)).toBe(false);
  });

  it("returns false when status is DRAFT", () => {
    expect(canQuoteBeRespondedTo("DRAFT", futureDate, true)).toBe(false);
  });

  it("returns false when SENT but expired", () => {
    expect(canQuoteBeRespondedTo("SENT", pastDate, true)).toBe(false);
  });

  it("returns false for unrecognized status", () => {
    expect(canQuoteBeRespondedTo("CUSTOM", futureDate, true)).toBe(false);
  });
});

// ─── isQuoteVisibleToPortal ───────────────────────────────────────────────────

describe("isQuoteVisibleToPortal", () => {
  it("returns true for SENT", () => {
    expect(isQuoteVisibleToPortal("SENT")).toBe(true);
  });

  it("returns true for ACCEPTED", () => {
    expect(isQuoteVisibleToPortal("ACCEPTED")).toBe(true);
  });

  it("returns true for DECLINED", () => {
    expect(isQuoteVisibleToPortal("DECLINED")).toBe(true);
  });

  it("returns true for EXPIRED", () => {
    expect(isQuoteVisibleToPortal("EXPIRED")).toBe(true);
  });

  it("returns true for CONVERTED", () => {
    expect(isQuoteVisibleToPortal("CONVERTED")).toBe(true);
  });

  it("returns false for DRAFT", () => {
    expect(isQuoteVisibleToPortal("DRAFT")).toBe(false);
  });
});

// ─── getQuoteActionabilityReason ──────────────────────────────────────────────

describe("getQuoteActionabilityReason", () => {
  const futureDate = new Date(Date.now() + 86_400_000);
  const pastDate = new Date(Date.now() - 86_400_000);

  it("returns null when quote is actionable", () => {
    expect(getQuoteActionabilityReason("SENT", futureDate, true)).toBeNull();
  });

  it("returns reason when policy is disabled", () => {
    const reason = getQuoteActionabilityReason("SENT", futureDate, false);
    expect(reason).toContain("not currently enabled");
  });

  it("returns reason when already accepted", () => {
    const reason = getQuoteActionabilityReason("ACCEPTED", futureDate, true);
    expect(reason).toContain("already been accepted");
  });

  it("returns reason when already declined", () => {
    const reason = getQuoteActionabilityReason("DECLINED", futureDate, true);
    expect(reason).toContain("already been declined");
  });

  it("returns reason when expired (status)", () => {
    const reason = getQuoteActionabilityReason("EXPIRED", futureDate, true);
    expect(reason).toContain("expired");
  });

  it("returns reason when converted", () => {
    const reason = getQuoteActionabilityReason("CONVERTED", futureDate, true);
    expect(reason).toContain("converted to an invoice");
  });

  it("returns reason when draft", () => {
    const reason = getQuoteActionabilityReason("DRAFT", futureDate, true);
    expect(reason).toContain("not been sent yet");
  });

  it("returns reason when SENT but expired by date", () => {
    const reason = getQuoteActionabilityReason("SENT", pastDate, true);
    expect(reason).toContain("expired");
  });

  it("returns generic reason for unrecognized status", () => {
    const reason = getQuoteActionabilityReason("CUSTOM", futureDate, true);
    expect(reason).toContain("not available for response");
  });
});

// ─── getStaleOutcomeMessage ────────────────────────────────────────────────────

describe("getStaleOutcomeMessage", () => {
  it("returns already accepted message", () => {
    expect(getStaleOutcomeMessage("already_accepted")).toBe("This quote has already been accepted.");
  });

  it("returns already declined message", () => {
    expect(getStaleOutcomeMessage("already_declined")).toBe("This quote has already been declined.");
  });

  it("returns expired message", () => {
    expect(getStaleOutcomeMessage("expired")).toBe("This quote has expired and is no longer available for response.");
  });

  it("returns converted message", () => {
    expect(getStaleOutcomeMessage("converted")).toBe("This quote was accepted and converted to an invoice.");
  });
});

// ─── normalizeDeclineReason ────────────────────────────────────────────────────

describe("normalizeDeclineReason", () => {
  it("returns null for undefined", () => {
    const result = normalizeDeclineReason(undefined);
    expect(result).toEqual({ valid: true, reason: null });
  });

  it("returns null for null", () => {
    const result = normalizeDeclineReason(null);
    expect(result).toEqual({ valid: true, reason: null });
  });

  it("returns null for empty string", () => {
    const result = normalizeDeclineReason("");
    expect(result).toEqual({ valid: true, reason: null });
  });

  it("returns null for whitespace-only string", () => {
    const result = normalizeDeclineReason("   \t\n  ");
    expect(result).toEqual({ valid: true, reason: null });
  });

  it("trims and returns valid reason", () => {
    const result = normalizeDeclineReason("  Too expensive  ");
    expect(result).toEqual({ valid: true, reason: "Too expensive" });
  });

  it("returns error for oversized reason", () => {
    const longReason = "a".repeat(2001);
    const result = normalizeDeclineReason(longReason);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("2000 characters or fewer");
    }
  });

  it("accepts reason at max length", () => {
    const maxReason = "a".repeat(2000);
    const result = normalizeDeclineReason(maxReason);
    expect(result).toEqual({ valid: true, reason: maxReason });
  });
});
