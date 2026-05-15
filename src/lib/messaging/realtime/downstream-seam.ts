import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { RealtimeEventType } from "./protocol";

/**
 * Durable downstream event consumption seam for worker-driven side effects.
 *
 * Responsibilities:
 * - Provide a clean, typed interface for downstream consumers (notifications,
 *   search indexing, analytics/telemetry) to read durable messaging events.
 * - Preserve event identity, cursor, org scope, and conversation scope.
 * - Support idempotent consumption via eventId deduplication.
 * - Enforce org isolation so workers cannot cross org boundaries.
 * - Never leak raw message bodies or hidden conversation content.
 *
 * Design principles:
 * - This is a seam, not a full product implementation. It enables future
 *   notification/indexing workers without re-architecting the event log.
 * - Consumers receive safe, structured event metadata sufficient for their
 *   domain needs, not full conversation snapshots.
 * - Retry-safe by contract: duplicate eventId delivery is expected and safe.
 */

// ---------------------------------------------------------------------------
// Consumer-facing event shape
// ---------------------------------------------------------------------------

export type DownstreamConsumerType =
  | "notification"
  | "search_index"
  | "analytics"
  | "telemetry";

export interface DownstreamEvent {
  /** Durable event identity — the deduplication key. */
  eventId: string;
  /** Monotonic per-conversation cursor for ordering and resume. */
  cursor: bigint;
  /** Event type for consumer routing. */
  eventType: RealtimeEventType;
  /** Org scope — consumers must validate this matches their partition. */
  orgId: string;
  /** Conversation scope — consumers must validate authorization. */
  conversationId: string;
  /** Actor who triggered the event, if known. */
  actorId: string | null;
  /** When the event occurred (ms since epoch). */
  occurredAt: number;
  /**
   * Safe payload for downstream consumption.
   * For message events: contains messageId, threadId, etc., not raw body.
   * For membership events: contains userId, role, change type.
   * For read-state events: contains userId, lastReadMessageId.
   * For presence/typing events: contains status, expiresAt.
   */
  payload: unknown;
}

// ---------------------------------------------------------------------------
// Worker handoff input / result
// ---------------------------------------------------------------------------

export interface ConsumeDownstreamEventsInput {
  /** Which consumer is reading (for metrics/diagnostics, not auth). */
  consumerType: DownstreamConsumerType;
  /** Org partition — required for isolation. */
  orgId: string;
  /** Optional: limit to specific conversations. */
  conversationIds?: string[];
  /** Read events after this cursor (exclusive). */
  afterCursor?: bigint;
  /** Maximum events to return per call. */
  limit?: number;
  /** Optional: filter by event types. */
  eventTypes?: RealtimeEventType[];
}

export interface ConsumeDownstreamEventsResult {
  events: DownstreamEvent[];
  /** If true, more events exist beyond this window. */
  hasMore: boolean;
  /** Cursor of the last returned event for resumption. */
  nextCursor?: bigint;
}

// ---------------------------------------------------------------------------
// Idempotency seam
// ---------------------------------------------------------------------------

export interface RecordConsumptionCheckpointInput {
  consumerType: DownstreamConsumerType;
  orgId: string;
  /** The highest cursor this consumer has successfully processed. */
  cursor: bigint;
  /** Optional: per-conversation cursor tracking. */
  conversationId?: string;
}

