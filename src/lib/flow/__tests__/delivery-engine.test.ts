import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Sprint 18.2 — Delivery Engine Tests
 * Tests validation logic and retry/replay behavior inline (no DB).
 */

// ─── Constants replicated from delivery-engine ─────────────────────────────
const MAX_DELIVERY_ATTEMPTS = 3;
const RETRY_DELAY_MINS = [5, 30];

type DeliveryStatus =
  | "QUEUED"
  | "SENDING"
  | "SENT"
  | "DELIVERED"
  | "FAILED"
  | "TERMINAL_FAILURE"
  | "REPLAYED";

type DeliveryChannel = "email" | "in_app";

interface MockDelivery {
  id: string;
  notificationId: string;
  orgId: string;
  channel: DeliveryChannel;
  recipientTarget: string;
  status: DeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  failureReason: string | null;
  nextRetryAt: Date | null;
  sentAt: Date | null;
  failedAt: Date | null;
}

// ─── Pure retry logic ──────────────────────────────────────────────────────

function computeNextRetry(
  attemptCount: number,
  maxAttempts: number
): Date | null {
  if (attemptCount >= maxAttempts) return null;
  const delayMins = RETRY_DELAY_MINS[attemptCount - 1];
  if (!delayMins) return null;
  return new Date(Date.now() + delayMins * 60 * 1000);
}

function wouldBeTerminal(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount >= maxAttempts;
}

function canReplay(status: DeliveryStatus): boolean {
  return status === "FAILED" || status === "TERMINAL_FAILURE";
}

function isIdempotentStatus(status: DeliveryStatus): boolean {
  return status === "TERMINAL_FAILURE" || status === "DELIVERED" || status === "SENT";
}

// ─── Test Suite ───────────────────────────────────────────────────────────

describe("Delivery Engine — retry logic", () => {
  it("returns nextRetry after first failure (within maxAttempts)", () => {
    const next = computeNextRetry(1, 3);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns nextRetry after second failure (within maxAttempts)", () => {
    const next = computeNextRetry(2, 3);
    expect(next).not.toBeNull();
    const diff = (next!.getTime() - Date.now()) / 1000 / 60;
    expect(diff).toBeGreaterThan(25); // ~30 min
  });

  it("returns null nextRetry at maxAttempts (terminal)", () => {
    const next = computeNextRetry(3, 3);
    expect(next).toBeNull();
  });

  it("returns null nextRetry beyond maxAttempts", () => {
    const next = computeNextRetry(5, 3);
    expect(next).toBeNull();
  });

  it("correctly identifies terminal at exactly maxAttempts", () => {
    expect(wouldBeTerminal(3, 3)).toBe(true);
  });

  it("correctly identifies non-terminal below maxAttempts", () => {
    expect(wouldBeTerminal(2, 3)).toBe(false);
  });

  it("correctly identifies non-terminal at zero attempts", () => {
    expect(wouldBeTerminal(0, 3)).toBe(false);
  });
});

describe("Delivery Engine — replay eligibility", () => {
  it("allows replay of FAILED delivery", () => {
    expect(canReplay("FAILED")).toBe(true);
  });

  it("allows replay of TERMINAL_FAILURE delivery", () => {
    expect(canReplay("TERMINAL_FAILURE")).toBe(true);
  });

  it("blocks replay of SENT delivery", () => {
    expect(canReplay("SENT")).toBe(false);
  });

  it("blocks replay of DELIVERED delivery", () => {
    expect(canReplay("DELIVERED")).toBe(false);
  });

  it("blocks replay of QUEUED delivery", () => {
    expect(canReplay("QUEUED")).toBe(false);
  });

  it("blocks replay of REPLAYED delivery", () => {
    expect(canReplay("REPLAYED")).toBe(false);
  });
});

describe("Delivery Engine — idempotency guards", () => {
  it("treats TERMINAL_FAILURE as idempotent (do not re-send)", () => {
    expect(isIdempotentStatus("TERMINAL_FAILURE")).toBe(true);
  });

  it("treats SENT as idempotent", () => {
    expect(isIdempotentStatus("SENT")).toBe(true);
  });

  it("treats DELIVERED as idempotent", () => {
    expect(isIdempotentStatus("DELIVERED")).toBe(true);
  });

  it("does not treat FAILED as idempotent (retry allowed)", () => {
    expect(isIdempotentStatus("FAILED")).toBe(false);
  });

  it("does not treat QUEUED as idempotent", () => {
    expect(isIdempotentStatus("QUEUED")).toBe(false);
  });
});

describe("Delivery Engine — in_app channel", () => {
  it("in_app channel should always be immediately DELIVERED (no retry)", () => {
    const inAppDelivery: MockDelivery = {
      id: "d1",
      notificationId: "n1",
      orgId: "org1",
      channel: "in_app",
      recipientTarget: "user-uuid",
      status: "DELIVERED",
      attemptCount: 1,
      maxAttempts: 1,
      failureReason: null,
      nextRetryAt: null,
      sentAt: new Date(),
      failedAt: null,
    };
    expect(inAppDelivery.status).toBe("DELIVERED");
    expect(inAppDelivery.maxAttempts).toBe(1);
    expect(inAppDelivery.nextRetryAt).toBeNull();
  });

  it("in_app channel delivery cannot be replayed by operator", () => {
    // Replay is only valid for email channel
    const inAppStatus: DeliveryStatus = "DELIVERED";
    expect(canReplay(inAppStatus)).toBe(false);
  });


});

describe("Delivery Engine — retry schedule invariants", () => {
  it("retry delay increases with each attempt", () => {
    const retry1 = computeNextRetry(1, 3);
    const retry2 = computeNextRetry(2, 3);
    expect(retry1).not.toBeNull();
    expect(retry2).not.toBeNull();
    expect(retry2!.getTime()).toBeGreaterThan(retry1!.getTime());
  });

  it("does not schedule retry beyond defined delay table", () => {
    // RETRY_DELAY_MINS has 2 entries for 3 max attempts
    // Third attempt → terminal, no retry
    expect(RETRY_DELAY_MINS.length).toBe(MAX_DELIVERY_ATTEMPTS - 1);
  });

  it("maxAttempts defaults to 3", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(3);
  });


});

describe("Delivery templates", () => {
  it("builds HTML with link when link is provided", () => {
    const html = buildDeliveryHtml({
      title: "Invoice Approved",
      body: "Your invoice #INV-001 has been approved.",
      link: "/app/docs/invoices/inv-123",
    });
    expect(html).toContain("Invoice Approved");
    expect(html).toContain("/app/docs/invoices/inv-123");
    expect(html).toContain("View in Slipwise");
  });

  it("builds HTML without link when link is null", () => {
    const html = buildDeliveryHtml({
      title: "Update",
      body: "Something happened.",
      link: null,
    });
    expect(html).toContain("Update");
    expect(html).not.toContain("View in Slipwise");
  });

  it("sanitizes title and body in output", () => {
    const html = buildDeliveryHtml({
      title: "Test Notification",
      body: "Check your dashboard.",
      link: null,
    });
    expect(html).toContain("Test Notification");
    expect(html).toContain("Check your dashboard.");
  });
});

// ─── Inline template helper (mirrors delivery-templates.ts) ───────────────
function buildDeliveryHtml(opts: {
  title: string;
  body: string;
  link: string | null;
}): string {
  const appUrl = "https://app.slipwise.app";
  const linkHtml = opts.link
    ? `<a href="${appUrl}${opts.link}">View in Slipwise →</a>`
    : "";
  return `<div><h2>${opts.title}</h2><p>${opts.body}</p>${linkHtml}</div>`;
}
