import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { listMailboxConnections } from "./connection-service";
import { getMailboxProviderAdapter } from "./provider-registry";
import type { MailboxMessageEnvelope, MailboxThreadEnvelope } from "./provider-contracts";
import { isMailboxProviderError } from "./provider-contracts";
import { readMailboxCredential } from "./credential-store";
import { toMailboxThreadReadShape, toMailboxThreadDetailReadShape } from "./read-shapes";
import type { MailboxThreadReadShape, MailboxThreadDetailReadShape } from "./read-shapes";
import type { MailboxConnectionRecord, MailboxMessageRecord, MailboxThreadStatus } from "./domain-types";
import { upsertMailboxAttachment, upsertMailboxMessage, upsertMailboxThread, updateMailboxThreadSummary } from "./ingestion-service";
import { deriveThreadLastMessageAt, deriveThreadPreviewSnippet, computeThreadAttachmentCount } from "./normalization-service";
import { deriveThreadParticipants } from "./participant-service";
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
      STARRED: "STARRED",
      DRAFT: "DRAFT",
      TRASH: "TRASH",
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
  totalCount: number | null;
  searchMeta?: MailboxSearchMeta;
}

export interface MailboxSearchMeta {
  mode: "local" | "gmail_exact";
  totalCountIsExact: boolean;
  partial: boolean;
  partialConnectionIds: string[];
}

type LocalCursorPayload = {
  kind: "local";
  unreadCount: number;
  lastMessageAt: string;
  id: string;
};

type ProviderSearchCursorPayload = {
  kind: "provider_search";
  query: string;
  bufferedThreadKeys: string[];
  seenThreadKeys: string[];
  connectionPageTokens: Record<string, string | null>;
  localFallbackFetched: boolean;
  partialConnectionIds: string[];
  estimatedTotal: number | null;
};

type DecodedCursor = LocalCursorPayload | ProviderSearchCursorPayload;

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

function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    if (typeof decoded !== "object" || decoded === null) {
      return null;
    }

    if (
      "kind" in decoded &&
      decoded.kind === "provider_search" &&
      typeof decoded.query === "string" &&
      Array.isArray(decoded.bufferedThreadKeys) &&
      Array.isArray(decoded.seenThreadKeys) &&
      typeof decoded.connectionPageTokens === "object" &&
      decoded.connectionPageTokens !== null &&
      typeof decoded.localFallbackFetched === "boolean"
    ) {
      return {
        kind: "provider_search",
        query: decoded.query,
        bufferedThreadKeys: decoded.bufferedThreadKeys.filter((value): value is string => typeof value === "string"),
        seenThreadKeys: decoded.seenThreadKeys.filter((value): value is string => typeof value === "string"),
        connectionPageTokens: Object.fromEntries(
          Object.entries(decoded.connectionPageTokens).map(([key, value]) => [
            key,
            typeof value === "string" || value === null ? value : null,
          ]),
        ),
        localFallbackFetched: decoded.localFallbackFetched,
        partialConnectionIds:
          Array.isArray(decoded.partialConnectionIds)
            ? decoded.partialConnectionIds.filter((value): value is string => typeof value === "string")
            : [],
        estimatedTotal:
          typeof decoded.estimatedTotal === "number" ? decoded.estimatedTotal : null,
      };
    }

    if (
      "unreadCount" in decoded &&
      typeof decoded.unreadCount === "number" &&
      typeof decoded.lastMessageAt === "string" &&
      typeof decoded.id === "string"
    ) {
      return {
        kind: "local",
        unreadCount: decoded.unreadCount,
        lastMessageAt: decoded.lastMessageAt,
        id: decoded.id,
      };
    }

    if (
      typeof decoded.lastMessageAt === "string" &&
      typeof decoded.id === "string"
    ) {
      return {
        kind: "local",
        unreadCount: 0,
        lastMessageAt: decoded.lastMessageAt,
        id: decoded.id,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function encodeLocalCursor(unreadCount: number, lastMessageAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({
      kind: "local",
      unreadCount,
      lastMessageAt: lastMessageAt.toISOString(),
      id,
    } satisfies LocalCursorPayload),
    "utf-8",
  ).toString("base64");
}

function encodeProviderSearchCursor(payload: ProviderSearchCursorPayload): string {
  return Buffer.from(
    JSON.stringify(payload),
    "utf-8",
  ).toString("base64");
}

function makeThreadKey(connectionId: string, providerThreadId: string): string {
  return `${connectionId}:${providerThreadId}`;
}

function splitThreadKey(key: string): { connectionId: string; providerThreadId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }
  return {
    connectionId: key.slice(0, separatorIndex),
    providerThreadId: key.slice(separatorIndex + 1),
  };
}

