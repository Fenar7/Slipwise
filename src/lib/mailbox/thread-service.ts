import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { toMailboxThreadReadShape, toMailboxThreadDetailReadShape } from "./read-shapes";
import type { MailboxThreadReadShape, MailboxThreadDetailReadShape } from "./read-shapes";
import type { MailboxThreadStatus } from "./domain-types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export interface ListMailboxThreadsParams {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  /** Filter to a specific mailbox connection. Omit for all-inboxes view. */
  connectionId?: string;
  /** Filter by thread status. Single status or array of statuses. */
  status?: MailboxThreadStatus | MailboxThreadStatus[];
  /** Only return threads with unreadCount > 0. */
  unreadOnly?: boolean;
  /** Only return flagged threads. */
  isFlagged?: boolean;
  /** Filter by assignee. "me" = current user, "none" = unassigned. Omit for all. */
  assigneeFilter?: "me" | "none";
  /** Search query for subject and previewSnippet. Trimmed; empty values are ignored. */
  searchQuery?: string;
  /** Cursor for pagination (base64-encoded JSON {lastMessageAt, id}). */
  cursor?: string;
  /** Page size. Defaults to 50, capped at 100. */
  limit?: number;
}

export interface ListMailboxThreadsResult {
  threads: MailboxThreadReadShape[];
  nextCursor: string | null;
  totalCount: number;
}

function decodeCursor(cursor: string): { lastMessageAt: string; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      typeof decoded.lastMessageAt === "string" &&
      typeof decoded.id === "string"
    ) {
      return decoded;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(lastMessageAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ lastMessageAt: lastMessageAt.toISOString(), id }),
    "utf-8",
  ).toString("base64");
}

async function enrichThreadsWithAssigneeNames(
  threads: import("./read-shapes").MailboxThreadReadShape[],
): Promise<import("./read-shapes").MailboxThreadReadShape[]> {
  const ids = threads.map((t) => t.assigneeId).filter(Boolean) as string[];
  if (ids.length === 0) return threads;
  const profiles = await db.profile.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const map = new Map(profiles.map((p) => [p.id, p.name]));
  return threads.map((t) => ({
    ...t,
    assigneeName: t.assigneeId ? (map.get(t.assigneeId) ?? null) : null,
  }));
}

async function enrichDetailWithAssigneeName(
  detail: import("./read-shapes").MailboxThreadDetailReadShape,
): Promise<import("./read-shapes").MailboxThreadDetailReadShape> {
  if (!detail.assigneeId) return detail;
  const profile = await db.profile.findFirst({
    where: { id: detail.assigneeId },
    select: { name: true },
  });
  return { ...detail, assigneeName: profile?.name ?? null };
}

/**
 * List mailbox threads for an org member.
 *
 * - Resolves accessible connections via visibility service.
 * - Supports all-inboxes aggregate (omit connectionId) or single-mailbox scoped.
 * - Sorts unread-first, then by recency (lastMessageAt DESC).
 * - Cursor-based pagination.
 * - Org-scoped and permission-aware.
 */
