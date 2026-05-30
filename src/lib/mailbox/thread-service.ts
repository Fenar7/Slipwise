import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { toMailboxThreadReadShape, toMailboxThreadDetailReadShape } from "./read-shapes";
import type { MailboxThreadReadShape, MailboxThreadDetailReadShape } from "./read-shapes";
import type { MailboxThreadStatus } from "./domain-types";
import type { MailboxFolder } from "@/app/app/mailbox/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Parse a search query into structured search terms.
 * Supports:
 * - "from:email@example.com" — search sender
 * - "to:email@example.com" — search recipients (to/cc/bcc)
 * - "in:inbox" / "in:sent" / "in:spam" / "in:archive" — folder scoping
 * - plain text — searches subject, previewSnippet, sender, and recipients
 */
function parseSearchTerms(query: string): {
  textSearch: string;
  fromFilter: string | null;
  toFilter: string | null;
  folderHint: MailboxFolder | null;
} {
  let textSearch = query;
  let fromFilter: string | null = null;
  let toFilter: string | null = null;
  let folderHint: MailboxFolder | null = null;

  // Extract from: operator
  const fromMatch = textSearch.match(/\bfrom:(\S+)/i);
  if (fromMatch) {
    fromFilter = fromMatch[1];
    textSearch = textSearch.replace(fromMatch[0], "").trim();
  }

  // Extract to: operator
  const toMatch = textSearch.match(/\bto:(\S+)/i);
  if (toMatch) {
    toFilter = toMatch[1];
    textSearch = textSearch.replace(toMatch[0], "").trim();
  }

  // Extract in: operator
  const folderMatch = textSearch.match(/\bin:(\w+)/i);
  if (folderMatch) {
    const rawFolder = folderMatch[1].toUpperCase();
    const folderMap: Record<string, MailboxFolder> = {
      INBOX: "INBOX",
      SENT: "SENT",
      SPAM: "SPAM",
      ARCHIVE: "ARCHIVE",
      DRAFT: "DRAFT",
    };
    if (rawFolder in folderMap) {
      folderHint = folderMap[rawFolder];
      textSearch = textSearch.replace(folderMatch[0], "").trim();
    }
  }

  return { textSearch, fromFilter, toFilter, folderHint };
}

