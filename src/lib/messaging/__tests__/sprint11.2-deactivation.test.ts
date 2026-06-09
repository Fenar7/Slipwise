import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  memberFindUnique: vi.fn(),
  memberFindMany: vi.fn(),
  conversationParticipantFindFirst: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationFindMany: vi.fn(),
  conversationCreate: vi.fn(),
  conversationParticipantCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const db = {
    member: {
      findUnique: mocks.memberFindUnique,
      findMany: mocks.memberFindMany,
    },
    conversationParticipant: {
      findFirst: mocks.conversationParticipantFindFirst,
      create: mocks.conversationParticipantCreate,
    },
    conversation: {
      findFirst: mocks.conversationFindFirst,
      findMany: mocks.conversationFindMany,
      create: mocks.conversationCreate,
    },
    $transaction: vi.fn((cb: any) => cb(db)),
  };
  return { db };
});

import { assertActiveParticipant, assertGovernanceAction } from "../service-helpers";
import { listConversationMessages } from "../message-service";
import { listConversationsForUser, createConversation, assertValidOrgMembers } from "../conversation-service";
import { authorizeConversationSubscription } from "../realtime/subscription-auth";
import type { RealtimeSession } from "../realtime/session";

const ORG_ID = "org_123";
const USER_ID = "88888888-8888-8888-8888-888888888888"; // UUID format
const CONV_ID = "conv_123";