export async function listMailboxThreads(
  params: ListMailboxThreadsParams,
): Promise<ListMailboxThreadsResult> {
  const {
    orgId,
    userId,
    role,
    connectionId,
    status,
    unreadOnly,
    isFlagged,
    assigneeFilter,
    searchQuery,
    cursor,
    limit: rawLimit,
  } = params;

  const limit = Math.min(
    Math.max(1, rawLimit ?? DEFAULT_LIMIT),
    MAX_LIMIT,
  );

  // Resolve accessible connections for this member
  const { accessible } = await listMailboxConnectionsForMember(
    orgId,
    userId,
    role,
  );

  const accessibleConnectionIds = accessible.map((c) => c.id);

  // If a specific connection was requested, verify access
  if (connectionId) {
    if (!accessibleConnectionIds.includes(connectionId)) {
      // Member has no access to this connection — return empty
      return { threads: [], nextCursor: null, totalCount: 0 };
    }
  }

  // If no accessible connections at all, return empty
  if (accessibleConnectionIds.length === 0) {
    return { threads: [], nextCursor: null, totalCount: 0 };
  }

  // Build where clause
  const connectionIdsToQuery = connectionId
    ? [connectionId]
    : accessibleConnectionIds;

  const baseWhere: Prisma.MailboxThreadWhereInput = {
    orgId,
    mailboxConnectionId: { in: connectionIdsToQuery },
  };

  if (status) {
    if (Array.isArray(status)) {
      baseWhere.status = { in: status };
    } else {
      baseWhere.status = status;
    }
  }

  if (unreadOnly) {
    baseWhere.unreadCount = { gt: 0 };
  }

  if (isFlagged) {
    baseWhere.isFlagged = true;
  }

  if (assigneeFilter === "me") {
    baseWhere.assigneeId = userId;
  } else if (assigneeFilter === "none") {
    baseWhere.assigneeId = null;
  }

  // Combine filter where with search condition
  const conditions: Prisma.MailboxThreadWhereInput[] = [baseWhere];

  const trimmedQuery = searchQuery?.trim();
  if (trimmedQuery) {
    conditions.push({
      OR: [
        { subject: { contains: trimmedQuery, mode: "insensitive" } },
        { previewSnippet: { contains: trimmedQuery, mode: "insensitive" } },
      ],
    });
  }

  const where = conditions.length > 1 ? { AND: conditions } : baseWhere;

  // Parse cursor for pagination
  let cursorCondition: Prisma.MailboxThreadWhereInput | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      cursorCondition = {
        OR: [
          { lastMessageAt: { lt: new Date(decoded.lastMessageAt) } },
          {
            lastMessageAt: new Date(decoded.lastMessageAt),
            id: { lt: decoded.id },
          },
        ],
      };
    }
  }

  const finalWhere: Prisma.MailboxThreadWhereInput = cursorCondition
    ? { AND: [where, cursorCondition] }
    : where;

  // Query with unread-first, then recency sorting
  const rows = await db.mailboxThread.findMany({
    where: finalWhere,
    orderBy: [
      { unreadCount: "desc" as const },
      { lastMessageAt: "desc" as const },
      { id: "desc" as const },
    ],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const nextCursor =
    hasMore && pageRows.length > 0
      ? encodeCursor(
          pageRows[pageRows.length - 1].lastMessageAt,
          pageRows[pageRows.length - 1].id,
        )
      : null;

  // Total count (without pagination)
  const totalCount = await db.mailboxThread.count({ where });

  const mappedThreads = pageRows.map(toMailboxThreadReadShape);
  const threads = await enrichThreadsWithAssigneeNames(mappedThreads);
  return { threads, nextCursor, totalCount };
}

/**
 * Get a single thread by ID, verifying the caller has access to its mailbox.
 */
export async function getMailboxThread(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<MailboxThreadReadShape | null> {
  const { accessible } = await listMailboxConnectionsForMember(
    orgId,
    userId,
    role,
  );

  const accessibleConnectionIds = accessible.map((c) => c.id);
  if (accessibleConnectionIds.length === 0) return null;

  const row = await db.mailboxThread.findFirst({
    where: {
      id: threadId,
      orgId,
      mailboxConnectionId: { in: accessibleConnectionIds },
    },
  });

  if (!row) return null;
  const mapped = toMailboxThreadReadShape(row);
  const [enriched] = await enrichThreadsWithAssigneeNames([mapped]);
  return enriched;
}

/**
 * Get a single thread detail by ID, including messages and attachments.
 * Verifies the caller has access to the thread's mailbox.
 * Messages are returned in chronological order (sentAt ASC).
 */
export async function getMailboxThreadDetail(
  orgId: string,
  userId: string,
  role: "owner" | "admin" | "member",
  threadId: string,
): Promise<MailboxThreadDetailReadShape | null> {
  const { accessible } = await listMailboxConnectionsForMember(
    orgId,
    userId,
    role,
  );

  const accessibleConnectionIds = accessible.map((c) => c.id);
  if (accessibleConnectionIds.length === 0) return null;

  const threadRow = await db.mailboxThread.findFirst({
    where: {
      id: threadId,
      orgId,
      mailboxConnectionId: { in: accessibleConnectionIds },
    },
    include: {
      messages: {
        orderBy: { sentAt: "asc" as const },
        include: {
          attachments: true,
        },
      },
    },
  });

  if (!threadRow) return null;

  const messages = threadRow.messages ?? [];
  const attachmentMap = new Map<string, typeof messages[0]["attachments"]>();
  for (const msg of messages) {
    attachmentMap.set(msg.id, msg.attachments ?? []);
  }

  const detail = toMailboxThreadDetailReadShape(threadRow, messages, attachmentMap);
  return enrichDetailWithAssigneeName(detail);
}