export interface ListMailboxThreadsParams {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  /** Filter to a specific mailbox connection. Omit for all-inboxes view. */
  connectionId?: string;
  /** Folder-scoped mailbox view. Used for connection routes such as sent/spam/archive. */
  folder?: MailboxFolder;
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

function hasSpamLabel(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const labelIds = (metadata as Record<string, unknown>).labelIds;
  return Array.isArray(labelIds) && labelIds.includes("SPAM");
}

function hasTrashLabel(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
  const labelIds = (metadata as Record<string, unknown>).labelIds;
  return Array.isArray(labelIds) && labelIds.includes("TRASH");
}

async function resolveSpamThreadIds(
  orgId: string,
  connectionIds: string[],
): Promise<string[]> {
  if (connectionIds.length === 0) return [];

  const rows = await db.mailboxMessage.findMany({
    where: {
      orgId,
      thread: {
        mailboxConnectionId: { in: connectionIds },
      },
    },
    select: {
      threadId: true,
      providerMetadata: true,
    },
  });

  return [...new Set(rows.filter((row) => hasSpamLabel(row.providerMetadata)).map((row) => row.threadId))];
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
  if (!db.profile) {
    return threads.map((t) => ({ ...t, assigneeName: null }));
  }
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
  if (!db.profile) {
    return { ...detail, assigneeName: null };
  }
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

  let { folder } = params;

  const trimmedQuery = searchQuery?.trim();
  let textSearch = trimmedQuery || "";
  let fromFilter: string | null = null;
  let toFilter: string | null = null;

  if (trimmedQuery) {
    const parsed = parseSearchTerms(trimmedQuery);
    textSearch = parsed.textSearch;
    fromFilter = parsed.fromFilter;
    toFilter = parsed.toFilter;
    if (parsed.folderHint && !folder) {
      folder = parsed.folderHint;
    }
  }

  if (folder === "DRAFT") {
    // Truthful handling: drafts are excluded from thread search completely
    // as they reside in a separate UX/route.
    return {
      threads: [],
      nextCursor: null,
      totalCount: 0,
    };
  }

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

  if (folder === "INBOX" && !status) {
    baseWhere.status = { in: ["OPEN", "PENDING"] };
  } else if (folder === "ARCHIVE") {
    // Gmail-grade archive semantics: thread must be ARCHIVED, but NOT in
    // spam and NOT in trash. Spam-to-trash movements should disappear from
    // archive view even if the thread status was previously ARCHIVED.
    const spamThreadIds = await resolveSpamThreadIds(orgId, connectionIdsToQuery);
    const trashRows = await db.mailboxMessage.findMany({
      where: {
        orgId,
        thread: {
          mailboxConnectionId: { in: connectionIdsToQuery },
          status: "ARCHIVED",
        },
      },
      select: { threadId: true, providerMetadata: true },
    });
    const trashThreadIds = [...new Set(trashRows
      .filter((row) => hasTrashLabel(row.providerMetadata))
      .map((row) => row.threadId))];
    const excludeIds = [...new Set([...spamThreadIds, ...trashThreadIds])];

    baseWhere.status = "ARCHIVED";
    if (excludeIds.length > 0) {
      baseWhere.id = { notIn: excludeIds };
    }
  } else if (folder === "SENT") {
    baseWhere.messages = {
      some: {
        direction: "outbound",
      },
    };
  } else if (folder === "SPAM") {
    const spamThreadIds = await resolveSpamThreadIds(orgId, connectionIdsToQuery);
    if (spamThreadIds.length === 0) {
      return { threads: [], nextCursor: null, totalCount: 0 };
    }
    baseWhere.id = { in: spamThreadIds };
  }

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

  if (trimmedQuery) {
    // Build search conditions
    const searchConditions: Prisma.MailboxThreadWhereInput[] = [];

    // Text search across subject, previewSnippet, body, sender, and recipients
    if (textSearch) {
      searchConditions.push({
        OR: [
          { subject: { contains: textSearch, mode: "insensitive" } },
          { previewSnippet: { contains: textSearch, mode: "insensitive" } },
          {
            messages: {
              some: {
                OR: [
                  { textBody: { contains: textSearch, mode: "insensitive" } },
                  { from: { path: ["email"], string_contains: textSearch, mode: "insensitive" } },
                  { from: { path: ["displayName"], string_contains: textSearch, mode: "insensitive" } },
                  { to: { array_contains: [{ email: textSearch }] } },
                  { cc: { array_contains: [{ email: textSearch }] } },
                  { bcc: { array_contains: [{ email: textSearch }] } },
                ],
              },
            },
          },
        ],
      });
    }

    // From filter: search messages where sender email or name contains the query
    if (fromFilter) {
      searchConditions.push({
        messages: {
          some: {
            OR: [
              { from: { path: ["email"], string_contains: fromFilter, mode: "insensitive" } },
              { from: { path: ["displayName"], string_contains: fromFilter, mode: "insensitive" } },
            ],
          },
        },
      });
    }

    // To filter: search messages where any recipient contains the query
    if (toFilter) {
      searchConditions.push({
        messages: {
          some: {
            OR: [
              { to: { array_contains: [{ email: toFilter }] } },
              { cc: { array_contains: [{ email: toFilter }] } },
              { bcc: { array_contains: [{ email: toFilter }] } },
            ],
          },
        },
      });
    }

    if (searchConditions.length > 0) {
      if (searchConditions.length === 1) {
        conditions.push(searchConditions[0]);
      } else {
        conditions.push({ AND: searchConditions });
      }
    }
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
