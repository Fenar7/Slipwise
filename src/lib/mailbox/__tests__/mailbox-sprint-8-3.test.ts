/**
 * Mailbox Phase 8 Sprint 8.3 — Telemetry & Metrics Tests
 *
 * Covers:
 * - sanitizePayload: recursive PII/token redaction
 * - logMailboxTelemetry: stdout format and [MAILBOX_TELEMETRY] prefix
 * - captureMailboxError: Sentry forwarding for non-transient errors,
 *   Sentry skip for transient errors
 * - getMailboxAdoptionMetrics: connection counts, provider grouping,
 *   unique user count, schema drift guard
 * - getMailboxHealthMetrics: success rate, latency percentiles (avg/p50/p90),
 *   stalled run count, error category grouping, schema drift guard
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── Sentry mock ───────────────────────────────────────────────────────────────

const mockCaptureError = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureError: mockCaptureError,
}));

// ── DB mock ───────────────────────────────────────────────────────────────────

const mockMailboxConnectionFindMany = vi.fn();
const mockMailboxSyncRunFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    mailboxConnection: { findMany: mockMailboxConnectionFindMany },
    mailboxSyncRun: { findMany: mockMailboxSyncRunFindMany },
  },
}));

// ── prisma-errors mock ────────────────────────────────────────────────────────

vi.mock("@/lib/prisma-errors", () => ({
  isSchemaDriftError: (err: unknown) =>
    err instanceof Error && err.message.includes("P2021"),
}));

// ─── sanitizePayload tests ────────────────────────────────────────────────────

describe("Sprint 8.3 — sanitizePayload", () => {
  it("redacts values whose keys match the sensitive key pattern", async () => {
    const { sanitizePayload } = await import("../telemetry");
    const result = sanitizePayload({ token: "abc123", normal: "ok" }) as Record<string, unknown>;
    expect(result.token).toBe("[REDACTED]");
    expect(result.normal).toBe("ok");
  });

  it("redacts nested sensitive keys recursively", async () => {
    const { sanitizePayload } = await import("../telemetry");
    const result = sanitizePayload({
      outer: { secret: "shhh", visible: "yes" },
    }) as Record<string, unknown>;
    const outer = result.outer as Record<string, unknown>;
    expect(outer.secret).toBe("[REDACTED]");
    expect(outer.visible).toBe("yes");
  });

  it("redacts OAuth ya29.* bearer token string values", async () => {
    const { sanitizePayload } = await import("../telemetry");
    const result = sanitizePayload({ someField: "ya29.a0AbCdEf" }) as Record<string, unknown>;
    expect(result.someField).toBe("[REDACTED]");
  });

  it("redacts inline token patterns via sanitizeErrorForLog", async () => {
    const { sanitizePayload } = await import("../telemetry");
    const result = sanitizePayload({ msg: "access_token=supersecret" }) as Record<string, unknown>;
    expect(result.msg).not.toContain("supersecret");
    expect(result.msg).toContain("[REDACTED]");
  });

  it("passes through safe primitive values unchanged", async () => {
    const { sanitizePayload } = await import("../telemetry");
    const result = sanitizePayload({ count: 42, flag: true, nothing: null });
    expect(result).toEqual({ count: 42, flag: true, nothing: null });
  });

  it("recursively sanitizes array items", async () => {
    const { sanitizePayload } = await import("../telemetry");
    const result = sanitizePayload([{ token: "leak" }, { safe: "data" }]) as unknown[];
    expect((result[0] as Record<string, unknown>).token).toBe("[REDACTED]");
    expect((result[1] as Record<string, unknown>).safe).toBe("data");
  });

  it("respects depth limit and returns sentinel for deeply nested objects", async () => {
    const { sanitizePayload } = await import("../telemetry");
    // Build a 10-level deep object
    let deep: Record<string, unknown> = { value: "deep" };
    for (let i = 0; i < 10; i++) deep = { nest: deep };
    // Should not throw; deepest level returns depth-limit sentinel
    expect(() => sanitizePayload(deep)).not.toThrow();
  });
});

// ─── logMailboxTelemetry tests ────────────────────────────────────────────────

describe("Sprint 8.3 — logMailboxTelemetry", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("writes a [MAILBOX_TELEMETRY]-prefixed JSON line to stdout", async () => {
    const { logMailboxTelemetry } = await import("../telemetry");
    await logMailboxTelemetry("sync_started", { orgId: "org-1", runId: "run-1" });

    expect(writeSpy).toHaveBeenCalledOnce();
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toMatch(/^\[MAILBOX_TELEMETRY\] /);
    expect(output).toContain('"event":"sync_started"');
    expect(output).toContain('"orgId":"org-1"');
    expect(output).toContain('"runId":"run-1"');
    // Must be a valid JSON line after the prefix
    const json = output.replace("[MAILBOX_TELEMETRY] ", "").trim();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("includes a timestamp field in the emitted JSON", async () => {
    const { logMailboxTelemetry } = await import("../telemetry");
    await logMailboxTelemetry("test_event", { x: 1 });
    const output = writeSpy.mock.calls[0][0] as string;
    const json = JSON.parse(output.replace("[MAILBOX_TELEMETRY] ", "").trim());
    expect(json.timestamp).toBeDefined();
    expect(new Date(json.timestamp).getTime()).not.toBeNaN();
  });

  it("redacts sensitive token values before writing to stdout", async () => {
    const { logMailboxTelemetry } = await import("../telemetry");
    await logMailboxTelemetry("test_event", { token: "ya29.supersecret", orgId: "org-1" });
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).not.toContain("ya29.supersecret");
    expect(output).toContain("[REDACTED]");
  });
});

// ─── captureMailboxError tests ────────────────────────────────────────────────

describe("Sprint 8.3 — captureMailboxError", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    mockCaptureError.mockReset();
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("always emits a mailbox_error_captured telemetry line", async () => {
    const { captureMailboxError } = await import("../telemetry");
    await captureMailboxError(new Error("something broke"), { orgId: "org-1" });
    const output = writeSpy.mock.calls[0][0] as string;
    expect(output).toContain('"event":"mailbox_error_captured"');
  });

  it("calls captureError from @/lib/sentry for unexpected errors", async () => {
    const { captureMailboxError } = await import("../telemetry");
    await captureMailboxError(new Error("unexpected failure"), { runId: "r1" });
    expect(mockCaptureError).toHaveBeenCalledOnce();
    const [sentryErr, ctx] = mockCaptureError.mock.calls[0];
    expect(sentryErr).toBeInstanceOf(Error);
    expect(sentryErr.message).toBe("unexpected failure");
    expect(ctx).toBeDefined();
  });

  it("skips Sentry for rate_limited category (transient — expected noise)", async () => {
    const { captureMailboxError } = await import("../telemetry");
    const rateLimitErr = Object.assign(new Error("too many requests"), {
      category: "rate_limited",
    });
    await captureMailboxError(rateLimitErr);
    // Still logs to stdout
    expect(writeSpy).toHaveBeenCalled();
    // But does NOT forward to Sentry
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("skips Sentry for quota_exceeded category (transient — expected noise)", async () => {
    const { captureMailboxError } = await import("../telemetry");
    const quotaErr = Object.assign(new Error("quota exceeded"), {
      category: "quota_exceeded",
    });
    await captureMailboxError(quotaErr);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("skips Sentry for provider_unavailable category (transient)", async () => {
    const { captureMailboxError } = await import("../telemetry");
    const transientErr = Object.assign(new Error("provider down"), {
      category: "provider_unavailable",
    });
    await captureMailboxError(transientErr);
    expect(mockCaptureError).not.toHaveBeenCalled();
  });

  it("sanitizes context before forwarding to Sentry", async () => {
    const { captureMailboxError } = await import("../telemetry");
    await captureMailboxError(new Error("err"), { token: "ya29.leak", orgId: "org-1" });
    const [, ctx] = mockCaptureError.mock.calls[0];
    expect(JSON.stringify(ctx)).not.toContain("ya29.leak");
    expect(JSON.stringify(ctx)).toContain("[REDACTED]");
  });
});

// ─── getMailboxAdoptionMetrics tests ─────────────────────────────────────────

describe("Sprint 8.3 — getMailboxAdoptionMetrics", () => {
  beforeEach(() => {
    mockMailboxConnectionFindMany.mockReset();
    mockMailboxSyncRunFindMany.mockReset();
  });

  it("returns correct counts for mixed-status connections", async () => {
    const sevenDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // within window
    mockMailboxConnectionFindMany.mockResolvedValue([
      { status: "ACTIVE", provider: "GMAIL", disabledAt: null, deletedAt: null, connectedBy: "u1", lastSyncAt: sevenDaysAgo, lastSyncError: null },
      { status: "ACTIVE", provider: "GMAIL", disabledAt: null, deletedAt: null, connectedBy: "u2", lastSyncAt: sevenDaysAgo, lastSyncError: null },
      { status: "DEGRADED", provider: "OUTLOOK", disabledAt: null, deletedAt: null, connectedBy: "u1", lastSyncAt: sevenDaysAgo, lastSyncError: "rate limited" },
      { status: "DISCONNECTED", provider: "GMAIL", disabledAt: null, deletedAt: null, connectedBy: "u3", lastSyncAt: null, lastSyncError: null },
      { status: "ACTIVE", provider: "GMAIL", disabledAt: new Date(), deletedAt: null, connectedBy: "u4", lastSyncAt: null, lastSyncError: null },
    ]);

    const { getMailboxAdoptionMetrics } = await import("../metrics");
    const result = await getMailboxAdoptionMetrics("org-1");

    expect(result.totalConnections).toBe(5);
    expect(result.activeConnections).toBe(2);
    expect(result.degradedConnections).toBe(1);
    expect(result.disconnectedConnections).toBe(1);
    expect(result.disabledConnections).toBe(1);
    expect(result.uniqueConnectedUsers).toBe(4);
    expect(result.byProvider["GMAIL"]).toBe(4);
    expect(result.byProvider["OUTLOOK"]).toBe(1);
    expect(result.recentlySyncedConnections).toBe(2);
    expect(result.recentlyFailedConnections).toBe(1);
  });

  it("returns empty defaults when no connections exist", async () => {
    mockMailboxConnectionFindMany.mockResolvedValue([]);
    const { getMailboxAdoptionMetrics } = await import("../metrics");
    const result = await getMailboxAdoptionMetrics("org-empty");
    expect(result.totalConnections).toBe(0);
    expect(result.uniqueConnectedUsers).toBe(0);
    expect(result.byProvider).toEqual({});
  });

  it("returns safe defaults on schema drift (P2021)", async () => {
    mockMailboxConnectionFindMany.mockRejectedValue(new Error("P2021: table not found"));
    const { getMailboxAdoptionMetrics } = await import("../metrics");
    const result = await getMailboxAdoptionMetrics("org-drift");
    expect(result.totalConnections).toBe(0);
    expect(result.byProvider).toEqual({});
  });

  it("rethrows non-drift database errors", async () => {
    mockMailboxConnectionFindMany.mockRejectedValue(new Error("Connection refused"));
    const { getMailboxAdoptionMetrics } = await import("../metrics");
    await expect(getMailboxAdoptionMetrics("org-err")).rejects.toThrow("Connection refused");
  });
});

// ─── getMailboxHealthMetrics tests ────────────────────────────────────────────

describe("Sprint 8.3 — getMailboxHealthMetrics", () => {
  beforeEach(() => {
    mockMailboxSyncRunFindMany.mockReset();
    mockMailboxConnectionFindMany.mockReset();
  });

  function makeRun(
    status: "COMPLETED" | "FAILED" | "RUNNING",
    startOffsetMs: number,
    durationMs?: number,
    errorCategory?: string,
    lastHeartbeatAt?: Date | null,
  ) {
    const startedAt = new Date(Date.now() - startOffsetMs);
    const completedAt =
      status === "COMPLETED" && durationMs != null
        ? new Date(startedAt.getTime() + durationMs)
        : null;
    return { status, startedAt, completedAt, errorCategory: errorCategory ?? null, lastHeartbeatAt: lastHeartbeatAt ?? null };
  }

  it("calculates success rate correctly", async () => {
    mockMailboxSyncRunFindMany.mockResolvedValue([
      makeRun("COMPLETED", 60_000, 5000),
      makeRun("COMPLETED", 120_000, 3000),
      makeRun("FAILED", 180_000, undefined, "auth_expired"),
      makeRun("FAILED", 240_000, undefined, "rate_limited"),
    ]);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1");
    expect(result.totalRuns).toBe(4);
    expect(result.completedRuns).toBe(2);
    expect(result.failedRuns).toBe(2);
    expect(result.successRate).toBeCloseTo(0.5);
  });

  it("computes latency avg, p50, and p90 correctly for COMPLETED runs", async () => {
    // 10 completed runs: 1000ms, 2000ms, ..., 10000ms
    const runs = Array.from({ length: 10 }, (_, i) =>
      makeRun("COMPLETED", (i + 1) * 60_000, (i + 1) * 1000),
    );
    mockMailboxSyncRunFindMany.mockResolvedValue(runs);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1");
    expect(result.latencyMs.avg).toBe(5500); // (1000+...+10000)/10
    expect(result.latencyMs.p50).toBe(5000); // 50th percentile of sorted [1000..10000]
    expect(result.latencyMs.p90).toBe(9000); // 90th percentile
  });

  it("returns zero latency when no completed runs exist", async () => {
    mockMailboxSyncRunFindMany.mockResolvedValue([
      makeRun("FAILED", 60_000, undefined, "unknown"),
    ]);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1");
    expect(result.latencyMs.avg).toBe(0);
    expect(result.latencyMs.p50).toBe(0);
    expect(result.latencyMs.p90).toBe(0);
  });

  it("counts stalled RUNNING runs correctly (started > 30min ago, no heartbeat)", async () => {
    const stalledMs = 35 * 60 * 1000; // 35 minutes ago — stalled
    const freshMs = 5 * 60 * 1000;    // 5 minutes ago — still running, not stalled
    mockMailboxSyncRunFindMany.mockResolvedValue([
      makeRun("RUNNING", stalledMs, undefined, undefined, null),
      makeRun("RUNNING", stalledMs, undefined, undefined, null),
      makeRun("RUNNING", freshMs, undefined, undefined, null),
    ]);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1");
    expect(result.stalledRuns).toBe(2);
  });

  it("uses lastHeartbeatAt instead of startedAt for stall detection when present", async () => {
    const startedLongAgo = 60 * 60 * 1000; // 60 min ago
    const recentHeartbeat = new Date(Date.now() - 2 * 60 * 1000); // heartbeat 2 min ago
    mockMailboxSyncRunFindMany.mockResolvedValue([
      makeRun("RUNNING", startedLongAgo, undefined, undefined, recentHeartbeat),
    ]);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1");
    // Has recent heartbeat so NOT stalled despite old startedAt
    expect(result.stalledRuns).toBe(0);
  });

  it("groups error categories from FAILED runs correctly", async () => {
    mockMailboxSyncRunFindMany.mockResolvedValue([
      makeRun("FAILED", 60_000, undefined, "auth_expired"),
      makeRun("FAILED", 120_000, undefined, "auth_expired"),
      makeRun("FAILED", 180_000, undefined, "rate_limited"),
      makeRun("COMPLETED", 240_000, 1000),
    ]);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1");
    expect(result.errorsByCategory["auth_expired"]).toBe(2);
    expect(result.errorsByCategory["rate_limited"]).toBe(1);
  });

  it("returns zero successRate when no runs exist", async () => {
    mockMailboxSyncRunFindMany.mockResolvedValue([]);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1");
    expect(result.successRate).toBe(0);
    expect(result.totalRuns).toBe(0);
  });

  it("returns safe defaults on schema drift (P2021)", async () => {
    mockMailboxSyncRunFindMany.mockRejectedValue(new Error("P2021: relation does not exist"));
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-drift");
    expect(result.totalRuns).toBe(0);
    expect(result.successRate).toBe(0);
  });

  it("rethrows non-drift database errors", async () => {
    mockMailboxSyncRunFindMany.mockRejectedValue(new Error("ETIMEDOUT"));
    const { getMailboxHealthMetrics } = await import("../metrics");
    await expect(getMailboxHealthMetrics("org-err")).rejects.toThrow("ETIMEDOUT");
  });

  it("respects a custom startDate window", async () => {
    const customStart = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    mockMailboxSyncRunFindMany.mockResolvedValue([]);
    const { getMailboxHealthMetrics } = await import("../metrics");
    const result = await getMailboxHealthMetrics("org-1", { startDate: customStart });
    expect(result.windowStart.getTime()).toBeCloseTo(customStart.getTime(), -3);
  });
});
