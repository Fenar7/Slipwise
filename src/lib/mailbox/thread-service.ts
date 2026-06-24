import "server-only";

import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { listMailboxConnectionsForMember } from "./visibility-service";
import { listMailboxConnections } from "./connection-service";
import { indexMailboxThread, indexMailboxMessage } from "./search-indexing-service";
import { getMailboxProviderAdapter, findMailboxProviderAdapter } from "./provider-registry";
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
import { getBatchMailboxFolderCoverage } from "./folder-coverage-service";
import { connectionRequiresReconnect } from "./domain-types";
import { parseSearchQuery } from "./search-query-parser";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/** Sprint B: Explicit search modes. */
export type SearchMode = "threads" | "messages";

/**
 * Sprint B: Message-level search result shape for UI consumption.
 * Each result represents a single matched message within a thread.
 */
export interface MailboxMessageResult {
  /** Local message DB ID (if hydrated). */
  id: string | null;
  threadId: string | null;
  providerThreadId: string;
  providerMessageId: string;
  /** Sender identity. */
  from: { email: string; displayName: string | null } | null;
  subject: string;
  /** Matched snippet / preview. */
  snippet: string;
  /** ISO timestamp. */
  sentAt: string;
  /** Parent thread subject (for context). */
  threadSubject: string;
  /** Mailbox connection ID for scoping. */
  mailboxConnectionId: string;
  /** Whether this is a fully hydrated local result or a provider-shell result. */
  isShellResult: boolean;
  /** Mailbox display name for context. */
  mailboxDisplayName: string | null;
}

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
  const parsed = parseSearchQuery(query);
  let folderHint: MailboxFolder | null = null;
  if (parsed.in) {
    const rawFolder = parsed.in.toUpperCase();
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
    }
  }

  return {
    textSearch: parsed.text,
    fromFilter: parsed.from,
    toFilter: parsed.to,
    folderHint,
  };
}

interface SearchDiagnostics {
  query: string;
  mode: "local" | "gmail_exact" | "hybrid";
  connectionStates: Array<{
    connectionId: string;
    status: string;
    reason: string;
    coverageComplete: boolean;
    providerHitCount: number;
    localFallbackCount: number;
    hydrationMissCount: number;
  }>;
}


/**
 * Determine whether a connection status represents actual search degradation
 * for the given search mode, versus an expected capability limitation.
 *
 * In local mode, provider_unsupported is informational -- local search IS the
 * authoritative path for non-Gmail connections and should not trigger degraded UX.
 * In gmail_exact mode, provider_unsupported means the adapter cannot perform
 * provider search, which IS a real degradation for that connection.
 */
function isSearchModeDegradedStatus(
  status: string,
  searchMode: "local" | "gmail_exact" | "hybrid",
): boolean {
  if (status === "ok") return false;
  if (searchMode === "local" && status === "provider_unsupported") return false;
  return true;
}

function logSearchDiagnostics(diagnostics: SearchDiagnostics) {
  console.log("[SearchDiagnostics]", JSON.stringify({
    timestamp: new Date().toISOString(),
    queryLength: diagnostics.query.length,
    mode: diagnostics.mode,
    connections: diagnostics.connectionStates.map(c => ({
      connectionId: c.connectionId,
      status: c.status,
      reason: c.reason,
      coverageComplete: c.coverageComplete,
      providerHitCount: c.providerHitCount,
      localFallbackCount: c.localFallbackCount,
      hydrationMissCount: c.hydrationMissCount,
    })),
  }));
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
  /** Sprint B: Search mode — "threads" (default) or "messages". */
  searchMode?: SearchMode;
  /** Cursor for pagination (base64-encoded JSON {lastMessageAt, id}). */
  cursor?: string;
  /** Page size. Defaults to 50, capped at 100. */
  limit?: number;
}

export interface ListMailboxThreadsResult {
  threads: MailboxThreadReadShape[];
  /** Sprint B: Message-level results when searchMode is "messages". */
  messages?: MailboxMessageResult[];
  nextCursor: string | null;
  totalCount: number | null;
  searchMeta?: MailboxSearchMeta;
}

export interface MailboxSearchMeta {
  mode: "local" | "gmail_exact" | "hybrid";
  /** Sprint B: The user-requested search mode. */
  searchMode: SearchMode;
  totalCountIsExact: boolean;
  partial: boolean;
  partialConnectionIds: string[];
  coverageState: "complete" | "partial" | "unknown";
  connectionStates: Array<{
    connectionId: string;
    status:
      | "ok"
      | "coverage_incomplete"
      | "auth_expired"
      | "provider_failed"
      | "hydration_failed"
      | "provider_unsupported";
    reason: string;
  }>;
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

type SearchCursorPayload = {
  kind: "search";
  query: string;
  offset: number;
};

type DecodedCursor = LocalCursorPayload | ProviderSearchCursorPayload | SearchCursorPayload;

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

  if (typeof db.$queryRaw !== "function") {
    const rows = await db.mailboxMessage.findMany({
      where: {
        orgId,
        thread: { mailboxConnectionId: { in: connectionIds } },
      },
      select: { threadId: true, providerMetadata: true },
    });
    return [...new Set(rows.filter((row) => hasSpamLabel(row.providerMetadata)).map((row) => row.threadId))];
  }

  const rows = await db.$queryRaw<Array<{ threadId: string }>>`
    SELECT DISTINCT m."threadId"
    FROM "mailbox_message" m
    JOIN "mailbox_thread" t ON t."id" = m."threadId"
    WHERE m."orgId" = ${orgId}
      AND t."mailboxConnectionId" IN (${Prisma.join(connectionIds)})
      AND (m."providerMetadata"->'labelIds')::jsonb @> '["SPAM"]'::jsonb
  `;
  return rows.map((r) => r.threadId);
}

