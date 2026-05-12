import "server-only";

import { NextResponse } from "next/server";
import { getOrgContext, type OrgContext } from "@/lib/auth";

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

export function handleMessagingApiError(error: unknown): NextResponse {
  if (error instanceof MessagingApiError) {
    return messagingApiError(error.code, error.message, error.status);
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
