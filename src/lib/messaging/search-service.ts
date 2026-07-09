import "server-only";

import { db } from "@/lib/db";
import { AttachmentScanStatus, AttachmentIndexingStatus } from "@/generated/prisma/client";

// ─── Search config limits ────────────────────────────────────────────────────
export const MAX_CANDIDATES_PER_KIND = 200;

// ─── Search input shape ───────────────────────────────────────────────────────
export interface MessagingSearchQuery {
  q: string;
  kinds?: Array<"message" | "conversation" | "task" | "meeting" | "file">;
  limit?: number;
  offset?: number;
  degraded?: boolean; // parameter to force degraded mode for diagnostics/tests
}

// ─── Search result contracts ──────────────────────────────────────────────────
export type SearchResultKind =
  | "message"
  | "conversation"
  | "task"
  | "meeting"
  | "file"
  | "channel"
  | "person"; // Keep legacy support for mock compatibility

export interface SearchResultBase {
  id: string;
  kind: SearchResultKind;
  title: string;
  subtitle: string;
  timestamp?: string; // ISO date
  score: number; // explainable ranking score
}

export interface MessageSearchResult extends SearchResultBase {
  kind: "message";
  conversationId: string;
  conversationName: string;
  authorName: string;
  authorInitials: string;
  snippet: string;
}

export interface ConversationSearchResult extends SearchResultBase {
  kind: "conversation";
  conversationType: "CHANNEL" | "DM" | "GROUP";
  isPrivate: boolean;
  memberCount: number;
}

export interface TaskSearchResult extends SearchResultBase {
  kind: "task";
  conversationId: string;
  conversationName: string;
  status: "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE" | "CANCELLED";
  assigneeName?: string;
  dueDate?: string;
}

export interface MeetingSearchResult extends SearchResultBase {
  kind: "meeting";
  conversationId: string;
  conversationName: string;
  scheduledAt: string;
  durationMinutes: number;
  joinUrl?: string;
}

export interface FileSearchResult extends SearchResultBase {
  kind: "file";
  conversationId: string;
  conversationName: string;
  attachmentId: string;
  mimeType: string;
  mimeCategory: string;
  sizeBytes: number;
  sizeLabel: string;
  scanStatus: "PENDING" | "CLEAN" | "BLOCKED";
  snippet?: string;
}

// Legacy shapes for backward compatibility
export interface LegacyChannelSearchResult extends SearchResultBase {
  kind: "channel";
  conversationRef?: string;
}

export interface LegacyPersonSearchResult extends SearchResultBase {
  kind: "person";
  avatarInitials?: string;
}

export type MessagingSearchResult =
  | MessageSearchResult
  | ConversationSearchResult
  | TaskSearchResult
  | MeetingSearchResult
  | FileSearchResult
  | LegacyChannelSearchResult
  | LegacyPersonSearchResult;

export interface MessagingSearchResponse {
  results: MessagingSearchResult[];
  facets: {
    message: number;
    conversation: number;
    task: number;
    meeting: number;
    file: number;
  };
  hasMore: boolean;
  state: "active" | "degraded" | "unindexed" | "partial";
  unindexedKinds: string[];
  isCapped: boolean;
  windowExceeded: boolean;
  // Sprint 9.2 metadata
  fileIndexingState?: "active" | "degraded" | "unindexed" | "partial";
  hasPendingScans?: boolean;
  hasUnsupportedFiles?: boolean;
}

function deriveMimeCategory(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return "spreadsheet";
  if (mimeType === "application/pdf" || mimeType.startsWith("text/") || mimeType.includes("word") || mimeType.includes("document")) return "document";
  return "other";
}