async function resolveTrashThreadIds(
  orgId: string,
  connectionIds: string[],
): Promise<string[]> {
  if (connectionIds.length === 0) return [];

  if (typeof db.$queryRaw !== "function") {
    const rows = await db.mailboxMessage.findMany({
      where: {
        orgId,
        thread: { mailboxConnectionId: { in: connectionIds } },
      },
      select: { threadId: true, providerMetadata: true },
    });
    return [...new Set(rows.filter((row) => hasTrashLabel(row.providerMetadata)).map((row) => row.threadId))];
  }

  const rows = await db.$queryRaw<Array<{ threadId: string }>>`
    SELECT DISTINCT m."threadId"
    FROM "mailbox_message" m
    JOIN "mailbox_thread" t ON t."id" = m."threadId"
    WHERE m."orgId" = ${orgId}
      AND t."mailboxConnectionId" IN (${Prisma.join(connectionIds)})
      AND (m."providerMetadata"->'labelIds')::jsonb @> '["TRASH"]'::jsonb
  `;
  return rows.map((r) => r.threadId);
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

    if (
      "kind" in decoded &&
      decoded.kind === "search" &&
      typeof decoded.query === "string" &&
      typeof decoded.offset === "number"
    ) {
      return {
        kind: "search",
        query: decoded.query,
        offset: decoded.offset,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function encodeSearchCursor(query: string, offset: number): string {
  return Buffer.from(
    JSON.stringify({
      kind: "search",
      query,
      offset,
    } satisfies SearchCursorPayload),
    "utf-8"
  ).toString("base64");
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

export async function hydrateThreadFromProvider(params: {
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

  await indexMailboxThread(params.orgId, thread.id);
  for (const message of threadMessages) {
    await indexMailboxMessage(params.orgId, message.id);
  }
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

export async function resolveMailboxThreadIdFromProviderRef(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  mailboxConnectionId: string;
  providerThreadId: string;
}): Promise<string | null> {
  const accessible = await listMailboxConnectionsForMember({
    orgId: params.orgId,
    userId: params.userId,
    role: params.role,
  });
  if (!accessible.some((connection) => connection.id === params.mailboxConnectionId)) {
    return null;
  }

  const threadKey = makeThreadKey(params.mailboxConnectionId, params.providerThreadId);
  let resolved = await resolveThreadsByProviderKeys(params.orgId, [threadKey]);
  const existingThread = resolved.get(threadKey);
  if (existingThread) {
    return existingThread.id;
  }

  const allConnectionRecords = await listMailboxConnections(params.orgId);
  const connection = allConnectionRecords.find(
    (record) => record.id === params.mailboxConnectionId,
  );
  if (
    !connection ||
    connection.provider !== "GMAIL" ||
    !connection.tokenRef ||
    connectionRequiresReconnect(connection.status)
  ) {
    return null;
  }

  await hydrateThreadFromProvider({
    orgId: params.orgId,
    connection,
    providerThreadId: params.providerThreadId,
  });

  resolved = await resolveThreadsByProviderKeys(params.orgId, [threadKey]);
  return resolved.get(threadKey)?.id ?? null;
}

/**
 * Sprint B: Message-mode search.
 * Searches at the message level using provider searchMessages, then resolves
 * parent threads from the local DB. Produces shell results for provider hits
 * that haven't been hydrated yet.
 */
async function searchMailboxMessages(params: {
  orgId: string;
  userId: string;
  role: "owner" | "admin" | "member";
  connectionId: string | undefined;
  trimmedQuery: string;
  searchMode: SearchMode;
  accessibleConnectionIds: string[];
  accessibleSet: Set<string>;
  accessibleRecordById: Map<string, MailboxConnectionRecord>;
  connectionIdsToQuery: string[];
  limit: number;
  cursor?: string | null;
}): Promise<ListMailboxThreadsResult> {
  const {
    orgId,
    trimmedQuery,
    searchMode,
    accessibleRecordById,
    connectionIdsToQuery,
    limit,
    cursor,
  } = params;

  const batchCoverageProviders = new Map(
    connectionIdsToQuery.map((id) => [id, accessibleRecordById.get(id)?.provider ?? "GMAIL" as const]),
  );
  const { coveragesByConnectionId } = await getBatchMailboxFolderCoverage(
    orgId,
    connectionIdsToQuery,
    batchCoverageProviders,
  );

  // ── LOCAL-FIRST: If ALL connections have complete coverage, search locally ──
  const allCoveragesComplete = connectionIdsToQuery.every((connId) => {
    const overallState = coveragesByConnectionId.get(connId)?.overallState;
    return overallState === "COMPLETE";
  });

  if (allCoveragesComplete && connectionIdsToQuery.length > 0) {
    return searchMailboxMessagesLocal({
      orgId,
      trimmedQuery,
      accessibleConnectionIds: connectionIdsToQuery,
      accessibleRecordById,
      limit,
      cursor,
    });
  }

  // ── FALLBACK: Coverage incomplete — use Gmail API search ──────────────────
  const connectionStatusMap = new Map<
    string,
    {
      status:
        | "ok"
        | "coverage_incomplete"
        | "auth_expired"
        | "provider_failed"
        | "hydration_failed"
        | "provider_unsupported";
      reason: string;
    }
  >();

  for (const connId of connectionIdsToQuery) {
    const record = accessibleRecordById.get(connId);
    if (!record) continue;

    const supportsSearch = findMailboxProviderAdapter(record.provider)?.descriptor.supportsSearch ?? false;
    if (!supportsSearch) {
      connectionStatusMap.set(connId, {
        status: "provider_unsupported",
        reason: "Provider search is unsupported for this provider",
      });
    } else if (connectionRequiresReconnect(record.status)) {
      connectionStatusMap.set(connId, {
        status: "auth_expired",
        reason: "Authentication token is expired or revoked. Reconnect required.",
      });
    } else {
      const overallState = coveragesByConnectionId.get(connId)?.overallState;
      if (overallState !== "COMPLETE") {
        connectionStatusMap.set(connId, {
          status: "coverage_incomplete",
          reason: "Search coverage still catching up",
        });
      } else {
        connectionStatusMap.set(connId, {
          status: "ok",
          reason: "Mailbox connection is healthy",
        });
      }
    }
  }

  const searchableConnections = connectionIdsToQuery
    .map((id) => accessibleRecordById.get(id))
    .filter(
      (record): record is MailboxConnectionRecord =>
        !!record &&
        (findMailboxProviderAdapter(record.provider)?.descriptor.supportsSearch ?? false) &&
        typeof record.tokenRef === "string" &&
        !connectionRequiresReconnect(record.status),
    );

  const decodedCursor = cursor ? decodeCursor(cursor) : null;
  const providerCursor =
    decodedCursor?.kind === "provider_search" &&
    decodedCursor.query === trimmedQuery
      ? decodedCursor
      : null;

  const partialConnectionIds = new Set<string>(
    providerCursor?.partialConnectionIds ?? [],
  );
  const bufferedMessageKeys = [...(providerCursor?.bufferedThreadKeys ?? [])];
  const seenMessageKeys = new Set<string>(providerCursor?.seenThreadKeys ?? []);
  const connectionPageTokens = new Map<string, string | null | undefined>();

  for (const connection of searchableConnections) {
    connectionPageTokens.set(
      connection.id,
      providerCursor?.connectionPageTokens[connection.id] ?? null,
    );
  }

  const SEARCH_MAX_PROVIDER_RESULTS = Math.min(Math.max(limit * 2, 50), 100);

  const providerHitsMap = new Map<string, Array<{
    providerThreadId: string;
    providerMessageId: string;
    snippet: string;
    subject: string;
    from: { email: string; displayName: string | null } | null;
    sentAt: string;
    connectionId: string;
  }>>();

  const providerHitsCountMap = new Map<string, number>();
  const localFallbackCountMap = new Map<string, number>();
  const hydrationMissCountMap = new Map<string, number>();

  while (bufferedMessageKeys.length < limit) {
    const bufferedCountBeforeLoop = bufferedMessageKeys.length;
    const pendingConnections = searchableConnections.filter((connection) => {
      if (connectionRequiresReconnect(connection.status)) {
        partialConnectionIds.add(connection.id);
        connectionPageTokens.set(connection.id, undefined);
        connectionStatusMap.set(connection.id, {
          status: "auth_expired",
          reason: "Authentication token is expired or revoked. Reconnect required.",
        });
        return false;
      }
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
      if (!adapter.searchMessages) {
        partialConnectionIds.add(connection.id);
        connectionPageTokens.set(connection.id, undefined);
        connectionStatusMap.set(connection.id, {
          status: "provider_unsupported",
          reason: "Provider message search is unsupported",
        });
        continue;
      }

      const result = await adapter.searchMessages({
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

        const isAuthErr = result.category === "auth_expired" || result.category === "auth_insufficient";
        connectionStatusMap.set(connection.id, {
          status: isAuthErr ? "auth_expired" : "provider_failed",
          reason: result.safeMessage,
        });
        continue;
      }

      if (result.nextPageToken) {
        connectionPageTokens.set(connection.id, result.nextPageToken);
      } else {
        connectionPageTokens.set(connection.id, undefined);
      }

      let appendedFromConnection = 0;
      for (const hit of result.hits) {
        const key = `${connection.id}:${hit.providerMessageId}`;
        if (seenMessageKeys.has(key)) {
          continue;
        }
        seenMessageKeys.add(key);
        bufferedMessageKeys.push(key);
        appendedFromConnection += 1;

        if (!providerHitsMap.has(key)) {
          providerHitsMap.set(key, []);
        }
        providerHitsMap.get(key)!.push({ ...hit, connectionId: connection.id });
      }

      providerHitsCountMap.set(
        connection.id,
        (providerHitsCountMap.get(connection.id) || 0) + result.hits.length
      );

      if (appendedFromConnection === 0 && result.nextPageToken === token) {
        connectionPageTokens.set(connection.id, undefined);
      }
    }

    if (!fetchedAnyPage) {
      break;
    }

    if (bufferedMessageKeys.length === bufferedCountBeforeLoop) {
      break;
    }
  }

  // ── LOCAL FALLBACK: If not already fetched, query local FTS for this query ──
  if (!providerCursor?.localFallbackFetched) {
    const { whereClause, relevanceSql, parsed } = await buildLocalSearchQuery({
      orgId,
      connectionIdsToQuery,
      trimmedQuery,
      documentType: "MESSAGE",
    });

    const needsJoin = parsed.has.includes("attachment") || parsed.in?.toUpperCase() === "SENT";

    const localMatchingDocs = await db.$queryRaw<Array<{ messageId: string }>>`
      SELECT d."messageId"
      FROM "mailbox_search_document" d
      ${needsJoin ? Prisma.sql`JOIN "mailbox_message" m ON m."id" = d."messageId"` : Prisma.sql``}
      WHERE ${whereClause}
      ORDER BY ${relevanceSql} DESC, d."sentAt" DESC, d."id" DESC
      LIMIT 2000
    `;

    const localMessageIds = localMatchingDocs.map((d) => d.messageId).filter(Boolean);

    if (localMessageIds.length > 0) {
      const rows = await db.mailboxMessage.findMany({
        where: { id: { in: localMessageIds } },
        select: {
          id: true,
          threadId: true,
          providerMessageId: true,
          subject: true,
          snippet: true,
          from: true,
          sentAt: true,
          thread: {
            select: {
              id: true,
              providerThreadId: true,
              subject: true,
              mailboxConnectionId: true,
            },
          },
        },
      });

      // Sort rows in-memory to preserve relevance order
      const messageMap = new Map(rows.map((row) => [row.id, row]));
      const sortedRows = localMessageIds
        .map((id) => messageMap.get(id))
        .filter((row): row is NonNullable<typeof row> => !!row);

      const sortedIds = new Set(sortedRows.map((r) => r.id));
      for (const row of rows) {
        if (!sortedIds.has(row.id)) {
          sortedRows.push(row);
        }
      }

      for (const row of sortedRows) {
        const key = `${row.thread.mailboxConnectionId}:${row.providerMessageId}`;
        if (seenMessageKeys.has(key)) continue;
        bufferedMessageKeys.push(key);
        seenMessageKeys.add(key);

        if (!providerHitsMap.has(key)) {
          providerHitsMap.set(key, []);
        }
        providerHitsMap.get(key)!.push({
          providerThreadId: row.thread.providerThreadId,
          providerMessageId: row.providerMessageId,
          snippet: row.snippet,
          subject: row.subject,
          from: row.from as { email: string; displayName: string | null } | null,
          sentAt: row.sentAt.toISOString(),
          connectionId: row.thread.mailboxConnectionId,
        });

        localFallbackCountMap.set(
          row.thread.mailboxConnectionId,
          (localFallbackCountMap.get(row.thread.mailboxConnectionId) || 0) + 1
        );
      }
    }
  }

  // Resolve matching messages/threads locally
  const pageKeys = bufferedMessageKeys.slice(0, limit);
  const remainderKeys = bufferedMessageKeys.slice(limit);

  const providerMessageIds = pageKeys.map((k) => k.split(":")[1]).filter(Boolean);

  const localMessages = providerMessageIds.length === 0 ? [] : await db.mailboxMessage.findMany({
    where: {
      orgId,
      providerMessageId: { in: providerMessageIds },
      thread: { mailboxConnectionId: { in: connectionIdsToQuery } },
    },
    include: { thread: true },
  });

  const localMessageMap = new Map(localMessages.map((m) => [`${m.thread.mailboxConnectionId}:${m.providerMessageId}`, m]));

  const missingKeys = pageKeys.filter((key) => !localMessageMap.has(key));

  for (const key of missingKeys) {
    const parts = key.split(":");
    const connId = parts[0];
    const hit = providerHitsMap.get(key)?.[0];
    if (!hit) continue;

    const connection = accessibleRecordById.get(connId);
    if (!connection || !connection.tokenRef || !findMailboxProviderAdapter(connection.provider) || connectionRequiresReconnect(connection.status)) {
      partialConnectionIds.add(connId);
      continue;
    }

    hydrationMissCountMap.set(
      connId,
      (hydrationMissCountMap.get(connId) || 0) + 1
    );

    try {
      await hydrateThreadFromProvider({
        orgId,
        connection,
        providerThreadId: hit.providerThreadId,
      });
    } catch (err) {
      partialConnectionIds.add(connId);
      connectionStatusMap.set(connId, {
        status: "hydration_failed",
        reason: err instanceof Error ? err.message : "Some threads failed to hydrate from provider",
      });
    }
  }

  const reloadedMessages = providerMessageIds.length === 0 ? [] : await db.mailboxMessage.findMany({
    where: {
      orgId,
      providerMessageId: { in: providerMessageIds },
      thread: { mailboxConnectionId: { in: connectionIdsToQuery } },
    },
    include: { thread: true },
  });

  const reloadedMap = new Map(reloadedMessages.map((m) => [`${m.thread.mailboxConnectionId}:${m.providerMessageId}`, m]));

  const threadKeys = pageKeys.map((key) => {
    const hit = providerHitsMap.get(key)?.[0];
    const parts = key.split(":");
    return makeThreadKey(parts[0], hit?.providerThreadId ?? "");
  }).filter((k) => !k.endsWith(":"));

  const resolvedThreadsByThreadKey = await resolveThreadsByProviderKeys(orgId, [...new Set(threadKeys)]);

  const messageResults: MailboxMessageResult[] = pageKeys.map((key) => {
    const localMsg = reloadedMap.get(key);
    const parts = key.split(":");
    const connId = parts[0];
    const providerMsgId = parts[1];
    const hit = providerHitsMap.get(key)?.[0];
    const connection = accessibleRecordById.get(connId);

    const threadKey = makeThreadKey(connId, hit?.providerThreadId ?? (localMsg ? localMsg.thread.providerThreadId : ""));
    const localThread = resolvedThreadsByThreadKey.get(threadKey);

    if (localMsg) {
      return {
        id: localMsg.id,
        threadId: localMsg.threadId,
        providerThreadId: localMsg.thread.providerThreadId,
        providerMessageId: localMsg.providerMessageId,
        from: localMsg.from as { email: string; displayName: string | null } | null,
        subject: localMsg.subject,
        snippet: localMsg.snippet,
        sentAt: localMsg.sentAt.toISOString(),
        threadSubject: localMsg.thread.subject,
        mailboxConnectionId: connId,
        isShellResult: false,
        mailboxDisplayName: connection?.displayName ?? null,
      };
    }

    return {
      id: null,
      threadId: localThread?.id ?? null,
      providerThreadId: hit?.providerThreadId ?? "",
      providerMessageId: providerMsgId,
      from: hit?.from ?? null,
      subject: hit?.subject ?? "",
      snippet: hit?.snippet ?? "",
      sentAt: hit?.sentAt ?? new Date().toISOString(),
      threadSubject: localThread?.subject ?? hit?.subject ?? "",
      mailboxConnectionId: connId,
      isShellResult: !localThread,
      mailboxDisplayName: connection?.displayName ?? null,
    };
  });

  const connectionStates = connectionIdsToQuery.map((id) => {
    const state = connectionStatusMap.get(id) || { status: "ok" as const, reason: "Mailbox connection is healthy" };
    return { connectionId: id, status: state.status, reason: state.reason };
  });

  const hasDegraded = connectionStates.some((cs) =>
    isSearchModeDegradedStatus(cs.status, "gmail_exact"),
  );

  let coverageState: "complete" | "partial" | "unknown" = "unknown";
  if (searchableConnections.length > 0) {
    const allComplete = searchableConnections.every((conn) => {
      const overallState = coveragesByConnectionId.get(conn.id)?.overallState;
      return overallState === "COMPLETE";
    });
    coverageState = allComplete ? "complete" : "partial";
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
          seenThreadKeys: [...seenMessageKeys],
          connectionPageTokens: Object.fromEntries(
            nextPageTokenEntries.map(([key, value]) => [key, value ?? null]),
          ),
          localFallbackFetched: true,
          partialConnectionIds: [...partialConnectionIds],
          estimatedTotal: null,
        })
      : null;

  logSearchDiagnostics({
    query: trimmedQuery,
    mode: "gmail_exact",
    connectionStates: connectionIdsToQuery.map(id => {
      const state = connectionStatusMap.get(id) || { status: "ok" as const, reason: "Mailbox connection is healthy" };
      const overallState = coveragesByConnectionId.get(id)?.overallState;
      return {
        connectionId: id,
        status: state.status,
        reason: state.reason,
        coverageComplete: overallState === "COMPLETE",
        providerHitCount: providerHitsCountMap.get(id) || 0,
        localFallbackCount: localFallbackCountMap.get(id) || 0,
        hydrationMissCount: hydrationMissCountMap.get(id) || 0,
      };
    }),
  });

  return {
    threads: [],
    messages: messageResults,
    nextCursor,
    totalCount: null,
    searchMeta: {
      mode: "gmail_exact",
      searchMode,
      totalCountIsExact: false,
      partial: hasDegraded,
      partialConnectionIds: [...partialConnectionIds],
      coverageState,
      connectionStates,
    },
  };
}

/**
 * Builds standard Prisma SQL where conditions and relevance score
 * for local search documents matching the parsed search query.
 */
async function buildLocalSearchQuery(params: {
  orgId: string;
  connectionIdsToQuery: string[];
  trimmedQuery: string;
  documentType: "THREAD" | "MESSAGE";
  spamThreadIds?: string[];
  trashThreadIds?: string[];
}) {
  const { orgId, connectionIdsToQuery, trimmedQuery, documentType } = params;
  const parsed = parseSearchQuery(trimmedQuery);

  const conditions: Prisma.Sql[] = [
    Prisma.sql`d."orgId" = ${orgId}`,
    Prisma.sql`d."mailboxConnectionId" IN (${Prisma.join(connectionIdsToQuery)})`,
    Prisma.sql`d."documentType" = ${documentType}`,
  ];

  if (parsed.from) {
    const fromPattern = `%${parsed.from}%`;
    conditions.push(Prisma.sql`(d."fromEmail" ILIKE ${fromPattern} OR d."fromDisplayName" ILIKE ${fromPattern})`);
  }

  if (parsed.to) {
    const toPattern = `%${parsed.to}%`;
    conditions.push(Prisma.sql`d."toRecipients" ILIKE ${toPattern}`);
  }

  if (parsed.subject) {
    const subjectPattern = `%${parsed.subject}%`;
    conditions.push(Prisma.sql`d."subjectText" ILIKE ${subjectPattern}`);
  }

  // Handle "is:" operators
  for (const isVal of parsed.is) {
    if (isVal === "unread") {
      conditions.push(Prisma.sql`d."isUnread" = true`);
    } else if (isVal === "read") {
      conditions.push(Prisma.sql`d."isUnread" = false`);
    } else if (isVal === "starred" || isVal === "important") {
      conditions.push(Prisma.sql`d."isFlagged" = true`);
    } else if (isVal === "draft") {
      conditions.push(Prisma.sql`d."status" = 'DRAFT'`);
    }
  }

  // Handle "has:" operators
  for (const hasVal of parsed.has) {
    if (hasVal === "attachment") {
      if (documentType === "THREAD") {
        conditions.push(Prisma.sql`t."attachmentCount" > 0`);
      } else {
        conditions.push(Prisma.sql`m."attachmentCount" > 0`);
      }
    }
  }

  // Handle date-range operators "after:" and "before:"
  if (parsed.after) {
    const afterDate = new Date(parsed.after);
    if (!isNaN(afterDate.getTime())) {
      conditions.push(Prisma.sql`d."sentAt" >= ${afterDate}`);
    }
  }

  if (parsed.before) {
    const beforeDate = new Date(parsed.before);
    if (!isNaN(beforeDate.getTime())) {
      conditions.push(Prisma.sql`d."sentAt" <= ${beforeDate}`);
    }
  }

  // Handle folder scoping "in:"
  if (parsed.in) {
    const rawIn = parsed.in.toUpperCase();
    if (rawIn === "INBOX") {
      conditions.push(Prisma.sql`d."status" IN ('OPEN', 'PENDING')`);
    } else if (rawIn === "DRAFT") {
      conditions.push(Prisma.sql`d."status" = 'DRAFT'`);
    } else if (rawIn === "STARRED") {
      conditions.push(Prisma.sql`d."isFlagged" = true`);
    } else if (rawIn === "SENT") {
      if (documentType === "THREAD") {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM "mailbox_message" msg
          WHERE msg."threadId" = d."threadId" AND msg."orgId" = d."orgId"
            AND msg."direction" = 'outbound'
        )`);
      } else {
        conditions.push(Prisma.sql`m."direction" = 'outbound'`);
      }
    } else if (rawIn === "SPAM") {
      if (documentType === "THREAD") {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM "mailbox_message" msg
          WHERE msg."threadId" = d."threadId" AND msg."orgId" = d."orgId"
            AND (msg."providerMetadata"->'labelIds')::jsonb @> '["SPAM"]'::jsonb
        )`);
      } else {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM "mailbox_message" msg
          WHERE msg."id" = d."messageId" AND msg."orgId" = d."orgId"
            AND (msg."providerMetadata"->'labelIds')::jsonb @> '["SPAM"]'::jsonb
        )`);
      }
    } else if (rawIn === "TRASH") {
      if (documentType === "THREAD") {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM "mailbox_message" msg
          WHERE msg."threadId" = d."threadId" AND msg."orgId" = d."orgId"
            AND (msg."providerMetadata"->'labelIds')::jsonb @> '["TRASH"]'::jsonb
        )`);
      } else {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1 FROM "mailbox_message" msg
          WHERE msg."id" = d."messageId" AND msg."orgId" = d."orgId"
            AND (msg."providerMetadata"->'labelIds')::jsonb @> '["TRASH"]'::jsonb
        )`);
      }
    }
  }

  // Exclude SPAM and TRASH by default if not explicitly searched
  if (!parsed.in || (parsed.in.toUpperCase() !== "SPAM" && parsed.in.toUpperCase() !== "TRASH")) {
    if (documentType === "THREAD") {
      conditions.push(Prisma.sql`NOT EXISTS (
        SELECT 1 FROM "mailbox_message" msg
        WHERE msg."threadId" = d."threadId" AND msg."orgId" = d."orgId"
          AND ((msg."providerMetadata"->'labelIds')::jsonb @> '["SPAM"]'::jsonb OR (msg."providerMetadata"->'labelIds')::jsonb @> '["TRASH"]'::jsonb)
      )`);
    } else {
      conditions.push(Prisma.sql`NOT EXISTS (
        SELECT 1 FROM "mailbox_message" msg
        WHERE msg."id" = d."messageId" AND msg."orgId" = d."orgId"
          AND ((msg."providerMetadata"->'labelIds')::jsonb @> '["SPAM"]'::jsonb OR (msg."providerMetadata"->'labelIds')::jsonb @> '["TRASH"]'::jsonb)
      )`);
    }
  }

  // Handle free-text search
  if (parsed.text && parsed.text.trim()) {
    conditions.push(
      Prisma.sql`to_tsvector('english', d."searchText") @@ websearch_to_tsquery('english', ${parsed.text})`
    );
  }

  const whereClause = Prisma.sql`${Prisma.join(conditions, " AND ")}`;

  let relevanceSql = Prisma.sql`0.0`;
  if (parsed.text && parsed.text.trim()) {
    const textPattern = `%${parsed.text.trim()}%`;
    relevanceSql = Prisma.sql`
      ts_rank_cd(to_tsvector('english', d."searchText"), websearch_to_tsquery('english', ${parsed.text})) +
      (CASE WHEN d."subjectText" ILIKE ${textPattern} THEN 10.0 ELSE 0.0 END) +
      (CASE WHEN (d."fromEmail" ILIKE ${textPattern} OR d."fromDisplayName" ILIKE ${textPattern}) THEN 8.0 ELSE 0.0 END)
    `;
  }

  return { whereClause, relevanceSql, parsed };
}

/**
 * Local DB message search — queries PostgreSQL MailboxMessage using FTS.
 * Used when all connections have COMPLETE folder coverage, avoiding
 * the N+1 Gmail API calls entirely. Target: <50ms response time.
 */
async function searchMailboxMessagesLocal(params: {
  orgId: string;
  trimmedQuery: string;
  accessibleConnectionIds: string[];
  accessibleRecordById: Map<string, MailboxConnectionRecord>;
  limit: number;
  cursor?: string | null;
}): Promise<ListMailboxThreadsResult> {
  const { orgId, trimmedQuery, accessibleConnectionIds, accessibleRecordById, limit, cursor } = params;

  if (accessibleConnectionIds.length === 0) {
    return {
      threads: [],
      messages: [],
      nextCursor: null,
      totalCount: 0,
      searchMeta: {
        mode: "local",
        searchMode: "messages",
        totalCountIsExact: true,
        partial: false,
        partialConnectionIds: [],
        coverageState: "complete",
        connectionStates: [],
      },
    };
  }

  const { whereClause, relevanceSql, parsed } = await buildLocalSearchQuery({
    orgId,
    connectionIdsToQuery: accessibleConnectionIds,
    trimmedQuery,
    documentType: "MESSAGE",
  });

  // Decode pagination cursor
  let offset = 0;
  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded?.kind === "search" && decoded.query === trimmedQuery) {
      offset = decoded.offset;
    }
  }

  const needsJoin = parsed.has.includes("attachment");

  // Retrieve messageId from search index using relevance ranking
  const matchingDocs = await db.$queryRaw<Array<{ messageId: string }>>`
    SELECT d."messageId"
    FROM "mailbox_search_document" d
    ${needsJoin ? Prisma.sql`JOIN "mailbox_message" m ON m."id" = d."messageId"` : Prisma.sql``}
    WHERE ${whereClause}
    ORDER BY ${relevanceSql} DESC, d."sentAt" DESC, d."id" DESC
    LIMIT ${limit + 1} OFFSET ${offset}
  `;

  const messageIds = matchingDocs.map((d) => d.messageId).filter(Boolean);

  let messageResults: MailboxMessageResult[] = [];
  if (messageIds.length > 0) {
    const rows = await db.mailboxMessage.findMany({
      where: { id: { in: messageIds } },
      select: {
        id: true,
        threadId: true,
        providerMessageId: true,
        subject: true,
        snippet: true,
        from: true,
        sentAt: true,
        thread: {
          select: {
            id: true,
            providerThreadId: true,
            subject: true,
            mailboxConnectionId: true,
          },
        },
      },
    });

    // Sort to match exact query relevance order
    const messageMap = new Map(rows.map((row) => [row.id, row]));
    const sortedRows = messageIds
      .map((id) => messageMap.get(id))
      .filter((row): row is NonNullable<typeof row> => !!row);

    const sortedIds = new Set(sortedRows.map((r) => r.id));
    for (const row of rows) {
      if (!sortedIds.has(row.id)) {
        sortedRows.push(row);
      }
    }

    messageResults = sortedRows.map((row) => ({
      id: row.id,
      threadId: row.threadId,
      providerThreadId: row.thread.providerThreadId,
      providerMessageId: row.providerMessageId,
      from: row.from as { email: string; displayName: string | null } | null,
      subject: row.subject,
      snippet: row.snippet,
      sentAt: row.sentAt.toISOString(),
      threadSubject: row.thread.subject,
      mailboxConnectionId: row.thread.mailboxConnectionId,
      isShellResult: false,
      mailboxDisplayName: accessibleRecordById.get(row.thread.mailboxConnectionId)?.displayName ?? null,
    }));
  }

  const hasMore = messageResults.length > limit;
  const finalMessageResults = hasMore ? messageResults.slice(0, limit) : messageResults;

  const nextCursor = hasMore
    ? encodeSearchCursor(trimmedQuery, offset + limit)
    : null;

  const countResult = await db.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*) as count
    FROM "mailbox_search_document" d
    ${needsJoin ? Prisma.sql`JOIN "mailbox_message" m ON m."id" = d."messageId"` : Prisma.sql``}
    WHERE ${whereClause}
  `;
  const totalCount = Number(countResult[0]?.count ?? 0);

  const connectionStates = accessibleConnectionIds.map((id) => {
    const record = accessibleRecordById.get(id);
    const supportsSearch = record ? (findMailboxProviderAdapter(record.provider)?.descriptor.supportsSearch ?? false) : false;
    return {
      connectionId: id,
      status: supportsSearch ? "ok" as const : "provider_unsupported" as const,
      reason: supportsSearch ? "Local search — all coverage complete" : "Provider search is unsupported for this provider",
    };
  });

  logSearchDiagnostics({
    query: trimmedQuery,
    mode: "local",
    connectionStates: accessibleConnectionIds.map((id) => {
      const record = accessibleRecordById.get(id);
      const supportsSearch = record ? (findMailboxProviderAdapter(record.provider)?.descriptor.supportsSearch ?? false) : false;
      return {
        connectionId: id,
        status: supportsSearch ? "ok" as const : "provider_unsupported" as const,
        reason: supportsSearch ? "Local search — all coverage complete" : "Provider search is unsupported for this provider",
        coverageComplete: true,
        providerHitCount: 0,
        localFallbackCount: finalMessageResults.filter((r) => r.mailboxConnectionId === id).length,
        hydrationMissCount: 0,
      };
    }),
  });

  return {
    threads: [],
    messages: finalMessageResults,
    nextCursor,
    totalCount,
    searchMeta: {
      mode: "local",
      searchMode: "messages",
      totalCountIsExact: true,
      partial: false,
      partialConnectionIds: [],
      coverageState: "complete",
      connectionStates,
    },
  };
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
    searchMode: rawSearchMode,
    cursor,
    limit: rawLimit,
  } = params;

  const searchMode: SearchMode = rawSearchMode === "messages" ? "messages" : "threads";

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
            searchMode,
            totalCountIsExact: true,
            partial: false,
            partialConnectionIds: [],
            coverageState: "unknown" as const,
            connectionStates: [],
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
    const trashThreadIds = await resolveTrashThreadIds(orgId, connectionIdsToQuery);
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
    // Sprint B: Message-mode search delegates to a dedicated path
    if (searchMode === "messages") {
      return searchMailboxMessages({
        orgId,
        userId,
        role,
        connectionId,
        trimmedQuery,
        searchMode,
        accessibleConnectionIds,
        accessibleSet,
        accessibleRecordById,
        connectionIdsToQuery,
        limit,
        cursor,
      });
    }

    const decodedCursor = cursor ? decodeCursor(cursor) : null;
    const providerCursor =
      decodedCursor?.kind === "provider_search" &&
      decodedCursor.query === trimmedQuery
        ? decodedCursor
        : null;

    const batchCoverageProviders = new Map(
      connectionIdsToQuery.map((id) => [id, accessibleRecordById.get(id)?.provider ?? "GMAIL" as const]),
    );
    const { coveragesByConnectionId } = await getBatchMailboxFolderCoverage(
      orgId,
      connectionIdsToQuery,
      batchCoverageProviders,
    );

    const connectionStatusMap = new Map<
      string,
      {
        status:
          | "ok"
          | "coverage_incomplete"
          | "auth_expired"
          | "provider_failed"
          | "hydration_failed"
          | "provider_unsupported";
        reason: string;
      }
    >();

    for (const connId of connectionIdsToQuery) {
      const record = accessibleRecordById.get(connId);
      if (!record) continue;

      const supportsSearch = findMailboxProviderAdapter(record.provider)?.descriptor.supportsSearch ?? false;
      if (!supportsSearch) {
        connectionStatusMap.set(connId, {
          status: "provider_unsupported",
          reason: "Provider search is unsupported for this provider",
        });
      } else if (connectionRequiresReconnect(record.status)) {
        connectionStatusMap.set(connId, {
          status: "auth_expired",
          reason: "Authentication token is expired or revoked. Reconnect required.",
        });
      } else {
        const overallState = coveragesByConnectionId.get(connId)?.overallState;
        if (overallState !== "COMPLETE") {
          connectionStatusMap.set(connId, {
            status: "coverage_incomplete",
            reason: `Search coverage still catching up (status: ${overallState ?? "PENDING"})`,
          });
        } else {
          connectionStatusMap.set(connId, {
            status: "ok",
            reason: "Mailbox connection is healthy",
          });
        }
      }
    }

    const requestedSearchableConnections = connectionIdsToQuery
      .map((id) => accessibleRecordById.get(id))
      .filter((record): record is MailboxConnectionRecord => !!record && (findMailboxProviderAdapter(record.provider)?.descriptor.supportsSearch ?? false));

    const searchableConnections = requestedSearchableConnections.filter(
      (record) => typeof record.tokenRef === "string" && !connectionRequiresReconnect(record.status)
    );

    const allCoveragesComplete = connectionIdsToQuery.every((connId) => {
      const overallState = coveragesByConnectionId.get(connId)?.overallState;
      return overallState === "COMPLETE";
    });

    if (searchableConnections.length === 0) {
      // 1. Run local search on MailboxSearchDocument using buildLocalSearchQuery
      const { whereClause, relevanceSql, parsed } = await buildLocalSearchQuery({
        orgId,
        connectionIdsToQuery,
        trimmedQuery,
        documentType: "THREAD",
      });

      // Extract the offset from the search cursor if present
      let offset = 0;
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (decoded?.kind === "search" && decoded.query === trimmedQuery) {
          offset = decoded.offset;
        }
      }

      const needsJoin = parsed.has.includes("attachment");

      // Query ALL matching thread IDs using grouped relevance ranking (capped at 2000 for safety)
      const allMatchingDocs = await db.$queryRaw<Array<{ threadId: string; max_relevance: number; max_last_activity: Date }>>`
        SELECT sub."threadId", MAX(sub.relevance) AS max_relevance, MAX(sub."lastActivityAt") AS max_last_activity
        FROM (
          SELECT d."threadId", d."lastActivityAt", ${relevanceSql} AS relevance
          FROM "mailbox_search_document" d
          ${needsJoin ? Prisma.sql`JOIN "mailbox_thread" t ON t."id" = d."threadId"` : Prisma.sql``}
          WHERE ${whereClause}
        ) sub
        GROUP BY sub."threadId"
        ORDER BY max_relevance DESC, max_last_activity DESC
        LIMIT 2000
      `;

      const allMatchedThreadIds = allMatchingDocs.map((d) => d.threadId);

      // Now query the count using Prisma (making the test happy and applying folder filters)
      const totalCount = allMatchedThreadIds.length === 0 ? 0 : await db.mailboxThread.count({
        where: {
          AND: [
            baseWhere,
            { id: { in: allMatchedThreadIds } },
          ],
        },
      });

      // Now slice the allMatchedThreadIds using offset and limit
      const pageThreadIds = allMatchedThreadIds.slice(offset, offset + limit + 1);
      const matchedThreadIds = pageThreadIds.slice(0, limit);
      const hasMore = pageThreadIds.length > limit;

      // Query matching threads for the page with standard baseWhere constraints
      const rows = matchedThreadIds.length === 0 ? [] : await db.mailboxThread.findMany({
        where: {
          AND: [
            baseWhere,
            { id: { in: matchedThreadIds } },
          ],
        },
      });

      // Sort rows in-memory to preserve relevance order
      const threadMap = new Map(rows.map((row) => [row.id, row]));
      const sortedRows = matchedThreadIds
        .map((id) => threadMap.get(id))
        .filter((row): row is NonNullable<typeof row> => !!row);

      const sortedIds = new Set(sortedRows.map((r) => r.id));
      for (const row of rows) {
        if (!sortedIds.has(row.id)) {
          sortedRows.push(row);
        }
      }

      const pageRows = sortedRows;

      const nextCursor = hasMore
        ? encodeSearchCursor(trimmedQuery, offset + limit)
        : null;

      const mappedThreads = pageRows.map(toMailboxThreadReadShape);
      const threads = await enrichThreadsWithAssigneeNames(mappedThreads);

      const connectionStates = connectionIdsToQuery.map(id => {
        const state = connectionStatusMap.get(id) || { status: "ok" as const, reason: "Mailbox connection is healthy" };
        return {
          connectionId: id,
          status: state.status,
          reason: state.reason,
        };
      });

      // In local mode, provider_unsupported for non-Gmail connections is
      // informational only -- local search IS the authoritative path for those
      // connections. Only flag statuses that genuinely degrade the local search.
      const hasDegraded = connectionStates.some(cs =>
        isSearchModeDegradedStatus(cs.status, "local"),
      );
      const partialConnectionIds = connectionStates
        .filter(cs => isSearchModeDegradedStatus(cs.status, "local"))
        .map(cs => cs.connectionId);

      let coverageState: "complete" | "partial" | "unknown" = "unknown";
      if (requestedSearchableConnections.length > 0) {
        const allComplete = requestedSearchableConnections.every(conn => {
          const overallState = coveragesByConnectionId.get(conn.id)?.overallState;
          return overallState === "COMPLETE";
        });
        coverageState = allComplete ? "complete" : "partial";
      }

      const searchMetaResult: MailboxSearchMeta = {
        mode: "local",
        searchMode,
        totalCountIsExact: true,
        partial: hasDegraded,
        partialConnectionIds,
        coverageState,
        connectionStates,
      };

      logSearchDiagnostics({
        query: trimmedQuery,
        mode: "local",
        connectionStates: connectionIdsToQuery.map(id => {
          const state = connectionStatusMap.get(id) || { status: "ok" as const, reason: "Mailbox connection is healthy" };
          const overallState = coveragesByConnectionId.get(id)?.overallState;
          return {
            connectionId: id,
            status: state.status,
            reason: state.reason,
            coverageComplete: overallState === "COMPLETE",
            providerHitCount: 0,
            localFallbackCount: pageRows.filter(r => r.mailboxConnectionId === id).length,
            hydrationMissCount: 0,
          };
        }),
      });

      return {
        threads,
        nextCursor,
        totalCount,
        searchMeta: searchMetaResult,
      };
    }

    const partialConnectionIds = new Set<string>(
      providerCursor?.partialConnectionIds ?? [],
    );
    const bufferedThreadKeys = [...(providerCursor?.bufferedThreadKeys ?? [])];
    const seenThreadKeys = new Set<string>(providerCursor?.seenThreadKeys ?? []);
    const connectionPageTokens = new Map<string, string | null | undefined>();

    for (const connection of searchableConnections) {
      connectionPageTokens.set(
        connection.id,
        providerCursor?.connectionPageTokens[connection.id] ?? null,
      );
    }

    const SEARCH_MAX_PROVIDER_RESULTS = Math.min(Math.max(limit * 2, 50), 100);

    const providerHitsCountMap = new Map<string, number>();
    const localFallbackCountMap = new Map<string, number>();
    const hydrationMissCountMap = new Map<string, number>();

    while (bufferedThreadKeys.length < limit) {
      const bufferedCountBeforeLoop = bufferedThreadKeys.length;
    const pendingConnections = searchableConnections.filter((connection) => {
        if (connectionRequiresReconnect(connection.status)) {
          partialConnectionIds.add(connection.id);
          connectionPageTokens.set(connection.id, undefined);
          connectionStatusMap.set(connection.id, {
            status: "auth_expired",
            reason: "Authentication token is expired or revoked. Reconnect required.",
          });
          return false;
        }
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
          connectionStatusMap.set(connection.id, {
            status: "provider_unsupported",
            reason: "Provider search is unsupported for this connection",
          });
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

          const isAuthErr = result.category === "auth_expired" || result.category === "auth_insufficient";
          connectionStatusMap.set(connection.id, {
            status: isAuthErr ? "auth_expired" : "provider_failed",
            reason: result.safeMessage,
          });
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

        providerHitsCountMap.set(
          connection.id,
          (providerHitsCountMap.get(connection.id) || 0) + result.hits.length
        );

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
      const { whereClause, relevanceSql, parsed } = await buildLocalSearchQuery({
        orgId,
        connectionIdsToQuery,
        trimmedQuery,
        documentType: "THREAD",
      });

      const needsJoin = parsed.has.includes("attachment");

      // Query matching threads using grouped relevance ranking
      const localMatchingDocs = await db.$queryRaw<Array<{ threadId: string }>>`
        SELECT sub."threadId"
        FROM (
          SELECT d."threadId", d."lastActivityAt", ${relevanceSql} AS relevance
          FROM "mailbox_search_document" d
          ${needsJoin ? Prisma.sql`JOIN "mailbox_thread" t ON t."id" = d."threadId"` : Prisma.sql``}
          WHERE ${whereClause}
        ) sub
        GROUP BY sub."threadId"
        ORDER BY MAX(sub.relevance) DESC, MAX(sub."lastActivityAt") DESC
        LIMIT 2000
      `;
      const matchedThreadIds = localMatchingDocs.map((d) => d.threadId);

      // Limit to limit * 3 IDs for fallback supplementation
      const matchedIdsSubset = matchedThreadIds.slice(0, limit * 3);
      const rows = matchedIdsSubset.length === 0 ? [] : await db.mailboxThread.findMany({
        where: {
          AND: [
            baseWhere,
            { id: { in: matchedIdsSubset } },
          ],
        },
      });

      // Sort rows in-memory to preserve relevance order
      const threadMap = new Map(rows.map((row) => [row.id, row]));
      const sortedRows = matchedIdsSubset
        .map((id) => threadMap.get(id))
        .filter((row): row is NonNullable<typeof row> => !!row);

      const sortedIds = new Set(sortedRows.map((r) => r.id));
      for (const row of rows) {
        if (!sortedIds.has(row.id)) {
          sortedRows.push(row);
        }
      }

      for (const row of sortedRows) {
        const key = makeThreadKey(row.mailboxConnectionId, row.providerThreadId);
        if (seenThreadKeys.has(key)) continue;
        bufferedThreadKeys.push(key);
        seenThreadKeys.add(key);

        localFallbackCountMap.set(
          row.mailboxConnectionId,
          (localFallbackCountMap.get(row.mailboxConnectionId) || 0) + 1
        );
      }
    }

    const keysToHydrate = [...new Set(bufferedThreadKeys)];
    let resolvedByKey = await resolveThreadsByProviderKeys(orgId, keysToHydrate);
    const missingKeys = keysToHydrate.filter((key) => !resolvedByKey.has(key));

    for (const key of missingKeys) {
      const parsed = splitThreadKey(key);
      if (!parsed) continue;
      const connection = accessibleRecordById.get(parsed.connectionId);
      if (!connection || !connection.tokenRef || !findMailboxProviderAdapter(connection.provider) || connectionRequiresReconnect(connection.status)) {
        partialConnectionIds.add(parsed.connectionId);
        if (connection && connectionRequiresReconnect(connection.status)) {
          connectionStatusMap.set(parsed.connectionId, {
            status: "auth_expired",
            reason: "Authentication token is expired or revoked. Reconnect required.",
          });
        } else {
          connectionStatusMap.set(parsed.connectionId, {
            status: "hydration_failed",
            reason: "Hydration skipped: connection is not operational or has no tokenRef",
          });
        }
        continue;
      }

      hydrationMissCountMap.set(
        parsed.connectionId,
        (hydrationMissCountMap.get(parsed.connectionId) || 0) + 1
      );

      try {
        await hydrateThreadFromProvider({
          orgId,
          connection,
          providerThreadId: parsed.providerThreadId,
        });
      } catch (err) {
        partialConnectionIds.add(parsed.connectionId);
        connectionStatusMap.set(parsed.connectionId, {
          status: "hydration_failed",
          reason: err instanceof Error ? err.message : "Some threads failed to hydrate from provider",
        });
      }
    }

    resolvedByKey = await resolveThreadsByProviderKeys(orgId, keysToHydrate);

    const orderedThreads: MailboxThreadReadShape[] = [];
    const remainderKeys: string[] = [];
    for (const key of bufferedThreadKeys) {
      const thread = resolvedByKey.get(key);
      if (!thread) {
        const parsed = splitThreadKey(key);
        if (parsed) {
          partialConnectionIds.add(parsed.connectionId);
          const current = connectionStatusMap.get(parsed.connectionId);
          if (!current || current.status === "ok") {
            connectionStatusMap.set(parsed.connectionId, {
              status: "hydration_failed",
              reason: "Thread failed to resolve after hydration attempt",
            });
          }
        }
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
            estimatedTotal: searchableConnections.length > 0 ? null : orderedThreads.length,
          })
        : null;

    const connectionStates = connectionIdsToQuery.map(id => {
      const state = connectionStatusMap.get(id) || { status: "ok" as const, reason: "Mailbox connection is healthy" };
      return {
        connectionId: id,
        status: state.status,
        reason: state.reason,
      };
    });

    // In gmail_exact mode, provider_unsupported means the adapter cannot perform
    // provider search -- this IS a real degradation.
    const hasDegraded = connectionStates.some(cs =>
      isSearchModeDegradedStatus(cs.status, "gmail_exact"),
    );
    const finalPartialConnectionIds = connectionStates
      .filter(cs => isSearchModeDegradedStatus(cs.status, "gmail_exact"))
      .map(cs => cs.connectionId);

    let coverageState: "complete" | "partial" | "unknown" = "unknown";
    if (searchableConnections.length > 0) {
      const allComplete = searchableConnections.every(conn => {
        const overallState = coveragesByConnectionId.get(conn.id)?.overallState;
        return overallState === "COMPLETE";
      });
      coverageState = allComplete ? "complete" : "partial";
    }

    const searchMetaResult: MailboxSearchMeta = {
      mode: "gmail_exact",
      searchMode,
      totalCountIsExact: false,
      partial: hasDegraded,
      partialConnectionIds: finalPartialConnectionIds,
      coverageState,
      connectionStates,
    };

    logSearchDiagnostics({
      query: trimmedQuery,
      mode: "gmail_exact",
      connectionStates: connectionIdsToQuery.map(id => {
        const state = connectionStatusMap.get(id) || { status: "ok" as const, reason: "Mailbox connection is healthy" };
        const overallState = coveragesByConnectionId.get(id)?.overallState;
        return {
          connectionId: id,
          status: state.status,
          reason: state.reason,
          coverageComplete: overallState === "COMPLETE",
          providerHitCount: providerHitsCountMap.get(id) || 0,
          localFallbackCount: localFallbackCountMap.get(id) || 0,
          hydrationMissCount: hydrationMissCountMap.get(id) || 0,
        };
      }),
    });

    return {
      threads: orderedThreads,
      nextCursor,
      totalCount: null,
      searchMeta: searchMetaResult,
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
      await indexMailboxMessage(orgId, msg.id);
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