describe("Sprint 11.2 - Messaging active membership / deactivation checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("assertActiveParticipant helper", () => {
    it("throws active membership required if the user's member role is deactivated", async () => {
      const mockTx = {
        member: {
          findUnique: mocks.memberFindUnique.mockResolvedValueOnce({ role: "deactivated" }),
        },
      } as any;

      await expect(
        assertActiveParticipant(mockTx, ORG_ID, CONV_ID, USER_ID, "sendMessage")
      ).rejects.toThrow("sendMessage: active membership required");

      expect(mocks.memberFindUnique).toHaveBeenCalledWith({
        where: {
          organizationId_userId: {
            organizationId: ORG_ID,
            userId: USER_ID,
          },
        },
        select: { role: true },
      });
    });

    it("throws active membership required if the user has no org membership", async () => {
      const mockTx = {
        member: {
          findUnique: mocks.memberFindUnique.mockResolvedValueOnce(null),
        },
      } as any;

      await expect(
        assertActiveParticipant(mockTx, ORG_ID, CONV_ID, USER_ID, "sendMessage")
      ).rejects.toThrow("sendMessage: active membership required");
    });

    it("succeeds if user is an active member", async () => {
      const mockTx = {
        member: {
          findUnique: mocks.memberFindUnique.mockResolvedValueOnce({ role: "member" }),
        },
        conversationParticipant: {
          findFirst: mocks.conversationParticipantFindFirst.mockResolvedValueOnce({
            id: "part-123",
            orgId: ORG_ID,
            conversationId: CONV_ID,
            userId: USER_ID,
            leftAt: null,
          }),
        },
      } as any;

      const res = await assertActiveParticipant(mockTx, ORG_ID, CONV_ID, USER_ID, "sendMessage");
      expect(res).toBeDefined();
      expect(res.id).toBe("part-123");
    });
  });

  describe("listConversationMessages", () => {
    it("throws active membership required if user is deactivated", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce({ role: "deactivated" });

      await expect(
        listConversationMessages(ORG_ID, CONV_ID, USER_ID)
      ).rejects.toThrow("listConversationMessages: active membership required");
    });

    it("throws active membership required if user has no org membership", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce(null);

      await expect(
        listConversationMessages(ORG_ID, CONV_ID, USER_ID)
      ).rejects.toThrow("listConversationMessages: active membership required");
    });
  });

  describe("listConversationsForUser", () => {
    it("throws active membership required if user is deactivated", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce({ role: "deactivated" });

      await expect(
        listConversationsForUser(ORG_ID, USER_ID)
      ).rejects.toThrow("listConversationsForUser: active membership required");
    });

    it("throws active membership required if user has no org membership", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce(null);

      await expect(
        listConversationsForUser(ORG_ID, USER_ID)
      ).rejects.toThrow("listConversationsForUser: active membership required");
    });
  });

  describe("createConversation", () => {
    it("throws active membership required if creator is deactivated", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce({ role: "deactivated" });

      await expect(
        createConversation({
          orgId: ORG_ID,
          createdBy: USER_ID,
          type: "CHANNEL",
          title: "New Channel",
        })
      ).rejects.toThrow("createConversation: active membership required");
    });

    it("throws active membership required if creator has no org membership", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce(null);

      await expect(
        createConversation({
          orgId: ORG_ID,
          createdBy: USER_ID,
          type: "CHANNEL",
          title: "New Channel",
        })
      ).rejects.toThrow("createConversation: active membership required");
    });
  });

  describe("assertValidOrgMembers", () => {
    it("throws when any candidate user is deactivated", async () => {
      const mockTx = {
        member: {
          findMany: mocks.memberFindMany.mockResolvedValueOnce([
            { userId: "user-1", role: "member" },
            { userId: "user-2", role: "deactivated" },
          ]),
        },
      } as any;

      await expect(
        assertValidOrgMembers(mockTx, ORG_ID, ["user-1", "user-2"], "addParticipant")
      ).rejects.toThrow("addParticipant: invalid, deactivated, or unauthorized participants: user-2");
    });
  });

  describe("assertGovernanceAction (governance/admin path)", () => {
    it("throws active membership required if the user's member role is deactivated", async () => {
      const mockTx = {
        member: {
          findUnique: mocks.memberFindUnique.mockResolvedValueOnce({ role: "deactivated" }),
        },
      } as any;

      await expect(
        assertGovernanceAction(
          mockTx,
          ORG_ID,
          CONV_ID,
          USER_ID,
          "ARCHIVE",
          { participant: null, orgRole: "admin", isPlatformAdmin: false },
          "archiveConversation",
        ),
      ).rejects.toThrow("archiveConversation: active membership required");
    });

    it("throws active membership required if the user has no org membership", async () => {
      const mockTx = {
        member: {
          findUnique: mocks.memberFindUnique.mockResolvedValueOnce(null),
        },
      } as any;

      await expect(
        assertGovernanceAction(
          mockTx,
          ORG_ID,
          CONV_ID,
          USER_ID,
          "LOCK",
          { participant: null, orgRole: "admin", isPlatformAdmin: false },
          "lockConversation",
        ),
      ).rejects.toThrow("lockConversation: active membership required");
    });

    it("proceeds past membership check when user is an active member", async () => {
      const mockTx = {
        member: {
          findUnique: mocks.memberFindUnique.mockResolvedValueOnce({ role: "admin" }),
        },
        conversation: {
          findFirst: mocks.conversationFindFirst.mockResolvedValueOnce({
            id: CONV_ID,
            orgId: ORG_ID,
            type: "CHANNEL",
            archivedAt: null,
            lockedAt: null,
          }),
        },
        conversationParticipant: {
          findFirst: mocks.conversationParticipantFindFirst.mockResolvedValueOnce(null),
        },
      } as any;

      // Should not throw at membership check; may throw later at authorization
      // depending on requireGovernanceAccess, which is fine — proves membership passed.
      const result = await assertGovernanceAction(
        mockTx,
        ORG_ID,
        CONV_ID,
        USER_ID,
        "ARCHIVE",
        { participant: null, orgRole: "admin", isPlatformAdmin: false },
        "archiveConversation",
      );

      expect(result).toBeDefined();
      expect(result.conversation).toBeDefined();
      expect(result.conversation.id).toBe(CONV_ID);
    });
  });

  describe("realtime subscription authorization", () => {
    it("denies subscription if the user is deactivated", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce({ role: "deactivated" });

      const session: RealtimeSession = {
        userId: USER_ID,
        orgId: ORG_ID,
        role: "member",
        representedId: null,
        proxyGrantId: null,
        proxyScope: [],
        sessionId: "session_123",
      };

      mocks.conversationFindFirst.mockResolvedValueOnce({
        id: CONV_ID,
        orgId: ORG_ID,
      });

      const res = await authorizeConversationSubscription(session, CONV_ID);
      expect(res.result.allowed).toBe(false);
      expect(res.result.reason).toBe("active membership required");
      expect(res.diagnostic).toBe("not_member");
    });

    it("denies subscription if the user has no org membership", async () => {
      mocks.memberFindUnique.mockResolvedValueOnce(null);

      const session: RealtimeSession = {
        userId: USER_ID,
        orgId: ORG_ID,
        role: "member",
        representedId: null,
        proxyGrantId: null,
        proxyScope: [],
        sessionId: "session_123",
      };

      mocks.conversationFindFirst.mockResolvedValueOnce({
        id: CONV_ID,
        orgId: ORG_ID,
      });

      const res = await authorizeConversationSubscription(session, CONV_ID);
      expect(res.result.allowed).toBe(false);
      expect(res.result.reason).toBe("active membership required");
      expect(res.diagnostic).toBe("not_member");
    });
  });
});
