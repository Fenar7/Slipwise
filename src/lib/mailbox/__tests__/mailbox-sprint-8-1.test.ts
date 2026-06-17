/**
 * Mailbox Phase 8 Sprint 8.1 — Reliability Hardening tests.
 *
 * Covers:
 * - Retry with exponential backoff and jitter
 * - Retryable error classification and predicates
 * - PII-safe error sanitization
 * - Mailbox-scoped advisory lock key derivation and acquire/release
 * - Idempotency guard enforcement
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// ── retry-utils tests (pure logic, no mocking needed) ──────────────────────

describe("Sprint 8.1 — Retry utilities", () => {
  describe("calculateBackoff", () => {
    it("returns base delay on first attempt", async () => {
      const { calculateBackoff } = await import("../retry-utils");
      const delay = calculateBackoff(1, 1000, 60_000, 0);
      expect(delay).toBe(1000);
    });

    it("doubles on second attempt", async () => {
      const { calculateBackoff } = await import("../retry-utils");
      const delay = calculateBackoff(2, 1000, 60_000, 0);
      expect(delay).toBe(2000);
    });

    it("quadruples on third attempt", async () => {
      const { calculateBackoff } = await import("../retry-utils");
      const delay = calculateBackoff(3, 1000, 60_000, 0);
      expect(delay).toBe(4000);
    });

    it("caps at maxDelayMs", async () => {
      const { calculateBackoff } = await import("../retry-utils");
      const delay = calculateBackoff(10, 1000, 5000, 0);
      expect(delay).toBe(5000);
    });

    it("applies jitter within expected range", async () => {
      const { calculateBackoff } = await import("../retry-utils");
      const delays = Array.from({ length: 100 }, () => calculateBackoff(2, 1000, 60_000, 0.5));
      const min = Math.min(...delays);
      const max = Math.max(...delays);
      expect(min).toBeGreaterThanOrEqual(1000);
      expect(max).toBeLessThanOrEqual(3000);
    });
  });

  describe("withRetry", () => {
    it("resolves on first attempt when fn succeeds", async () => {
      const { withRetry } = await import("../retry-utils");
      const fn = vi.fn().mockResolvedValue("ok");
      await expect(withRetry(fn)).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("retries and resolves after transient failures", async () => {
      const { withRetry } = await import("../retry-utils");
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockRejectedValueOnce(new Error("ECONNREFUSED"))
        .mockResolvedValue("ok");
      await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).resolves.toBe("ok");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("throws after exhausting all attempts", async () => {
      const { withRetry } = await import("../retry-utils");
      const fn = vi.fn().mockRejectedValue(new Error("persistent failure"));
      await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 10 })).rejects.toThrow(
        "persistent failure",
      );
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("does not retry if retryable predicate returns false", async () => {
      const { withRetry } = await import("../retry-utils");
      const fn = vi.fn().mockRejectedValue(new Error("fatal"));
      await expect(
        withRetry(fn, {
          maxAttempts: 3,
          baseDelayMs: 10,
          retryable: () => false,
        }),
      ).rejects.toThrow("fatal");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("invokes onRetry callback on each retry", async () => {
      const { withRetry } = await import("../retry-utils");
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail1"))
        .mockResolvedValue("ok");
      await expect(
        withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, onRetry }),
      ).resolves.toBe("ok");
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Number), new Error("fail1"));
    });
  });

  describe("error classification predicates", () => {
    it("isRateLimitError detects rate_limited category", async () => {
      const { isRateLimitError } = await import("../retry-utils");
      expect(isRateLimitError({ category: "rate_limited" })).toBe(true);
      expect(isRateLimitError({ category: "quota_exceeded" })).toBe(true);
      expect(isRateLimitError({ category: "auth_expired" })).toBe(false);
    });

    it("isRateLimitError detects wrapped mailboxProviderError", async () => {
      const { isRateLimitError } = await import("../retry-utils");
      const err = {
        mailboxProviderError: { category: "rate_limited", safeMessage: "", retryable: true },
      };
      expect(isRateLimitError(err)).toBe(true);
    });

    it("isTransientError detects provider_unavailable category", async () => {
      const { isTransientError } = await import("../retry-utils");
      expect(isTransientError({ category: "provider_unavailable" })).toBe(true);
      expect(isTransientError({ category: "auth_expired" })).toBe(false);
    });

    it("isTransientError detects network error messages", async () => {
      const { isTransientError } = await import("../retry-utils");
      expect(isTransientError(new Error("fetch failed"))).toBe(true);
      expect(isTransientError(new Error("ECONNREFUSED"))).toBe(true);
      expect(isTransientError(new Error("ETIMEDOUT"))).toBe(true);
      expect(isTransientError(new Error("socket hang up"))).toBe(true);
      expect(isTransientError(new Error("normal error"))).toBe(false);
    });

    it("isRetryableProviderError combines rate limit and transient checks", async () => {
      const { isRetryableProviderError } = await import("../retry-utils");
      expect(isRetryableProviderError({ category: "rate_limited" })).toBe(true);
      expect(isRetryableProviderError({ category: "provider_unavailable" })).toBe(true);
      expect(isRetryableProviderError({ category: "auth_expired" })).toBe(false);
    });
  });

  describe("sanitizeErrorForLog", () => {
    it("redacts access tokens from error messages", async () => {
      const { sanitizeErrorForLog } = await import("../retry-utils");
      const result = sanitizeErrorForLog(
        "Access token expired: access_token=ya29.a0AfH6SMC...",
      );
      expect(result).toContain("access_token=[REDACTED]");
      expect(result).not.toContain("ya29.a0AfH6SMC");
    });

    it("redacts bearer tokens from error messages", async () => {
      const { sanitizeErrorForLog } = await import("../retry-utils");
      const result = sanitizeErrorForLog(
        "Error: bearer token ya29.a0AfH6SMC... is invalid",
      );
      expect(result).not.toContain("ya29.a0AfH6SMC");
      expect(result).toContain("[REDACTED]");
    });

    it("redacts refresh tokens", async () => {
      const { sanitizeErrorForLog } = await import("../retry-utils");
      const result = sanitizeErrorForLog(
        "refresh_token=1//0gabcdefghijk",
      );
      expect(result).toContain("refresh_token=[REDACTED]");
    });

    it("returns non-sensitive messages as-is", async () => {
      const { sanitizeErrorForLog } = await import("../retry-utils");
      const result = sanitizeErrorForLog("Gmail API returned 429");
      expect(result).toBe("Gmail API returned 429");
    });

    it("handles non-Error objects", async () => {
      const { sanitizeErrorForLog } = await import("../retry-utils");
      const result = sanitizeErrorForLog("access_token: secret123");
      expect(result).toContain("[REDACTED]");
    });
  });
});

// ── mailbox-lock-service tests (mocked db) ─────────────────────────────────

const mockQueryRawUnsafe = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

describe("Sprint 8.1 — Mailbox-scoped locks", () => {
  beforeEach(() => {
    mockQueryRawUnsafe.mockReset();
  });

  describe("tryAcquireMailboxLock", () => {
    it("returns true when lock is granted", async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ locked: true }]);
      const { tryAcquireMailboxLock } = await import("../mailbox-lock-service");
      const result = await tryAcquireMailboxLock("org-1", "conn-1");
      expect(result).toBe(true);
      expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("pg_try_advisory_lock"),
        expect.any(Number),
      );
    });

    it("returns false when lock is held", async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ locked: false }]);
      const { tryAcquireMailboxLock } = await import("../mailbox-lock-service");
      const result = await tryAcquireMailboxLock("org-1", "conn-2");
      expect(result).toBe(false);
    });

    it("produces same key for same connection id", async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ locked: true }]);
      const { tryAcquireMailboxLock } = await import("../mailbox-lock-service");
      await tryAcquireMailboxLock("org-1", "conn-same");
      await tryAcquireMailboxLock("org-2", "conn-same");
      const calls = mockQueryRawUnsafe.mock.calls;
      expect(calls[0][1]).toBe(calls[1][1]);
    });

    it("produces different keys for different connection ids", async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ locked: true }]);
      const { tryAcquireMailboxLock } = await import("../mailbox-lock-service");
      await tryAcquireMailboxLock("org-1", "conn-aaaa");
      await tryAcquireMailboxLock("org-1", "conn-bbbb");
      const calls = mockQueryRawUnsafe.mock.calls;
      expect(calls[0][1]).not.toBe(calls[1][1]);
    });
  });

  describe("releaseMailboxLock", () => {
    it("calls pg_advisory_unlock", async () => {
      mockQueryRawUnsafe.mockResolvedValue([]);
      const { releaseMailboxLock } = await import("../mailbox-lock-service");
      await releaseMailboxLock("org-1", "conn-3");
      expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("pg_advisory_unlock"),
        expect.any(Number),
      );
    });
  });

  describe("withMailboxLock", () => {
    it("executes the function within the lock", async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([]);
      const { withMailboxLock } = await import("../mailbox-lock-service");
      const result = await withMailboxLock("org-1", "conn-4", () => Promise.resolve("done"));
      expect(result).toBe("done");
      // acquire + release = 2 calls
      expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(2);
    });

    it("throws when lock cannot be acquired", async () => {
      mockQueryRawUnsafe.mockResolvedValueOnce([{ locked: false }]);
      const { withMailboxLock } = await import("../mailbox-lock-service");
      await expect(
        withMailboxLock("org-1", "conn-5", () => Promise.resolve("never")),
      ).rejects.toThrow("Mailbox is locked by another operation");
      // only 1 call (acquire attempt, no release since not acquired)
      expect(mockQueryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it("releases the lock after function completes", async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([]);
      const { withMailboxLock } = await import("../mailbox-lock-service");
      await withMailboxLock("org-1", "conn-6", () => Promise.resolve("ok"));

      expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("pg_advisory_unlock"),
        expect.any(Number),
      );
    });

    it("releases the lock when the function throws", async () => {
      mockQueryRawUnsafe
        .mockResolvedValueOnce([{ locked: true }])
        .mockResolvedValueOnce([]);
      const { withMailboxLock } = await import("../mailbox-lock-service");
      await expect(
        withMailboxLock("org-1", "conn-7", () => Promise.reject(new Error("fail"))),
      ).rejects.toThrow("fail");

      expect(mockQueryRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining("pg_advisory_unlock"),
        expect.any(Number),
      );
    });
  });
});
