import "server-only";

import { NextResponse } from "next/server";
import { getOrgContext, type OrgContext } from "@/lib/auth";
import { type Resource, type ResourceAction } from "@/lib/auth/rbac/permissions";
import { rateLimitByOrg, rateLimitByIp, RATE_LIMITS } from "@/lib/rate-limit";
import { ConversationAccessError, MessagingAccessContextError } from "@/lib/messaging";
import { getMessagingAccessContext, hasMessagingPermission } from "@/lib/messaging/messaging-access-context";

export const MessagingApiErrorCode = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

const STATUS_MAP: Record<string, number> = {
  [MessagingApiErrorCode.UNAUTHORIZED]: 401,
  [MessagingApiErrorCode.FORBIDDEN]: 403,
  [MessagingApiErrorCode.NOT_FOUND]: 404,
  [MessagingApiErrorCode.VALIDATION_ERROR]: 422,
  [MessagingApiErrorCode.INTERNAL_ERROR]: 500,
};

/**
 * Denial categories for server-side diagnostics.
 * These are NOT exposed to API clients.
 */
export type MessagingAccessDeniedCategory =
  | "missing_membership"
  | "cross_org"
  | "archived"
  | "locked"
  | "governance_role"
  | "invalid_override"
  | "dm_constraint"
  | "malformed_request";

/**
 * Explicit error class for authorization / access-denial failures.
 * Carries a semantic code so the API layer can map deterministically.
 *
 * Hardening (Sprint 3.4): optional `category` enables structured server-side
 * diagnostics without leaking unsafe detail to API clients.
 */
export class MessagingAccessError extends Error {
  code = "FORBIDDEN";
}

export class MessagingAccessDeniedError extends MessagingAccessError {
  category: MessagingAccessDeniedCategory;

  constructor(category: MessagingAccessDeniedCategory, message?: string) {
    super(message ?? "Access denied.");
    this.category = category;
  }
}

/**
 * Explicit error class for not-found failures.
 */
export class MessagingNotFoundError extends Error {
  code = "NOT_FOUND";
}

export class MessagingApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function messagingApiResponse(data: unknown, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function messagingApiError(
  code: string,
  message: string,
  status?: number,
): NextResponse {
  const httpStatus = status ?? STATUS_MAP[code] ?? 500;
  return NextResponse.json(
    {
      success: false,
      error: { code, message },
    },
    { status: httpStatus },
  );
}

/**
 * Wrap a read-path promise so that membership access errors become
 * not-found responses. This prevents existence leakage on reads.
 */
export async function safeRead<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ConversationAccessError) {
      throw new MessagingNotFoundError("Conversation not found or access denied.");
    }
    if (error instanceof Error) {
      const msg = error.message;
      if (
        msg.includes("active participant access required") ||
        msg.includes("thread not found or does not belong to conversation")
      ) {
        throw new MessagingNotFoundError("Conversation not found or access denied.");
      }
    }
    throw error;
  }
}

export function handleMessagingApiError(error: unknown): NextResponse {
  if (error instanceof MessagingApiError) {
    return messagingApiError(error.code, error.message, error.status);
  }

  if (error instanceof MessagingAccessContextError) {
    console.warn(
      `[api/messaging] Access context resolution failed:`,
      error.message,
    );
    return messagingApiError(
      MessagingApiErrorCode.FORBIDDEN,
      "Access denied.",
      STATUS_MAP[MessagingApiErrorCode.FORBIDDEN],
    );
  }

  if (error instanceof MessagingAccessDeniedError) {
    // Server-side structured diagnostic: safe, not sent to client.
    console.warn(
      `[api/messaging] Access denied (${error.category}):`,
      error.message,
    );
    return messagingApiError(
      MessagingApiErrorCode.FORBIDDEN,
      "Access denied.",
      STATUS_MAP[MessagingApiErrorCode.FORBIDDEN],
    );
  }

  if (error instanceof MessagingAccessError) {
    return messagingApiError(
      MessagingApiErrorCode.FORBIDDEN,
      "Access denied.",
      STATUS_MAP[MessagingApiErrorCode.FORBIDDEN],
    );
  }

  if (error instanceof MessagingNotFoundError) {
    return messagingApiError(
      MessagingApiErrorCode.NOT_FOUND,
      error.message,
      STATUS_MAP[MessagingApiErrorCode.NOT_FOUND],
    );
  }

  if (error instanceof Error) {
    // Structured service-layer error name checks
    if (error.name === "InvalidInputError") {
      return messagingApiError(
        MessagingApiErrorCode.VALIDATION_ERROR,
        error.message,
        STATUS_MAP[MessagingApiErrorCode.VALIDATION_ERROR],
      );
    }

    if (error.name === "NotFoundError") {
      return messagingApiError(
        MessagingApiErrorCode.NOT_FOUND,
        error.message,
        STATUS_MAP[MessagingApiErrorCode.NOT_FOUND],
      );
    }

    const msg = error.message;
    // Fallback substring checks for errors thrown by services that do not yet use
    // the structured error classes. These should migrate over time.
    if (
      msg.includes("governance action requires") ||
      msg.includes("conversation is archived") ||
      msg.includes("conversation is locked") ||
      msg.includes("can only edit your own messages") ||
      msg.includes("can only delete your own messages") ||
      msg.includes("cannot remove the sole owner") ||
      msg.includes("cannot demote the sole owner") ||
      msg.includes("not allowed on DM conversations") ||
      msg.includes("active membership required")
    ) {
      return messagingApiError(
        MessagingApiErrorCode.FORBIDDEN,
        "Access denied.",
        STATUS_MAP[MessagingApiErrorCode.FORBIDDEN],
      );
    }
    if (msg.includes("not found")) {
      return messagingApiError(
        MessagingApiErrorCode.NOT_FOUND,
        msg,
        STATUS_MAP[MessagingApiErrorCode.NOT_FOUND],
      );
    }
    if (msg.includes("Rate limit") || msg.includes("rate limit")) {
      return messagingApiError(
        "RATE_LIMITED",
        "Too many requests. Please try again later.",
        429,
      );
    }
  }

  console.error("[api/messaging] Unhandled error:", error);
  return messagingApiError(
    MessagingApiErrorCode.INTERNAL_ERROR,
    "An unexpected error occurred.",
    500,
  );
}

