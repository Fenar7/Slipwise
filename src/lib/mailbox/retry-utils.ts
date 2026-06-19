import "server-only";

export interface RetryOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  jitterFactor?: number;
  retryable?: (error: unknown) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  baseDelayMs: 1000,
  maxDelayMs: 60_000,
  maxAttempts: 3,
  jitterFactor: 0.5,
  retryable: () => true,
  onRetry: () => {},
};

export function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterFactor: number,
): number {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
  const jitter = exponential * jitterFactor * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(exponential + jitter));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!opts.retryable(error) || attempt === opts.maxAttempts) {
        throw error;
      }
      const delay = calculateBackoff(attempt, opts.baseDelayMs, opts.maxDelayMs, opts.jitterFactor);
      opts.onRetry(attempt, delay, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object" && "mailboxProviderError" in error) {
    const providerError = (error as { mailboxProviderError: { category?: string } }).mailboxProviderError;
    return providerError?.category === "rate_limited" || providerError?.category === "quota_exceeded";
  }
  if (error && typeof error === "object" && "category" in error) {
    const cat = (error as { category: string }).category;
    return cat === "rate_limited" || cat === "quota_exceeded";
  }
  return false;
}

export function isTransientError(error: unknown): boolean {
  if (error && typeof error === "object" && "mailboxProviderError" in error) {
    const providerError = (error as { mailboxProviderError: { category?: string } }).mailboxProviderError;
    return providerError?.category === "provider_unavailable";
  }
  if (error && typeof error === "object" && "category" in error) {
    return (error as { category: string }).category === "provider_unavailable";
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNREFUSED|ETIMEDOUT|network|socket hang up|aborted/i.test(rawMessage);
}

export function isRetryableProviderError(error: unknown): boolean {
  return isRateLimitError(error) || isTransientError(error);
}

export function sanitizeErrorForLog(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const sanitized = rawMessage
    .replace(
      /(access_token|refresh_token|secret|password|credential)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/(authorization)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\bbearer\s+.+/gi, "bearer [REDACTED]");
  return sanitized;
}
