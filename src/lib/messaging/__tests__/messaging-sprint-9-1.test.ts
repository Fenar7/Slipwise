import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const mocks = {
    conversationParticipant: {
      findMany: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
    },
    conversationMessage: {
      findMany: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
    },
    conversationMeeting: {
      findMany: vi.fn(),
    },
    profile: {
      findMany: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});

import { db } from "@/lib/db";
import { searchMessaging } from "../search-service";

describe("Sprint 9.1 — Search Foundation & Visibility-Safe Query Model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("searchMessaging Visibility and Authorization", () => {
    it("users only see results from conversations they are authorized to access", async () => {
      // Setup mock data
      // User is active participant in conversation-1, but not conversation-2
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conversation-1", orgId: "org-1", userId: "user-1", leftAt: null, isPinned: false },
      ] as any);

      // Search term matches messages in both conversations
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        {
          id: "msg-1",
          conversationId: "conversation-1",
          orgId: "org-1",
          authorId: "author-1",
          body: "This matches the query term",
          createdAt: new Date(),
          status: "ACTIVE",
          conversation: { name: "finance-ops" },
        },
      ] as any);

      // Mock author profile
      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "author-1", name: "Priya Sharma" },
      ] as any);

      const result = await searchMessaging("org-1", "user-1", {
        q: "matches",
        kinds: ["message"],
      });

      // Verify that conversationParticipant was queried with active user membership
      expect(db.conversationParticipant.findMany).toHaveBeenCalledWith({
        where: { orgId: "org-1", userId: "user-1", leftAt: null },
        select: { conversationId: true, isPinned: true },
      });

      // Verify message query is restricted to conversation-1 (member Conv IDs)
      expect(db.conversationMessage.findMany).toHaveBeenCalledWith({
        where: {
          orgId: "org-1",
          conversationId: { in: ["conversation-1"] },
          status: { not: "DELETED" },
          deletedAt: null,
          body: { contains: "matches", mode: "insensitive" },
        },
        include: { conversation: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
      });

      // Verify result lists msg-1 and no trace of msg-2 in results or facets
      expect(result.results.length).toBe(1);
      expect(result.results[0].id).toBe("msg-1");
      expect(result.facets.message).toBe(1);
    });

    it("prevents unauthorized discovery of private/restricted conversations", async () => {
      // User is only in conversation-1
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conversation-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      // DB returns public channels + user's joined conversations matching q
      vi.mocked(db.conversation.findMany).mockResolvedValue([
        {
          id: "conversation-1",
          orgId: "org-1",
          type: "CHANNEL",
          name: "general",
          description: "General channel",
          visibility: "PUBLIC",
          createdAt: new Date(),
        },
      ] as any);

      const result = await searchMessaging("org-1", "user-1", {
        q: "general",
        kinds: ["conversation"],
      });

      expect(db.conversation.findMany).toHaveBeenCalledWith({
        where: {
          orgId: "org-1",
          archivedAt: null,
          OR: [
            { id: { in: ["conversation-1"] } },
            { type: "CHANNEL", visibility: "PUBLIC" },
          ],
          OR: [
            { name: { contains: "general", mode: "insensitive" } },
            { description: { contains: "general", mode: "insensitive" } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });

      expect(result.results[0].id).toBe("conversation-1");
    });
  });

  describe("searchMessaging Ranking and Snippets", () => {
    it("prefers exact matches over partial match scoring", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conversation-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      const now = new Date();
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        {
          id: "msg-partial",
          conversationId: "conversation-1",
          orgId: "org-1",
          authorId: "author-1",
          body: "Matches partially here",
          createdAt: now,
          status: "ACTIVE",
          conversation: { name: "channel-1" },
        },
        {
          id: "msg-exact",
          conversationId: "conversation-1",
          orgId: "org-1",
          authorId: "author-1",
          body: "matches",
          createdAt: now,
          status: "ACTIVE",
          conversation: { name: "channel-1" },
        },
      ] as any);

      vi.mocked(db.profile.findMany).mockResolvedValue([
        { id: "author-1", name: "User" },
      ] as any);

      const result = await searchMessaging("org-1", "user-1", {
        q: "matches",
        kinds: ["message"],
      });

      // exact matches rank higher
      expect(result.results[0].id).toBe("msg-exact");
      expect(result.results[1].id).toBe("msg-partial");
    });

    it("generates a safe, truncated snippet for long message contents", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conversation-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      const longBody = "This is a very long body prefix text ".repeat(10) + "target_word" + " suffix text ending here.".repeat(10);
      vi.mocked(db.conversationMessage.findMany).mockResolvedValue([
        {
          id: "msg-long",
          conversationId: "conversation-1",
          orgId: "org-1",
          authorId: "author-1",
          body: longBody,
          createdAt: new Date(),
          status: "ACTIVE",
          conversation: { name: "channel-1" },
        },
      ] as any);

      vi.mocked(db.profile.findMany).mockResolvedValue([{ id: "author-1", name: "User" }] as any);

      const result = await searchMessaging("org-1", "user-1", {
        q: "target_word",
        kinds: ["message"],
      });

      const messageResult = result.results[0] as any;
      expect(messageResult.snippet.includes("target_word")).toBe(true);
      expect(messageResult.snippet.startsWith("...")).toBe(true);
      expect(messageResult.snippet.length).toBeLessThan(150);
    });
  });

  describe("searchMessaging Truthful States", () => {
    it("handles empty/whitespace queries safely without querying DB", async () => {
      const result = await searchMessaging("org-1", "user-1", {
        q: "   ",
      });

      expect(result.results).toEqual([]);
      expect(db.conversationParticipant.findMany).not.toHaveBeenCalled();
    });

    it("returns degraded state when parameter or force query is present", async () => {
      const result = await searchMessaging("org-1", "user-1", {
        q: "force-degraded",
      });

      expect(result.state).toBe("degraded");
      expect(result.results).toEqual([]);
    });

    it("identifies kinds not yet indexed correctly as unindexed", async () => {
      vi.mocked(db.conversationParticipant.findMany).mockResolvedValue([
        { conversationId: "conversation-1", orgId: "org-1", userId: "user-1", leftAt: null },
      ] as any);

      const result = await searchMessaging("org-1", "user-1", {
        q: "payroll",
        kinds: ["file"],
      });

      expect(result.state).toBe("unindexed");
      expect(result.unindexedKinds).toContain("file");
      expect(result.results).toEqual([]);
    });
  });
});
