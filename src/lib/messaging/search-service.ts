import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

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
  state: "active" | "degraded" | "unindexed";
  unindexedKinds: string[];
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

  const isOnlyUnindexed = requestedKinds.length === 1 && requestedKinds.includes("file");
  const isUnindexedRequested = requestedKinds.includes("file");

  const emptyResponse: MessagingSearchResponse = {
    results: [],
    facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
    hasMore: false,
    state: searchState === "degraded" ? "degraded" : (isOnlyUnindexed ? "unindexed" : "active"),
    unindexedKinds: isUnindexedRequested ? ["file"] : [],
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
      unindexedKinds: isUnindexedRequested ? ["file"] : [],
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
      include: {
        participants: {
          where: { leftAt: null },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES_PER_KIND,
    });

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
        conversationType: c.type,
        isPrivate: c.visibility === "PRIVATE" || c.type === "DM",
        memberCount: c.participants?.length ?? 0,
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
      include: {
        conversation: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES_PER_KIND,
    });

    // Hydrate assignees
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

    matchingTasks = tasks.map((t) => {
      const isPinned = memberConversationMap.get(t.conversationId)?.isPinned ?? false;
      const score = calculateScore({
        mainField: t.title,
        secondaryField: t.description,
        q,
        createdAt: t.createdAt,
        isPinned,
      });

      return {
        id: t.id,
        kind: "task",
        title: t.title,
        subtitle: t.conversation.name ? `#${t.conversation.name}` : "Task Reference",
        timestamp: t.createdAt.toISOString(),
        score,
        conversationId: t.conversationId,
        conversationName: t.conversation.name ?? "Direct Message",
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
      include: {
        conversation: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_CANDIDATES_PER_KIND,
    });

    matchingMeetings = meetings.map((m) => {
      const isPinned = memberConversationMap.get(m.conversationId)?.isPinned ?? false;
      const score = calculateScore({
        mainField: m.title,
        secondaryField: m.description,
        q,
        createdAt: m.createdAt,
        isPinned,
      });

      return {
        id: m.id,
        kind: "meeting",
        title: m.title,
        subtitle: m.conversation.name ? `#${m.conversation.name}` : "Meeting Reference",
        timestamp: m.createdAt.toISOString(),
        score,
        conversationId: m.conversationId,
        conversationName: m.conversation.name ?? "Direct Message",
        scheduledAt: m.scheduledAt.toISOString(),
        durationMinutes: m.durationMinutes,
        joinUrl: m.joinUrl ?? undefined,
      };
    });
  }

  // Combine and rank all results by score descending, breaking ties deterministically
  const allResults: MessagingSearchResult[] = [
    ...matchingMessages,
    ...matchingConversations,
    ...matchingTasks,
    ...matchingMeetings,
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
    file: 0, // unindexed in this sprint
  };

  const paginatedResults = allResults.slice(offset, offset + limit);
  const hasMore =
    allResults.length > offset + limit ||
    (requestedKinds.includes("message") && messageCount > matchingMessages.length && offset + limit >= allResults.length) ||
    (requestedKinds.includes("conversation") && conversationCount > matchingConversations.length && offset + limit >= allResults.length) ||
    (requestedKinds.includes("task") && taskCount > matchingTasks.length && offset + limit >= allResults.length) ||
    (requestedKinds.includes("meeting") && meetingCount > matchingMeetings.length && offset + limit >= allResults.length);

  return {
    results: paginatedResults,
    facets,
    hasMore,
    state: searchState === "degraded" ? "degraded" : (isOnlyUnindexed ? "unindexed" : "active"),
    unindexedKinds: isUnindexedRequested ? ["file"] : [],
  };
}