function isUnreadMessage(message: MailboxMessageEnvelope): boolean {
  const metadata =
    message.providerMetadata && typeof message.providerMetadata === "object"
      ? message.providerMetadata
      : null;
  const labelIds = metadata ? (metadata as Record<string, unknown>).labelIds : null;
  return Array.isArray(labelIds) && labelIds.includes("UNREAD");
}

function isStarredMessage(message: MailboxMessageEnvelope): boolean {
  const metadata =
    message.providerMetadata && typeof message.providerMetadata === "object"
      ? message.providerMetadata
      : null;
  const labelIds = metadata ? (metadata as Record<string, unknown>).labelIds : null;
  return Array.isArray(labelIds) && labelIds.includes("STARRED");
}

function buildThreadEnvelopeFromDetail(
  providerThreadId: string,
  detailMessages: Array<MailboxMessageEnvelope & { htmlBody: string; textBody: string | null }>,
): MailboxThreadEnvelope {
  const lastMessage =
    [...detailMessages].sort(
      (left, right) =>
        new Date(right.receivedAt ?? right.sentAt).getTime() -
        new Date(left.receivedAt ?? left.sentAt).getTime(),
    )[0] ?? null;

  const participantMap = new Map<string, { email: string; displayName: string | null }>();
  for (const message of detailMessages) {
    const participants = [message.from, ...message.to, ...message.cc, ...message.bcc];
    for (const participant of participants) {
      if (!participant?.email) continue;
      participantMap.set(participant.email.toLowerCase(), {
        email: participant.email,
        displayName: participant.displayName ?? null,
      });
    }
  }

  return {
    providerThreadId,
    subject: lastMessage?.subject ?? "",
    lastMessageAt: new Date(
      lastMessage?.receivedAt ?? lastMessage?.sentAt ?? new Date().toISOString(),
    ).toISOString(),
    unreadCount: detailMessages.filter((message) => isUnreadMessage(message)).length,
    participants: [...participantMap.values()],
    providerMetadata: {},
  };
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

function buildSearchWhere(
  baseWhere: Prisma.MailboxThreadWhereInput,
  trimmedQuery: string | undefined,
): Prisma.MailboxThreadWhereInput {
  let textSearch = trimmedQuery || "";
  let fromFilter: string | null = null;
  let toFilter: string | null = null;

  if (trimmedQuery) {
    const parsed = parseSearchTerms(trimmedQuery);
    textSearch = parsed.textSearch;
    fromFilter = parsed.fromFilter;
    toFilter = parsed.toFilter;
  }

  if (!trimmedQuery) {
    return baseWhere;
  }

  const conditions: Prisma.MailboxThreadWhereInput[] = [baseWhere];
  const searchConditions: Prisma.MailboxThreadWhereInput[] = [];

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

  if (searchConditions.length === 1) {
    conditions.push(searchConditions[0]);
  } else if (searchConditions.length > 1) {
    conditions.push({ AND: searchConditions });
  }

  return conditions.length > 1 ? { AND: conditions } : baseWhere;
}

async function hydrateThreadFromProvider(params: {
  orgId: string;
  connection: MailboxConnectionRecord;
  providerThreadId: string;
}): Promise<void> {
  if (!params.connection.tokenRef) {
    throw new Error(`Mailbox connection ${params.connection.id} has no tokenRef`);
  }

  const adapter = getMailboxProviderAdapter(params.connection.provider);
  const detail = await adapter.fetchThreadDetail({
    orgId: params.orgId,
    tokenRef: params.connection.tokenRef,
    providerThreadId: params.providerThreadId,
  });
  if (isMailboxProviderError(detail)) {
    throw new Error(detail.safeMessage);
  }

  const envelope = buildThreadEnvelopeFromDetail(
    params.providerThreadId,
    detail.messages,
  );

  const thread = await upsertMailboxThread({
    orgId: params.orgId,
    mailboxConnectionId: params.connection.id,
    envelope,
  });

  const threadMessages: MailboxMessageRecord[] = [];
  for (const messageEnvelope of detail.messages) {
    const message = await upsertMailboxMessage({
      orgId: params.orgId,
      threadId: thread.id,
      envelope: messageEnvelope,
      mailboxEmail: params.connection.emailAddress,
    });
    threadMessages.push(message);

    for (const attachment of messageEnvelope.attachments ?? []) {
      await upsertMailboxAttachment({
        messageId: message.id,
        envelope: attachment,
      });
    }
  }

  await updateMailboxThreadSummary({
    orgId: params.orgId,
    threadId: thread.id,
    participantsSummary:
      deriveThreadParticipants(threadMessages) as unknown as Prisma.InputJsonValue,
    lastMessageAt: deriveThreadLastMessageAt(threadMessages, thread.lastMessageAt),
    previewSnippet: deriveThreadPreviewSnippet(threadMessages),
    attachmentCount: computeThreadAttachmentCount(threadMessages),
  });

  await db.mailboxThread.updateMany({
    where: { id: thread.id, orgId: params.orgId },
    data: {
      unreadCount: envelope.unreadCount,
      isFlagged: detail.messages.some((message) => isStarredMessage(message)),
    },
  });
}

async function resolveThreadsByProviderKeys(
  orgId: string,
  threadKeys: string[],
): Promise<Map<string, MailboxThreadReadShape>> {
  const groupedIds = new Map<string, string[]>();
  for (const key of threadKeys) {
    const parsed = splitThreadKey(key);
    if (!parsed) continue;
    const list = groupedIds.get(parsed.connectionId) ?? [];
    list.push(parsed.providerThreadId);
    groupedIds.set(parsed.connectionId, list);
  }

  if (groupedIds.size === 0) {
    return new Map();
  }

  const rows = await db.mailboxThread.findMany({
    where: {
      orgId,
      OR: [...groupedIds.entries()].map(([mailboxConnectionId, providerThreadIds]) => ({
        mailboxConnectionId,
        providerThreadId: { in: providerThreadIds },
      })),
    },
  });

  const mapped = await enrichThreadsWithAssigneeNames(
    rows.map(toMailboxThreadReadShape),
  );

  return new Map(
    mapped.map((thread) => [
      makeThreadKey(thread.mailboxConnectionId, thread.providerThreadId),
      thread,
    ]),
  );
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

  if (trimmedQuery) {
    const parsed = parseSearchTerms(trimmedQuery);
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
      searchMeta: trimmedQuery
        ? {
            mode: "local",
            totalCountIsExact: true,
            partial: false,
            partialConnectionIds: [],
          }
        : undefined,
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
  const accessibleSet = new Set(accessibleConnectionIds);

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

  const allConnectionRecords = await listMailboxConnections(orgId);
  const accessibleRecords = allConnectionRecords.filter((record) =>
    accessibleSet.has(record.id),
  );
  const accessibleRecordById = new Map(
    accessibleRecords.map((record) => [record.id, record]),
  );

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
  } else if (folder === "STARRED") {
    // Starred folder: thread must be flagged (starred). Gmail STARRED label
    // is synced to isFlagged during ingestion.
    baseWhere.isFlagged = true;
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
  } else if (folder === "TRASH") {
    const trashRows = await db.mailboxMessage.findMany({
      where: {
        orgId,
        thread: { mailboxConnectionId: { in: connectionIdsToQuery } },
      },
      select: { threadId: true, providerMetadata: true },
    });
    const trashThreadIds = [...new Set(trashRows
      .filter((row) => hasTrashLabel(row.providerMetadata))
      .map((row) => row.threadId))];
    if (trashThreadIds.length === 0) {
      return { threads: [], nextCursor: null, totalCount: 0 };
    }
    baseWhere.id = { in: trashThreadIds };
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

  if (trimmedQuery) {
    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    const providerCursor =
      decodedCursor?.kind === "provider_search" &&
      decodedCursor.query === trimmedQuery
        ? decodedCursor
        : null;

    const gmailConnections = connectionIdsToQuery
      .map((id) => accessibleRecordById.get(id))
      .filter(
        (record): record is MailboxConnectionRecord =>
          !!record && record.provider === "GMAIL" && typeof record.tokenRef === "string",
      );

    if (gmailConnections.length === 0) {
      const where = buildSearchWhere(baseWhere, trimmedQuery);

      let cursorCondition: Prisma.MailboxThreadWhereInput | undefined;
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded?.kind === "local") {
          cursorCondition = {
            OR: [
              { unreadCount: { lt: decoded.unreadCount } },
              {
                unreadCount: decoded.unreadCount,
                OR: [
                  { lastMessageAt: { lt: new Date(decoded.lastMessageAt) } },
                  {
                    lastMessageAt: new Date(decoded.lastMessageAt),
                    id: { lt: decoded.id },
                  },
                ],
              },
            ],
          };
        }
      }

      const finalWhere: Prisma.MailboxThreadWhereInput = cursorCondition
        ? { AND: [where, cursorCondition] }
        : where;

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
          ? encodeLocalCursor(
              pageRows[pageRows.length - 1].unreadCount,
              pageRows[pageRows.length - 1].lastMessageAt,
              pageRows[pageRows.length - 1].id,
            )
          : null;

      const totalCount = await db.mailboxThread.count({ where });
      const mappedThreads = pageRows.map(toMailboxThreadReadShape);
      const threads = await enrichThreadsWithAssigneeNames(mappedThreads);

      return {
        threads,
        nextCursor,
        totalCount,
        searchMeta: {
          mode: "local",
          totalCountIsExact: true,
          partial: false,
          partialConnectionIds: [],
        },
      };
    }

    const partialConnectionIds = new Set<string>(
      providerCursor?.partialConnectionIds ?? [],
    );
    const bufferedThreadKeys = [...(providerCursor?.bufferedThreadKeys ?? [])];
    const seenThreadKeys = new Set<string>(providerCursor?.seenThreadKeys ?? []);
    const connectionPageTokens = new Map<string, string | null | undefined>();

    for (const connection of gmailConnections) {
      connectionPageTokens.set(
        connection.id,
        providerCursor?.connectionPageTokens[connection.id] ?? null,
      );
    }

    const SEARCH_MAX_PROVIDER_RESULTS = Math.min(Math.max(limit * 2, 50), 100);

    while (bufferedThreadKeys.length < limit) {
      const bufferedCountBeforeLoop = bufferedThreadKeys.length;
      const pendingConnections = gmailConnections.filter((connection) => {
        if (!connectionPageTokens.has(connection.id)) {
          return true;
        }
        return connectionPageTokens.get(connection.id) !== undefined;
      });

      if (pendingConnections.length === 0) {
        break;
      }

      let fetchedAnyPage = false;

      for (const connection of pendingConnections) {
        const token = connectionPageTokens.get(connection.id);
        if (token === undefined) {
          continue;
        }

        const adapter = getMailboxProviderAdapter(connection.provider);
        if (!adapter.searchThreads) {
          partialConnectionIds.add(connection.id);
          connectionPageTokens.set(connection.id, undefined);
          continue;
        }

        const result = await adapter.searchThreads({
          orgId,
          tokenRef: connection.tokenRef!,
          query: trimmedQuery,
          pageToken: token ?? undefined,
          maxResults: SEARCH_MAX_PROVIDER_RESULTS,
        });

        fetchedAnyPage = true;

        if (isMailboxProviderError(result)) {
          partialConnectionIds.add(connection.id);
          connectionPageTokens.set(connection.id, undefined);
          continue;
        }

        if (result.nextPageToken) {
          connectionPageTokens.set(connection.id, result.nextPageToken);
        } else {
          connectionPageTokens.set(connection.id, undefined);
        }

        let appendedFromConnection = 0;
        for (const hit of result.hits) {
          const key = makeThreadKey(connection.id, hit.providerThreadId);
          if (seenThreadKeys.has(key)) {
            continue;
          }
          seenThreadKeys.add(key);
          bufferedThreadKeys.push(key);
          appendedFromConnection += 1;
        }

        // Guard against sticky provider pagination loops that keep returning
        // duplicate hits with the same page token.
        if (appendedFromConnection === 0 && result.nextPageToken === token) {
          connectionPageTokens.set(connection.id, undefined);
        }
      }

      if (!fetchedAnyPage) {
        break;
      }

      if (bufferedThreadKeys.length === bufferedCountBeforeLoop) {
        break;
      }
    }

    if (!providerCursor?.localFallbackFetched) {
      const localSearchWhere = buildSearchWhere(baseWhere, trimmedQuery);
      const rows = await db.mailboxThread.findMany({
        where: localSearchWhere,
        orderBy: [
          { lastMessageAt: "desc" as const },
          { id: "desc" as const },
        ],
        take: limit * 3,
      });

      for (const row of rows) {
        const key = makeThreadKey(row.mailboxConnectionId, row.providerThreadId);
        if (seenThreadKeys.has(key)) continue;
        bufferedThreadKeys.push(key);
        seenThreadKeys.add(key);
      }
    }

    const keysToHydrate = [...new Set(bufferedThreadKeys)];
    let resolvedByKey = await resolveThreadsByProviderKeys(orgId, keysToHydrate);
    const missingKeys = keysToHydrate.filter((key) => !resolvedByKey.has(key));

    for (const key of missingKeys) {
      const parsed = splitThreadKey(key);
      if (!parsed) continue;
      const connection = accessibleRecordById.get(parsed.connectionId);
      if (!connection || !connection.tokenRef || connection.provider !== "GMAIL") {
        partialConnectionIds.add(parsed.connectionId);
        continue;
      }

      try {
        await hydrateThreadFromProvider({
          orgId,
          connection,
          providerThreadId: parsed.providerThreadId,
        });
      } catch {
        partialConnectionIds.add(parsed.connectionId);
      }
    }

    resolvedByKey = await resolveThreadsByProviderKeys(orgId, keysToHydrate);

    const orderedThreads: MailboxThreadReadShape[] = [];
    const remainderKeys: string[] = [];
    for (const key of bufferedThreadKeys) {
      const thread = resolvedByKey.get(key);
      if (!thread) {
        const parsed = splitThreadKey(key);
        if (parsed) partialConnectionIds.add(parsed.connectionId);
        continue;
      }

      if (orderedThreads.length < limit) {
        orderedThreads.push(thread);
      } else {
        remainderKeys.push(key);
      }
    }

    const nextPageTokenEntries = Object.entries(
      Object.fromEntries(connectionPageTokens.entries()),
    ).filter(([, value]) => value !== undefined);

    const nextCursor =
      remainderKeys.length > 0 || nextPageTokenEntries.length > 0
        ? encodeProviderSearchCursor({
            kind: "provider_search",
            query: trimmedQuery,
            bufferedThreadKeys: remainderKeys,
            seenThreadKeys: [...seenThreadKeys],
            connectionPageTokens: Object.fromEntries(
              nextPageTokenEntries.map(([key, value]) => [key, value ?? null]),
            ),
            localFallbackFetched: true,
            partialConnectionIds: [...partialConnectionIds],
            estimatedTotal: gmailConnections.length > 0 ? null : orderedThreads.length,
          })
        : null;

      return {
        threads: orderedThreads,
        nextCursor,
        totalCount: null,
        searchMeta: {
          mode: "gmail_exact",
          totalCountIsExact: false,
        partial: partialConnectionIds.size > 0,
        partialConnectionIds: [...partialConnectionIds],
      },
    };
  }

  const where = buildSearchWhere(baseWhere, undefined);

  let cursorCondition: Prisma.MailboxThreadWhereInput | undefined;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.kind === "local") {
      cursorCondition = {
        OR: [
          { unreadCount: { lt: decoded.unreadCount } },
          {
            unreadCount: decoded.unreadCount,
            OR: [
              { lastMessageAt: { lt: new Date(decoded.lastMessageAt) } },
              {
                lastMessageAt: new Date(decoded.lastMessageAt),
                id: { lt: decoded.id },
              },
            ],
          },
        ],
      };
    }
  }

  const finalWhere: Prisma.MailboxThreadWhereInput = cursorCondition
    ? { AND: [where, cursorCondition] }
    : where;

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
      ? encodeLocalCursor(
          pageRows[pageRows.length - 1].unreadCount,
          pageRows[pageRows.length - 1].lastMessageAt,
          pageRows[pageRows.length - 1].id,
        )
      : null;

  const totalCount = await db.mailboxThread.count({ where });

  const mappedThreads = pageRows.map(toMailboxThreadReadShape);
  const threads = await enrichThreadsWithAssigneeNames(mappedThreads);
  return {
    threads,
    nextCursor,
    totalCount,
    searchMeta: undefined,
  };
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
async function repairMessageBodies(
  orgId: string,
  connectionId: string,
  providerThreadId: string,
  messageIdsToRepair: Array<{ id: string; providerMessageId: string }>,
): Promise<void> {
  if (messageIdsToRepair.length === 0) return;

  const connection = await db.mailboxConnection.findFirst({
    where: { id: connectionId, orgId },
    select: { provider: true, tokenRef: true },
  });
  if (!connection || !connection.tokenRef) return;

  const credential = await readMailboxCredential(orgId, connection.tokenRef);
  if (!credential) return;

  const adapter = getMailboxProviderAdapter(connection.provider);
  const fetchResult = await adapter.fetchThreadDetail({
    orgId,
    tokenRef: connection.tokenRef,
    providerThreadId,
  });

  if (isMailboxProviderError(fetchResult)) return;

  const providerMessages = fetchResult.messages ?? [];
  for (const msg of messageIdsToRepair) {
    const match = providerMessages.find((pm) => pm.providerMessageId === msg.providerMessageId);
    if (!match) continue;

    const recoveredHtml = match.htmlBody || "";
    const recoveredText = match.textBody ?? null;
    if (!recoveredHtml && !recoveredText) continue;

    try {
      await db.mailboxMessage.update({
        where: { id: msg.id, orgId },
        data: {
          ...(recoveredHtml ? { htmlBody: recoveredHtml } : {}),
          ...(recoveredText ? { textBody: recoveredText } : {}),
        },
      });
    } catch {
      // Best-effort repair
    }
  }
}