export interface ConsumptionCheckpoint {
  consumerType: DownstreamConsumerType;
  orgId: string;
  cursor: bigint;
  conversationId: string | null;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_DOWNSTREAM_CONSUMPTION_LIMIT = 500;

// ---------------------------------------------------------------------------
// Read durable events for downstream consumption
// ---------------------------------------------------------------------------

export async function consumeDownstreamEvents(
  tx: Prisma.TransactionClient | Prisma.Client,
  input: ConsumeDownstreamEventsInput,
): Promise<ConsumeDownstreamEventsResult> {
  const {
    orgId,
    conversationIds,
    afterCursor,
    limit = DEFAULT_DOWNSTREAM_CONSUMPTION_LIMIT,
    eventTypes,
  } = input;

  const where: Prisma.ConversationEventLogWhereInput = {
    orgId,
    ...(conversationIds && conversationIds.length > 0
      ? { conversationId: { in: conversationIds } }
      : {}),
    ...(afterCursor !== undefined ? { cursor: { gt: afterCursor } } : {}),
    ...(eventTypes && eventTypes.length > 0
      ? { eventType: { in: eventTypes } }
      : {}),
  };

  const rows = await tx.conversationEventLog.findMany({
    where,
    orderBy: { cursor: "asc" },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  const events: DownstreamEvent[] = trimmed.map((row) => ({
    eventId: row.eventId,
    cursor: row.cursor,
    eventType: row.eventType as RealtimeEventType,
    orgId: row.orgId,
    conversationId: row.conversationId,
    actorId: row.actorId,
    occurredAt: row.createdAt.getTime(),
    payload: row.payload as unknown,
  }));

  const nextCursor = events.length > 0 ? events[events.length - 1].cursor : undefined;

  return { events, hasMore, nextCursor };
}

// ---------------------------------------------------------------------------
// Checkpoint helpers for idempotent consumption
// ---------------------------------------------------------------------------

export async function recordConsumptionCheckpoint(
  tx: Prisma.TransactionClient | Prisma.Client,
  input: RecordConsumptionCheckpointInput,
): Promise<void> {
  await tx.downstreamConsumptionCheckpoint.upsert({
    where: {
      consumerType_orgId_conversationId: {
        consumerType: input.consumerType,
        orgId: input.orgId,
        conversationId: input.conversationId ?? "_global",
      },
    },
    create: {
      consumerType: input.consumerType,
      orgId: input.orgId,
      conversationId: input.conversationId ?? "_global",
      cursor: input.cursor,
    },
    update: {
      cursor: input.cursor,
      updatedAt: new Date(),
    },
  });
}

export async function getConsumptionCheckpoint(
  tx: Prisma.TransactionClient | Prisma.Client,
  params: {
    consumerType: DownstreamConsumerType;
    orgId: string;
    conversationId?: string;
  },
): Promise<ConsumptionCheckpoint | null> {
  const row = await tx.downstreamConsumptionCheckpoint.findUnique({
    where: {
      consumerType_orgId_conversationId: {
        consumerType: params.consumerType,
        orgId: params.orgId,
        conversationId: params.conversationId ?? "_global",
      },
    },
  });

  if (!row) return null;

  return {
    consumerType: row.consumerType as DownstreamConsumerType,
    orgId: row.orgId,
    cursor: row.cursor,
    conversationId: row.conversationId === "_global" ? null : row.conversationId,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Org-scoped event count for backpressure / diagnostics
// ---------------------------------------------------------------------------

export async function getDownstreamEventCount(
  tx: Prisma.TransactionClient | Prisma.Client,
  params: {
    orgId: string;
    afterCursor?: bigint;
    eventTypes?: RealtimeEventType[];
  },
): Promise<number> {
  return tx.conversationEventLog.count({
    where: {
      orgId: params.orgId,
      ...(params.afterCursor !== undefined
        ? { cursor: { gt: params.afterCursor } }
        : {}),
      ...(params.eventTypes && params.eventTypes.length > 0
        ? { eventType: { in: params.eventTypes } }
        : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Safe payload builders for downstream consumers
// ---------------------------------------------------------------------------

export interface NotificationEventPayload {
  messageId?: string;
  threadId?: string;
  mentionIds?: string[];
  actorId: string;
  conversationId: string;
}

export interface SearchIndexEventPayload {
  messageId?: string;
  threadId?: string;
  conversationId: string;
  actorId: string;
  action: "created" | "edited" | "deleted";
}

export interface AnalyticsEventPayload {
  eventType: RealtimeEventType;
  conversationId: string;
  actorId: string | null;
  timestamp: number;
}

/**
 * Build a safe notification payload from a durable event.
 * Never includes raw message body.
 */
export function buildNotificationPayload(
  event: DownstreamEvent,
): NotificationEventPayload | null {
  const data = event.payload as Record<string, unknown> | undefined;
  if (!data) return null;

  return {
    messageId: typeof data.messageId === "string" ? data.messageId : undefined,
    threadId: typeof data.threadId === "string" ? data.threadId : undefined,
    mentionIds: Array.isArray(data.mentionIds)
      ? data.mentionIds.filter((m): m is string => typeof m === "string")
      : undefined,
    actorId: event.actorId ?? "",
    conversationId: event.conversationId,
  };
}

/**
 * Build a safe search-index payload from a durable event.
 * Never includes raw message body.
 */
export function buildSearchIndexPayload(
  event: DownstreamEvent,
): SearchIndexEventPayload | null {
  const data = event.payload as Record<string, unknown> | undefined;
  if (!data) return null;

  const action = inferActionFromEventType(event.eventType);
  if (!action) return null;

  return {
    messageId: typeof data.messageId === "string" ? data.messageId : undefined,
    threadId: typeof data.threadId === "string" ? data.threadId : undefined,
    conversationId: event.conversationId,
    actorId: event.actorId ?? "",
    action,
  };
}

/**
 * Build a safe analytics payload from a durable event.
 * Contains only metadata, no content.
 */
export function buildAnalyticsPayload(
  event: DownstreamEvent,
): AnalyticsEventPayload {
  return {
    eventType: event.eventType,
    conversationId: event.conversationId,
    actorId: event.actorId,
    timestamp: event.occurredAt,
  };
}

function inferActionFromEventType(
  eventType: RealtimeEventType,
): "created" | "edited" | "deleted" | null {
  if (eventType.endsWith(".created")) return "created";
  if (eventType.endsWith(".edited")) return "edited";
  if (eventType.endsWith(".deleted")) return "deleted";
  return null;
}
