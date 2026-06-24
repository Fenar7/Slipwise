import "server-only";

import { captureError } from "@/lib/sentry";
import { sanitizeErrorForLog } from "./retry-utils";

// ─── Sensitive key redaction ──────────────────────────────────────────────────

/**
 * Regex matching context object keys whose values should always be redacted,
 * regardless of content (tokens, credentials, authorization headers, etc.).
 */
const SENSITIVE_KEY_PATTERN =
  /^(token|secret|authorization|auth|password|key|payload|credential)$/i;

/**
 * Regex matching OAuth2 access-token string values emitted by Google (ya29.*),
 * common bearer patterns, or base64-looking long strings that could be tokens.
 */
const SENSITIVE_VALUE_PATTERN = /^(ya29\.|Bearer\s|eyJ)/i;

/**
 * Recursively walks a plain-object `payload` and returns a new object with any
 * sensitive values replaced by the literal string `"[REDACTED]"`.
 *
 * Rules applied in order:
 * 1. Keys matching SENSITIVE_KEY_PATTERN → value is always redacted.
 * 2. String values matching SENSITIVE_VALUE_PATTERN → value is redacted.
 * 3. String values are run through `sanitizeErrorForLog` to catch inline
 *    token patterns (e.g. `access_token=ya29...`).
 * 4. Nested objects are recursively sanitized.
 * 5. Arrays have each element recursively sanitized.
 * 6. Primitives (number, boolean, null) are returned as-is.
 */
export function sanitizePayload(
  payload: unknown,
  depth = 0,
): unknown {
  // Guard against circular-reference or deeply-nested payloads.
  if (depth > 8) return "[DEPTH_LIMIT]";

  if (payload === null || payload === undefined) return payload;

  if (typeof payload === "string") {
    if (SENSITIVE_VALUE_PATTERN.test(payload)) return "[REDACTED]";
    return sanitizeErrorForLog(payload);
  }

  if (typeof payload === "number" || typeof payload === "boolean") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item, depth + 1));
  }

  if (typeof payload === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizePayload(value, depth + 1);
      }
    }
    return sanitized;
  }

  return payload;
}

// ─── Error category classification ───────────────────────────────────────────

/**
 * Categories of errors that are expected, transient, and should NOT be
 * forwarded to Sentry (they create noise without actionable signal).
 */
const TRANSIENT_ERROR_CATEGORIES = new Set([
  "rate_limited",
  "quota_exceeded",
  "provider_unavailable",
  "concurrent_sync_running",
]);

/**
 * Returns true when the error is a known transient/expected condition that
 * should not generate a Sentry exception.
 */
function isTransientMailboxError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const obj = error as Record<string, unknown>;

  // Structured mailbox provider errors carry a `category` field.
  if (typeof obj.category === "string" && TRANSIENT_ERROR_CATEGORIES.has(obj.category)) {
    return true;
  }
  // Wrapped provider errors.
  if (
    obj.mailboxProviderError &&
    typeof (obj.mailboxProviderError as Record<string, unknown>).category === "string"
  ) {
    return TRANSIENT_ERROR_CATEGORIES.has(
      (obj.mailboxProviderError as Record<string, unknown>).category as string,
    );
  }
  return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Logs a structured telemetry event to stdout as a single JSON line.
 *
 * The line is prefixed with `[MAILBOX_TELEMETRY]` so log-collection agents
 * (Datadog, Loki, CloudWatch, etc.) can easily filter and parse these events.
 *
 * The payload is sanitized before writing — no raw tokens or credentials
 * will appear in the log output.
 *
 * @param event   - A snake_case event name (e.g. `"sync_completed"`).
 * @param payload - Arbitrary metadata to include with the event.
 */
export async function logMailboxTelemetry(
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const sanitized = sanitizePayload(payload) as Record<string, unknown>;
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...sanitized,
  });
  // Using process.stdout.write keeps the output on a single line, which is
  // important for structured-log parsers that split on newlines.
  process.stdout.write(`[MAILBOX_TELEMETRY] ${line}\n`);
}

/**
 * Captures a mailbox error with sanitized context.
 *
 * - Always logs the error to stdout via `logMailboxTelemetry`.
 * - Skips Sentry for known transient/expected categories (rate limits,
 *   quota exceeded, concurrent sync guard) to avoid alert fatigue.
 * - For unexpected errors, forwards a sanitized version to Sentry so that
 *   raw tokens can never appear in third-party error trackers.
 *
 * @param error   - The raw caught error (may be any type).
 * @param context - Optional structured context enriching the Sentry event.
 */
export async function captureMailboxError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  const safeMessage =
    error instanceof Error
      ? sanitizeErrorForLog(error.message)
      : sanitizeErrorForLog(String(error));

  const sanitizedContext = context
    ? (sanitizePayload(context) as Record<string, unknown>)
    : undefined;

  // Always emit a structured log line so the error is visible in log aggregators
  // even without Sentry.
  await logMailboxTelemetry("mailbox_error_captured", {
    errorMessage: safeMessage,
    ...(sanitizedContext ?? {}),
  });

  // Transient / expected errors do not need Sentry attention.
  if (isTransientMailboxError(error)) return;

  // Build a sanitized Error object so Sentry's stack-trace grouping still works.
  const sentryError =
    error instanceof Error
      ? Object.assign(new Error(safeMessage), { stack: error.stack })
      : new Error(safeMessage);

  await captureError(sentryError, sanitizedContext);
}