/**
 * Get a single thread detail by ID, including messages and attachments.
 * Verifies the caller has access to the thread's mailbox.
 * Messages are returned in chronological order (sentAt ASC).
 *
 * Includes bounded body repair: if any messages have empty htmlBody/textBody,
 * a single provider re-fetch is attempted to recover the content.
 * This is idempotent and will not thrash the provider on every open.
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

  // Bounded body repair: attempt one provider re-fetch for messages with empty bodies
  const messagesBeforeRepair = threadRow.messages ?? [];
  const messageIdsToRepair = messagesBeforeRepair
    .filter((msg) => !msg.htmlBody && (!msg.textBody || msg.textBody.trim().length === 0))
    .map((msg) => ({ id: msg.id, providerMessageId: msg.providerMessageId }));
  await repairMessageBodies(orgId, threadRow.mailboxConnectionId, threadRow.providerThreadId, messageIdsToRepair);

  // Re-read messages after potential repair
  const refreshedThread = await db.mailboxThread.findFirst({
    where: { id: threadId, orgId },
    include: {
      messages: {
        orderBy: { sentAt: "asc" as const },
        include: { attachments: true },
      },
    },
  });

  if (!refreshedThread) return null;

  const messages = refreshedThread.messages ?? [];
  const attachmentMap = new Map<string, typeof messages[0]["attachments"]>();
  for (const msg of messages) {
    attachmentMap.set(msg.id, msg.attachments ?? []);
  }

  const detail = toMailboxThreadDetailReadShape(refreshedThread, messages, attachmentMap);
  return enrichDetailWithAssigneeName(detail);
}
