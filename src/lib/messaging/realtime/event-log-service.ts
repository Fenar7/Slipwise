import "server-only";

import { randomBytes } from "crypto";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { RealtimeEventType } from "./protocol";

/**
 * Durable event log service for realtime replay and downstream worker consumption.
 *
 * Responsibilities:
 * - Append replayable conversation events transactionally alongside mutations
 * - Assign monotonic per-conversation cursors
 * - Fetch replay windows by conversation/cursor
 * - Support safe reconnect/replay semantics
 *
 * Cursor model:
 * - Strictly monotonic per-conversation stream (each cursor = previous + 1)
 * - Ordered per-conversation stream; not globally ordered across orgs
 * - Collisions are prevented by @@unique([conversationId, cursor]) DB constraint
 *   with an in-transaction retry loop on contention
 */

// ---------------------------------------------------------------------------
// Cursor generation
// ---------------------------------------------------------------------------

/**
 * Generate a monotonic cursor for a conversation event.
 * Reads the latest persisted cursor for the conversation and returns
 * `latest + 1`, guaranteeing strict monotonicity even across process
 * restarts, multi-node writers, or backward clock skew.
 */
export async function generateMonotonicCursor(
  tx: Prisma.TransactionClient,
  conversationId: string,
): Promise<bigint> {
  const latest = await tx.conversationEventLog.findFirst({
    where: { conversationId },
    orderBy: { cursor: "desc" },
    select: { cursor: true },
  });
  return (latest?.cursor ?? 0n) + 1n;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("Unique constraint failed") || error.message.includes("P2002"))
  );
}

const MAX_APPEND_RETRIES = 3;

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

export interface AppendConversationEventInput {
  orgId: string;
  conversationId: string;
  eventType: RealtimeEventType;
  actorId?: string | null;
  payload: unknown;
}

export interface AppendConversationEventResult {
  eventId: string;
  cursor: bigint;
}

/**
 * Append a durable event record inside an existing Prisma transaction.
 * Must be called within the same transaction as the authoritative mutation
 * so that event durability matches commit success.
 */
export async function appendConversationEvent(
  tx: Prisma.TransactionClient,
  input: AppendConversationEventInput,
): Promise<AppendConversationEventResult> {
  const eventId = `${input.eventType}:${Date.now()}:${randomBytes(8).toString("hex")}`;

  for (let attempt = 0; attempt < MAX_APPEND_RETRIES; attempt++) {
    const cursor = await generateMonotonicCursor(tx, input.conversationId);

    try {
      await tx.conversationEventLog.create({
        data: {
          orgId: input.orgId,
          conversationId: input.conversationId,
          eventType: input.eventType,
          eventId,
          cursor,
          actorId: input.actorId ?? null,
          payload: input.payload as Prisma.InputJsonValue,
        },
      });

      return { eventId, cursor };
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_APPEND_RETRIES - 1) {
        continue; // retry with a freshly computed cursor
      }
      throw error;
    }
  }

  throw new Error("appendConversationEvent: exhausted retries");
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export interface ReplayConversationEvent {
  eventId: string;
  cursor: bigint;
  eventType: RealtimeEventType;
  orgId: string;
  conversationId: string;
  actorId: string | null;
  payload: unknown;
  occurredAt: number;
}

export type ReplayResultStatus =
  | "ok"
  | "cursor_not_found"
  | "cursor_stale"
  | "cursor_invalid";

export interface ReplayConversationEventsResult {
  status: ReplayResultStatus;
  events: ReplayConversationEvent[];
  /** If true, more events exist beyond the returned window. */
  hasMore: boolean;
}

/** Default maximum events returned in a single replay window. */
export const DEFAULT_REPLAY_LIMIT = 200;

/** Default retention window for replay (hours). Events older than this may be pruned. */
export const DEFAULT_REPLAY_RETENTION_HOURS = 72;

/**
 * Replay conversation events after a given cursor.
 * Authorization is the caller's responsibility: this function only filters by
 * org + conversation + cursor range. The gateway must verify the session is
 * currently authorized for the conversation before calling replay.
 */
export async function replayConversationEvents(
  tx: Prisma.TransactionClient | PrismaClient,
  params: {
    orgId: string;
    conversationId: string;
    afterCursor: string;
    limit?: number;
  },
): Promise<ReplayConversationEventsResult> {
  const { orgId, conversationId, afterCursor, limit = DEFAULT_REPLAY_LIMIT } = params;

  let after: bigint;
  try {
    after = BigInt(afterCursor);
  } catch {
    return { status: "cursor_invalid", events: [], hasMore: false };
  }

  // Verify the cursor exists in this conversation to detect stale/foreign cursors.
  const anchor = await tx.conversationEventLog.findFirst({
    where: { orgId, conversationId, cursor: after },
    select: { id: true, createdAt: true },
  });

  if (!anchor) {
    // Cursor does not belong to this conversation or was pruned.
    return { status: "cursor_not_found", events: [], hasMore: false };
  }

  const retentionCutoff = new Date(Date.now() - DEFAULT_REPLAY_RETENTION_HOURS * 60 * 60 * 1000);
  if (anchor.createdAt < retentionCutoff) {
    return { status: "cursor_stale", events: [], hasMore: false };
  }

  const rows = await tx.conversationEventLog.findMany({
    where: {
      orgId,
      conversationId,
      cursor: { gt: after },
    },
    orderBy: { cursor: "asc" },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;

  const events: ReplayConversationEvent[] = trimmed.map((row) => ({
    eventId: row.eventId,
    cursor: row.cursor,
    eventType: row.eventType as RealtimeEventType,
    orgId: row.orgId,
    conversationId: row.conversationId,
    actorId: row.actorId,
    payload: row.payload as unknown,
    occurredAt: row.createdAt.getTime(),
  }));

  return { status: "ok", events, hasMore };
}

// ---------------------------------------------------------------------------
// Diagnostics helpers
// ---------------------------------------------------------------------------

export async function getReplayWindowStats(
  tx: Prisma.TransactionClient | PrismaClient,
  params: { orgId: string; conversationId: string; afterCursor: string },
): Promise<{ count: number; oldestCursor: bigint | null; newestCursor: bigint | null }> {
  const after = BigInt(params.afterCursor);

  const [count, oldest, newest] = await Promise.all([
    tx.conversationEventLog.count({
      where: {
        orgId: params.orgId,
        conversationId: params.conversationId,
        cursor: { gt: after },
      },
    }),
    tx.conversationEventLog.findFirst({
      where: { orgId: params.orgId, conversationId: params.conversationId },
      orderBy: { cursor: "asc" },
      select: { cursor: true },
    }),
    tx.conversationEventLog.findFirst({
      where: { orgId: params.orgId, conversationId: params.conversationId },
      orderBy: { cursor: "desc" },
      select: { cursor: true },
    }),
  ]);

  return {
    count,
    oldestCursor: oldest?.cursor ?? null,
    newestCursor: newest?.cursor ?? null,
  };
}