function formatSizeLabel(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(0)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Helper functions ────────────────────────────────────────────────────────
function getInitials(name: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generate a safe snippet of the message body matching the query term.
 * Guarantees no sensitive punctuation or markup leaks.
 */
function makeMessageSnippet(body: string, q: string): string {
  const cleanBody = body.replace(/[\r\n\t]+/g, " ").trim();
  if (!q) {
    return cleanBody.slice(0, 120) + (cleanBody.length > 120 ? "..." : "");
  }

  const index = cleanBody.toLowerCase().indexOf(q.toLowerCase());
  if (index === -1) {
    return cleanBody.slice(0, 120) + (cleanBody.length > 120 ? "..." : "");
  }

  const start = Math.max(0, index - 50);
  const end = Math.min(cleanBody.length, index + q.length + 50);
  let snippet = cleanBody.slice(start, end);

  if (start > 0) snippet = "..." + snippet;
  if (end < cleanBody.length) snippet = snippet + "...";

  return snippet;
}

/**
 * Calculate deterministic ranking score for search matches.
 * Rules:
 * - Exact match in main field: +100
 * - Substring match in main field: +50
 * - Substring match in secondary field: +20
 * - Recency boost: +10 / (1 + ageInDays)
 * - Pinned conversation boost: +15
 */
function calculateScore(params: {
  mainField: string | null;
  secondaryField?: string | null;
  q: string;
  createdAt: Date;
  isPinned?: boolean;
}): number {
  let score = 0;
  const queryLower = params.q.toLowerCase();
  const mainLower = (params.mainField ?? "").toLowerCase();
  const secLower = (params.secondaryField ?? "").toLowerCase();

  if (mainLower === queryLower) {
    score += 100;
  } else if (mainLower.includes(queryLower)) {
    score += 50;
  } else if (secLower.includes(queryLower)) {
    score += 20;
  }

  // Recency boost (decaying factor, max 10 points)
  const ageInDays = (Date.now() - params.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyBoost = Math.max(0, 10 / (1 + Math.max(0, ageInDays)));
  score += recencyBoost;

  // Pinned conversation boost
  if (params.isPinned) {
    score += 15;
  }

  return Math.round(score * 100) / 100;
}

// ─── Search service execution ────────────────────────────────────────────────
export async function searchMessaging(
  orgId: string,
  userId: string,
  query: MessagingSearchQuery
): Promise<MessagingSearchResponse> {
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const offset = Math.max(0, query.offset ?? 0);
  const q = (query.q ?? "").trim().slice(0, 500); // truncate query to prevent DOS

  const requestedKinds = query.kinds ?? ["message", "conversation", "task", "meeting", "file"];
  const searchState = query.degraded || q.toLowerCase() === "force-degraded" ? "degraded" : "active";

  let isFileSearchUnavailable = process.env.FILE_INDEXING_DISABLED === "true";
  const isOnlyUnindexed = requestedKinds.length === 1 && requestedKinds.includes("file") && isFileSearchUnavailable;
  const isUnindexedRequested = requestedKinds.includes("file") && isFileSearchUnavailable;

  const emptyResponse: MessagingSearchResponse = {
    results: [],
    facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
    hasMore: false,
    state: searchState === "degraded" ? "degraded" : (isOnlyUnindexed ? "unindexed" : "active"),
    unindexedKinds: isUnindexedRequested ? ["file"] : [],
    isCapped: false,
    windowExceeded: false,
  };

  // Safe blank/whitespace queries behavior
  if (!q) {
    return emptyResponse;
  }

  if (searchState === "degraded") {
    // Under degraded mode, return immediately with degraded state to protect system health
    return {
      results: [],
      facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
      hasMore: false,
      state: "degraded",
      unindexedKinds: requestedKinds.includes("file") ? ["file"] : [],
      isCapped: false,
      windowExceeded: false,
    };
  }

  // Fetch user participant mappings in parallel to build allowed conversation cache.
  // This centralizes visibility enforcement and prevents unauthorized leakage.
  const memberships = await db.conversationParticipant.findMany({
    where: {
      orgId,
      userId,
      leftAt: null,
    },
    select: {
      conversationId: true,
      isPinned: true,
    },
  });

  const memberConversationMap = new Map<string, { isPinned: boolean }>();
  for (const m of memberships) {
    memberConversationMap.set(m.conversationId, { isPinned: !!m.isPinned });
  }

  const memberConvIds = Array.from(memberConversationMap.keys());

  // 1. Search Messages (restricted to conversations user is member of)
  let matchingMessages: MessageSearchResult[] = [];
  if (requestedKinds.includes("message") && memberConvIds.length > 0) {
    const messages = await db.conversationMessage.findMany({
      where: {
        orgId,
        conversationId: { in: memberConvIds },
        status: { not: "DELETED" },
        deletedAt: null,
        body: { contains: q, mode: "insensitive" },
      },
      include: {
        conversation: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES_PER_KIND,
    });

    // Fetch author profiles
    const authorIds = Array.from(new Set(messages.map((m) => m.authorId)));
    const profiles = authorIds.length > 0
      ? await db.profile.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true },
        })
      : [];
    const profileMap = new Map<string, string>();
    for (const p of profiles) {
      profileMap.set(p.id, p.name);
    }

    matchingMessages = messages.map((m) => {
      const authorName = profileMap.get(m.authorId) ?? "Unknown User";
      const isPinned = memberConversationMap.get(m.conversationId)?.isPinned ?? false;
      const score = calculateScore({
        mainField: m.body,
        q,
        createdAt: m.createdAt,
        isPinned,
      });

      return {
        id: m.id,
        kind: "message",
        title: authorName,
        subtitle: m.conversation.name ? `#${m.conversation.name}` : "Direct Message",
        timestamp: m.createdAt.toISOString(),
        score,
        conversationId: m.conversationId,
        conversationName: m.conversation.name ?? "Direct Message",
        authorName,
        authorInitials: getInitials(authorName),
        snippet: makeMessageSnippet(m.body, q),
      };
    });
  }

  // 2. Search Conversations (conversations user is member of OR public channels in org)
  let matchingConversations: ConversationSearchResult[] = [];
  if (requestedKinds.includes("conversation")) {
    const conversations = await db.conversation.findMany({
      where: {
        orgId,
        archivedAt: null,
        AND: [
          {
            OR: [
              { id: { in: memberConvIds } },
              { type: "CHANNEL", visibility: "PUBLIC" },
            ],
          },
          {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        orgId: true,
        type: true,
        name: true,
        description: true,
        visibility: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES_PER_KIND,
    });

    // Batch-fetch active participant counts for matched conversations (avoids N+1 include)
    const convIds = conversations.map((c) => c.id);
    const participantCounts = convIds.length > 0
      ? await db.conversationParticipant.groupBy({
          by: ["conversationId"],
          where: {
            orgId,
            conversationId: { in: convIds },
            leftAt: null,
          },
          _count: { id: true },
        })
      : [];
    const participantCountMap = new Map<string, number>(
      participantCounts.map((pc) => [pc.conversationId, pc._count.id])
    );

    matchingConversations = conversations.map((c) => {
      const isPinned = memberConversationMap.get(c.id)?.isPinned ?? false;
      const score = calculateScore({
        mainField: c.name,
        secondaryField: c.description,
        q,
        createdAt: c.createdAt,
        isPinned,
      });

      return {
        id: c.id,
        kind: "conversation",
        title: c.name ?? (c.type === "DM" ? "Direct Message" : "Unnamed Group"),
        subtitle: c.description ?? `${c.type.toLowerCase()} conversation`,
        timestamp: c.createdAt.toISOString(),
        score,
        conversationType: c.type as any,
        isPrivate: c.visibility === "PRIVATE" || c.type === "DM",
        memberCount: participantCountMap.get(c.id) ?? 0,
      };
    });
  }

  // 3. Search Tasks (restricted to conversations user is member of)
  let matchingTasks: TaskSearchResult[] = [];
  if (requestedKinds.includes("task") && memberConvIds.length > 0) {
    const tasks = await db.messagingTask.findMany({
      where: {
        orgId,
        conversationId: { in: memberConvIds },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        orgId: true,
        conversationId: true,
        title: true,
        description: true,
        status: true,
        assigneeId: true,
        dueDate: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES_PER_KIND,
    });

    // Batch-fetch assignee profiles
    const assigneeIds = Array.from(new Set(tasks.map((t) => t.assigneeId).filter((id): id is string => id !== null)));
    const profiles = assigneeIds.length > 0
      ? await db.profile.findMany({
          where: { id: { in: assigneeIds } },
          select: { id: true, name: true },
        })
      : [];
    const profileMap = new Map<string, string>();
    for (const p of profiles) {
      profileMap.set(p.id, p.name);
    }

    // Batch-fetch conversation names for task results
    const taskConvIds = Array.from(new Set(tasks.map((t) => t.conversationId)));
    const taskConvs = taskConvIds.length > 0
      ? await db.conversation.findMany({
          where: { id: { in: taskConvIds } },
          select: { id: true, name: true },
        })
      : [];
    const taskConvNameMap = new Map<string, string | null>(
      taskConvs.map((c) => [c.id, c.name])
    );

    matchingTasks = tasks.map((t) => {
      const isPinned = memberConversationMap.get(t.conversationId)?.isPinned ?? false;
      const score = calculateScore({
        mainField: t.title,
        secondaryField: t.description,
        q,
        createdAt: t.createdAt,
        isPinned,
      });
      const convName = taskConvNameMap.get(t.conversationId) ?? null;

      return {
        id: t.id,
        kind: "task",
        title: t.title,
        subtitle: convName ? `#${convName}` : "Task Reference",
        timestamp: t.createdAt.toISOString(),
        score,
        conversationId: t.conversationId,
        conversationName: convName ?? "Direct Message",
        status: t.status as TaskSearchResult["status"],
        assigneeName: t.assigneeId ? profileMap.get(t.assigneeId) : undefined,
        dueDate: t.dueDate?.toISOString(),
      };
    });
  }

  // 4. Search Meetings (restricted to conversations user is member of)
  let matchingMeetings: MeetingSearchResult[] = [];
  if (requestedKinds.includes("meeting") && memberConvIds.length > 0) {
    const meetings = await db.conversationMeeting.findMany({
      where: {
        orgId,
        conversationId: { in: memberConvIds },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        orgId: true,
        conversationId: true,
        title: true,
        description: true,
        scheduledAt: true,
        durationMinutes: true,
        joinUrl: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES_PER_KIND,
    });

    // Batch-fetch conversation names for meeting results
    const meetingConvIds = Array.from(new Set(meetings.map((m) => m.conversationId)));
    const meetingConvs = meetingConvIds.length > 0
      ? await db.conversation.findMany({
          where: { id: { in: meetingConvIds } },
          select: { id: true, name: true },
        })
      : [];
    const meetingConvNameMap = new Map<string, string | null>(
      meetingConvs.map((c) => [c.id, c.name])
    );

    matchingMeetings = meetings.map((m) => {
      const isPinned = memberConversationMap.get(m.conversationId)?.isPinned ?? false;
      const score = calculateScore({
        mainField: m.title,
        secondaryField: m.description,
        q,
        createdAt: m.createdAt,
        isPinned,
      });
      const convName = meetingConvNameMap.get(m.conversationId) ?? null;

      return {
        id: m.id,
        kind: "meeting",
        title: m.title,
        subtitle: convName ? `#${convName}` : "Meeting Reference",
        timestamp: m.createdAt.toISOString(),
        score,
        conversationId: m.conversationId,
        conversationName: convName ?? "Direct Message",
        scheduledAt: m.scheduledAt.toISOString(),
        durationMinutes: m.durationMinutes,
        joinUrl: m.joinUrl ?? undefined,
      };
    });
  }

  // 5. Search Files (restricted to attachments in conversations user is member of)
  let matchingFiles: FileSearchResult[] = [];
  let fileCount = 0;
  let hasPendingScans = false;
  let hasUnsupportedFiles = false;

  if (requestedKinds.includes("file") && memberConvIds.length > 0 && !isFileSearchUnavailable) {
    try {
      if (!db.messagingAttachmentIndex) {
        throw new Error("Messaging attachment index model not initialized");
      }

      // Query database for matching indices
      const matchingIndices = await db.messagingAttachmentIndex.findMany({
        where: {
          orgId,
          conversationId: { in: memberConvIds },
          OR: [
            { fileName: { contains: q, mode: "insensitive" } },
            {
              AND: [
                { indexingStatus: AttachmentIndexingStatus.INDEXED },
                { scanStatus: AttachmentScanStatus.CLEAN },
                { extractedText: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        },
        include: {
          attachment: {
            select: {
              sizeBytes: true,
            },
          },
        },
        orderBy: { lastIndexedAt: "desc" },
        take: MAX_CANDIDATES_PER_KIND,
      });

      const conversationIds = Array.from(new Set(matchingIndices.map((idx) => idx.conversationId)));
      const conversations = conversationIds.length > 0
        ? await db.conversation.findMany({
            where: { id: { in: conversationIds } },
            select: { id: true, name: true },
          })
        : [];
      const convNameMap = new Map<string, string>();
      for (const c of conversations) {
        convNameMap.set(c.id, c.name ?? "Direct Message");
      }

      matchingFiles = matchingIndices.map((idx) => {
        const isPinned = memberConversationMap.get(idx.conversationId)?.isPinned ?? false;

        // Custom ranking for files: Exact match on filename gets maximum priority, content match is secondary
        let fileScore = 0;
        const qLower = q.toLowerCase();
        const fileNameLower = idx.fileName.toLowerCase();

        if (fileNameLower === qLower) {
          fileScore += 100;
        } else if (fileNameLower.includes(qLower)) {
          fileScore += 50;
        } else if (
          idx.indexingStatus === AttachmentIndexingStatus.INDEXED &&
          idx.scanStatus === AttachmentScanStatus.CLEAN &&
          idx.extractedText.toLowerCase().includes(qLower)
        ) {
          fileScore += 20;
        }

        const ageInDays = (Date.now() - idx.lastIndexedAt.getTime()) / (1000 * 60 * 60 * 24);
        const recencyBoost = Math.max(0, 10 / (1 + Math.max(0, ageInDays)));
        fileScore += recencyBoost;

        if (isPinned) {
          fileScore += 15;
        }

        fileScore = Math.round(fileScore * 100) / 100;

        let snippet: string | undefined = undefined;
        if (idx.indexingStatus === AttachmentIndexingStatus.INDEXED && idx.scanStatus === AttachmentScanStatus.CLEAN) {
          snippet = makeMessageSnippet(idx.extractedText, q);
        } else if (idx.scanStatus === AttachmentScanStatus.BLOCKED) {
          snippet = "[Blocked due to security policy]";
        } else if (idx.scanStatus === AttachmentScanStatus.PENDING) {
          snippet = "[Pending scan - unindexed]";
        } else if (idx.indexingStatus === AttachmentIndexingStatus.FAILED) {
          snippet = "[File content search unavailable for this attachment]";
        } else if (idx.indexingStatus === AttachmentIndexingStatus.UNINDEXED) {
          snippet = "[File content not indexed]";
        }

        const convName = convNameMap.get(idx.conversationId) ?? "Direct Message";

        return {
          id: idx.id,
          kind: "file" as const,
          title: idx.fileName,
          subtitle: convName,
          timestamp: idx.lastIndexedAt.toISOString(),
          score: fileScore,
          conversationId: idx.conversationId,
          conversationName: convName,
          attachmentId: idx.attachmentId,
          mimeType: idx.mimeType,
          mimeCategory: deriveMimeCategory(idx.mimeType),
          sizeBytes: idx.attachment?.sizeBytes ?? 0,
          sizeLabel: formatSizeLabel(idx.attachment?.sizeBytes ?? 0),
          scanStatus: idx.scanStatus as "PENDING" | "CLEAN" | "BLOCKED",
          snippet,
        };
      });

      fileCount = await db.messagingAttachmentIndex.count({
        where: {
          orgId,
          conversationId: { in: memberConvIds },
          OR: [
            { fileName: { contains: q, mode: "insensitive" } },
            {
              AND: [
                { indexingStatus: AttachmentIndexingStatus.INDEXED },
                { scanStatus: AttachmentScanStatus.CLEAN },
                { extractedText: { contains: q, mode: "insensitive" } },
              ],
            },
          ],
        },
      });

      // Batch-fetch file search metadata states in parallel (reduces from 4 sequential queries to 1 parallel batch)
      const [pendingScanCount, unindexedCount, totalAttachmentCount, indexedAttachmentCount] = await Promise.all([
        db.conversationAttachment.count({
          where: {
            orgId,
            message: { conversationId: { in: memberConvIds } },
            scanStatus: AttachmentScanStatus.PENDING,
          },
        }),
        db.messagingAttachmentIndex.count({
          where: {
            orgId,
            conversationId: { in: memberConvIds },
            indexingStatus: AttachmentIndexingStatus.UNINDEXED,
          },
        }),
        db.conversationAttachment.count({
          where: {
            orgId,
            message: { conversationId: { in: memberConvIds } },
          },
        }),
        db.messagingAttachmentIndex.count({
          where: {
            orgId,
            conversationId: { in: memberConvIds },
          },
        }),
      ]);

      hasPendingScans = pendingScanCount > 0;
      hasUnsupportedFiles = unindexedCount > 0 || (totalAttachmentCount > indexedAttachmentCount);

    } catch (err) {
      console.error("File search query failed:", err);
      // Gracefully fall back to treating file indexing as unavailable (prevents crashing when schema is not migrated)
      isFileSearchUnavailable = true;
    }
  }

  // Combine and rank all results by score descending, breaking ties deterministically
  const allResults: MessagingSearchResult[] = [
    ...matchingMessages,
    ...matchingConversations,
    ...matchingTasks,
    ...matchingMeetings,
    ...matchingFiles,
  ];

  allResults.sort((a, b) => {
    if (Math.abs(b.score - a.score) > 0.001) {
      return b.score - a.score;
    }
    const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    return a.id.localeCompare(b.id);
  });

  // Compute truthful per-kind database counts for facets and paging
  const [
    messageCount,
    conversationCount,
    taskCount,
    meetingCount
  ] = await Promise.all([
    requestedKinds.includes("message") && memberConvIds.length > 0
      ? db.conversationMessage.count({
          where: {
            orgId,
            conversationId: { in: memberConvIds },
            status: { not: "DELETED" },
            deletedAt: null,
            body: { contains: q, mode: "insensitive" },
          },
        })
      : Promise.resolve(0),
    requestedKinds.includes("conversation")
      ? db.conversation.count({
          where: {
            orgId,
            archivedAt: null,
            AND: [
              {
                OR: [
                  { id: { in: memberConvIds } },
                  { type: "CHANNEL", visibility: "PUBLIC" },
                ],
              },
              {
                OR: [
                  { name: { contains: q, mode: "insensitive" } },
                  { description: { contains: q, mode: "insensitive" } },
                ],
              },
            ],
          },
        })
      : Promise.resolve(0),
    requestedKinds.includes("task") && memberConvIds.length > 0
      ? db.messagingTask.count({
          where: {
            orgId,
            conversationId: { in: memberConvIds },
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
        })
      : Promise.resolve(0),
    requestedKinds.includes("meeting") && memberConvIds.length > 0
      ? db.conversationMeeting.count({
          where: {
            orgId,
            conversationId: { in: memberConvIds },
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          },
        })
      : Promise.resolve(0),
  ]);

  // Calculate facets across all authorized query kinds in the organization
  const facets = {
    message: messageCount,
    conversation: conversationCount,
    task: taskCount,
    meeting: meetingCount,
    file: fileCount,
  };

  const isCapped =
    (requestedKinds.includes("message") && messageCount > MAX_CANDIDATES_PER_KIND) ||
    (requestedKinds.includes("conversation") && conversationCount > MAX_CANDIDATES_PER_KIND) ||
    (requestedKinds.includes("task") && taskCount > MAX_CANDIDATES_PER_KIND) ||
    (requestedKinds.includes("meeting") && meetingCount > MAX_CANDIDATES_PER_KIND) ||
    (requestedKinds.includes("file") && fileCount > MAX_CANDIDATES_PER_KIND);

  const windowExceeded = offset >= allResults.length && allResults.length > 0;

  const paginatedResults = allResults.slice(offset, offset + limit);
  const hasMore = allResults.length > offset + limit;

  // Derive final index state truthfully
  let derivedState: "active" | "degraded" | "unindexed" | "partial" = "active";
  if ((searchState as string) === "degraded") {
    derivedState = "degraded";
  } else if (isFileSearchUnavailable && requestedKinds.length === 1 && requestedKinds.includes("file")) {
    derivedState = "unindexed";
  } else if (!isFileSearchUnavailable && (hasPendingScans || hasUnsupportedFiles)) {
    derivedState = "partial";
  }

  return {
    results: paginatedResults,
    facets,
    hasMore,
    state: derivedState,
    unindexedKinds: isFileSearchUnavailable && requestedKinds.includes("file") ? ["file"] : [],
    isCapped,
    windowExceeded,
    fileIndexingState: isFileSearchUnavailable ? "unindexed" : (hasPendingScans || hasUnsupportedFiles ? "partial" : "active"),
    hasPendingScans,
    hasUnsupportedFiles,
  };
}