/**
 * Require an authenticated org context for messaging API routes.
 * Returns 401 if not authenticated, 403 if no org.
 */
export async function requireMessagingApiContext(): Promise<OrgContext> {
  const context = await getOrgContext();

  if (!context) {
    throw new MessagingApiError(
      MessagingApiErrorCode.UNAUTHORIZED,
      "Unauthorized",
      STATUS_MAP[MessagingApiErrorCode.UNAUTHORIZED],
    );
  }

  return context;
}

/**
 * Require a specific messaging permission for the current user.
 * Throws 403 if the user lacks the required permission.
 *
 * Sprint 11.3: messaging permission enforcement at the API layer.
 * Uses custom-role-aware access context (fetches CustomRole.permissions
 * from the database for non-owner/non-admin users).
 */
export async function requireMessagingPermission(
  resource: Resource,
  action: ResourceAction,
): Promise<OrgContext> {
  const context = await requireMessagingApiContext();
  const accessCtx = await getMessagingAccessContext(
    context.orgId,
    context.userId,
    context.role,
  );

  if (!hasMessagingPermission(accessCtx, resource, action)) {
    throw new MessagingAccessDeniedError(
      "missing_membership",
      `missing permission: ${resource}:${action}`,
    );
  }

  return context;
}

/**
 * Parse and validate pagination query params.
 */
export function parsePagination(searchParams: URLSearchParams): {
  limit: number;
  cursor: string | null;
} {
  const rawLimit = searchParams.get("limit");
  const limit = rawLimit
    ? Math.min(100, Math.max(1, parseInt(rawLimit, 10) || 20))
    : 20;

  const cursor = searchParams.get("cursor");
  return { limit, cursor };
}

/**
 * Require a non-empty string body field.
 */
export function requireStringField(
  value: unknown,
  fieldName: string,
  maxLength?: number,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MessagingApiError(
      MessagingApiErrorCode.VALIDATION_ERROR,
      `${fieldName} is required.`,
      STATUS_MAP[MessagingApiErrorCode.VALIDATION_ERROR],
    );
  }

  const trimmed = value.trim();

  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw new MessagingApiError(
      MessagingApiErrorCode.VALIDATION_ERROR,
      `${fieldName} must be at most ${maxLength} characters.`,
      STATUS_MAP[MessagingApiErrorCode.VALIDATION_ERROR],
    );
  }

  return trimmed;
}

/**
 * Require a valid enum value.
 */
export function requireEnumField<T extends string>(
  value: unknown,
  fieldName: string,
  validValues: readonly T[],
): T {
  if (typeof value !== "string" || !validValues.includes(value as T)) {
    throw new MessagingApiError(
      MessagingApiErrorCode.VALIDATION_ERROR,
      `${fieldName} must be one of: ${validValues.join(", ")}.`,
      STATUS_MAP[MessagingApiErrorCode.VALIDATION_ERROR],
    );
  }
  return value as T;
}

/**
 * Apply rate limiting for messaging routes.
 * Checks both org-scoped and IP-based limits with fail-open behavior.
 * Throws a MessagingApiError with 429 if the limit is exceeded.
 */
export async function applyMessagingRateLimit(
  request: Request,
  orgId: string,
  limitKey: keyof typeof RATE_LIMITS,
): Promise<void> {
  const config = RATE_LIMITS[limitKey];

  const [orgResult, ipResult] = await Promise.all([
    rateLimitByOrg(orgId, config),
    rateLimitByIp(request as unknown as import("next/server").NextRequest, config),
  ]);

  if (!orgResult.success) {
    throw new MessagingApiError(
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
      429,
    );
  }

  if (!ipResult.success) {
    throw new MessagingApiError(
      "RATE_LIMITED",
      "Too many requests. Please try again later.",
      429,
    );
  }
}

/**
 * Validate that a value is an integer within [min, max].
 * Returns value unchanged if undefined/null (caller decides whether field is required).
 */
export function requireNumberRange(
  value: unknown,
  fieldName: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < min || num > max) {
    throw new MessagingApiError(
      MessagingApiErrorCode.VALIDATION_ERROR,
      `${fieldName} must be an integer between ${min} and ${max}.`,
      STATUS_MAP[MessagingApiErrorCode.VALIDATION_ERROR],
    );
  }
  return num;
}

/**
 * Validate that a string value parses to a valid Date.
 * Returns undefined if value is null/undefined.
 */
export function requireValidDate(
  value: unknown,
  fieldName: string,
): Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new MessagingApiError(
      MessagingApiErrorCode.VALIDATION_ERROR,
      `${fieldName} must be a valid ISO-8601 date string.`,
      STATUS_MAP[MessagingApiErrorCode.VALIDATION_ERROR],
    );
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new MessagingApiError(
      MessagingApiErrorCode.VALIDATION_ERROR,
      `${fieldName} must be a valid date.`,
      STATUS_MAP[MessagingApiErrorCode.VALIDATION_ERROR],
    );
  }
  return date;
}
