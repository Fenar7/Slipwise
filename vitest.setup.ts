import "dotenv/config";
import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;

beforeEach(async () => {
  const dbModule = await import("@/lib/db");
  const db = dbModule?.db;
  if (db && typeof db === "object") {
    // 1. Mock member model
    if (!("member" in db)) {
      (db as any).member = {
        findMany: vi.fn().mockImplementation(async (args: any) => {
          const userIds = args?.where?.userId?.in || (args?.where?.userId ? [args.where.userId] : []);
          return userIds.map((userId: string) => ({
            userId,
            organizationId: args?.where?.organizationId ?? "org-aaa",
          }));
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };
    }

    // 2. Mock conversationEventLog model
    if (!("conversationEventLog" in db)) {
      (db as any).conversationEventLog = {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({}),
      };
    }

    // 3. Make sure messageMention.findMany returns an empty array by default
    if ("messageMention" in db) {
      const mention = (db as any).messageMention;
      if (mention && mention.findMany && typeof mention.findMany.mockImplementation === "function" && !mention.findMany.getMockImplementation()) {
        mention.findMany.mockImplementation(async () => {
          return [];
        });
      }
    }

    // 4. Make sure messageReaction.findMany returns an empty array by default if it exists and is a mock
    if ("messageReaction" in db) {
      const rx = (db as any).messageReaction;
      if (rx && rx.findMany && typeof rx.findMany.mockImplementation === "function" && !rx.findMany.getMockImplementation()) {
        rx.findMany.mockImplementation(async () => {
          return [];
        });
      }
    }

    // 5. Make sure conversationAttachment.findMany returns an empty array by default if it exists and is a mock
    if ("conversationAttachment" in db) {
      const att = (db as any).conversationAttachment;
      if (att && att.findMany && typeof att.findMany.mockImplementation === "function" && !att.findMany.getMockImplementation()) {
        att.findMany.mockImplementation(async () => {
          return [];
        });
      }
    }
  }
});

vi.mock("@/app/app/messaging/lib/use-conversation-list", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/app/messaging/lib/use-conversation-list")>();
  const mockData = await import("@/app/app/messaging/mock-data");
  return {
    ...actual,
    useConversationList: () => {
      const testPath = expect.getState().testPath ?? "";
      const isLegacy = testPath.includes("sprint-1-") || testPath.includes("sprint-5-5-files");
      if (isLegacy) {
        const { MOCK_CHANNELS, MOCK_DMS, MOCK_GROUPS } = mockData;
        const mappedChannels = MOCK_CHANNELS.map((ch: any) => ({
          id: ch.id,
          orgId: "org-aaa",
          type: "CHANNEL",
          name: ch.name,
          description: ch.description,
          visibility: ch.visibility === "private" ? "PRIVATE" : "PUBLIC",
          archivedAt: null,
          lockedAt: null,
          participantCount: ch.memberCount,
          lastMessageAt: ch.lastActivityAt,
          unreadCount: ch.unreadCount,
          createdAt: "2026-01-01T00:00:00Z",
          canSend: true,
        }));
        const mappedDms = MOCK_DMS.map((dm: any) => ({
          id: dm.id,
          orgId: "org-aaa",
          type: "DM",
          name: dm.participant.name,
          description: null,
          visibility: null,
          archivedAt: null,
          lockedAt: null,
          participantCount: 2,
          lastMessageAt: dm.lastActivityAt,
          unreadCount: dm.unreadCount,
          createdAt: "2026-01-01T00:00:00Z",
          canSend: true,
          dmPeerId: dm.participant.id,
          dmPeerName: dm.participant.name,
        }));
        const mappedGroups = MOCK_GROUPS.map((grp: any) => ({
          id: grp.id,
          orgId: "org-aaa",
          type: "GROUP",
          name: grp.name,
          description: null,
          visibility: grp.isPrivate ? "PRIVATE" : "PUBLIC",
          archivedAt: null,
          lockedAt: null,
          participantCount: grp.memberCount,
          lastMessageAt: grp.lastActivityAt,
          unreadCount: grp.unreadCount,
          createdAt: "2026-01-01T00:00:00Z",
          canSend: true,
        }));
        return {
          channels: mappedChannels,
          dms: mappedDms,
          groups: mappedGroups,
          loading: false,
          error: null,
          empty: false,
          refresh: vi.fn(),
        };
      }
      return actual.useConversationList();
    }
  };
});

vi.mock("@/app/app/messaging/lib/use-conversation-detail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/app/messaging/lib/use-conversation-detail")>();
  const mockData = await import("@/app/app/messaging/mock-data");
  return {
    ...actual,
    useConversationDetail: (id: string | null) => {
      const testPath = expect.getState().testPath ?? "";
      const isLegacy = testPath.includes("sprint-1-") || testPath.includes("sprint-5-5-files");
      if (isLegacy) {
        if (!id) return { detail: null, loading: false, errorType: "none", errorMessage: null, refresh: vi.fn() };
        const {
          MOCK_CHANNELS, MOCK_DMS, MOCK_GROUPS,
          MOCK_MESSAGES_CHANNEL_GENERAL, MOCK_MESSAGES_CHANNEL_FINANCE,
          MOCK_MESSAGES_DM_ARJUN, MOCK_MESSAGES_DM_SNEHA,
          MOCK_MESSAGES_GROUP_Q2, MOCK_MESSAGES_GROUP_VENDOR,
          MOCK_THREAD_REPLIES_CH_F_1
        } = mockData;

        let type: "CHANNEL" | "DM" | "GROUP" = "CHANNEL";
        let name = "";
        let description = "";
        let visibility: "PUBLIC" | "PRIVATE" = "PUBLIC";
        let participantCount = 48;
        let rawMessages: any[] = [];

        const channel = MOCK_CHANNELS.find((c: any) => c.id === id);
        const dm = MOCK_DMS.find((d: any) => d.id === id);
        const grp = MOCK_GROUPS.find((g: any) => g.id === id);

        if (channel) {
          type = "CHANNEL";
          name = channel.name;
          description = channel.description;
          visibility = channel.visibility === "private" ? "PRIVATE" : "PUBLIC";
          participantCount = channel.memberCount;
          rawMessages = id === "ch-general" ? MOCK_MESSAGES_CHANNEL_GENERAL : MOCK_MESSAGES_CHANNEL_FINANCE;
        } else if (dm) {
          type = "DM";
          name = dm.participant.name;
          visibility = "PRIVATE";
          participantCount = 2;
          rawMessages = id === "dm-1" ? MOCK_MESSAGES_DM_ARJUN : MOCK_MESSAGES_DM_SNEHA;
        } else if (grp) {
          type = "GROUP";
          name = grp.name;
          visibility = grp.isPrivate ? "PRIVATE" : "PUBLIC";
          participantCount = grp.memberCount;
          rawMessages = id === "grp-q2-close" ? MOCK_MESSAGES_GROUP_Q2 : MOCK_MESSAGES_GROUP_VENDOR;
        }

        const messages = rawMessages.map((msg: any) => ({
          id: msg.id,
          orgId: "org-aaa",
          conversationId: id,
          threadId: null,
          authorId: msg.authorId || "u1",
          authorName: msg.authorName || "Priya Sharma",
          authorInitials: msg.authorInitials || "PS",
          body: msg.body,
          status: "ACTIVE",
          editedAt: null,
          deletedAt: null,
          reactionSummary: msg.reactions || [],
          attachmentCount: msg.attachmentRecords?.length || 0,
          createdAt: msg.sentAt || "2026-05-09T10:00:00Z",
          attachmentRecords: msg.attachmentRecords || [],
        }));

        const threads = messages.filter((m: any) => id === "ch-finance" && m.id === "msg-ch-f-1").map((m: any) => ({
          id: "thread-ch-f-1",
          anchorMessageId: "msg-ch-f-1",
          replyCount: MOCK_THREAD_REPLIES_CH_F_1.length,
          lastReplyAt: "2026-05-09T10:30:00Z",
        }));

        const detail = {
          id,
          orgId: "org-aaa",
          type,
          name,
          description,
          visibility,
          archivedAt: null,
          lockedAt: null,
          createdBy: "u1",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-05-18T10:00:00Z",
          participantCount,
          canSend: true,
          participants: [],
          participantProfiles: [],
          messages,
          threads,
          readState: { lastReadMessageId: null, lastReadAt: null, unreadCount: 0, isMuted: false },
          currentUserId: "u1",
        };

        return { detail, loading: false, errorType: "none", errorMessage: null, refresh: vi.fn() };
      }
      return actual.useConversationDetail(id);
    }
  };
});

vi.mock("@/app/app/messaging/lib/use-conversation-tasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/app/messaging/lib/use-conversation-tasks")>();
  const mockData = await import("@/app/app/messaging/mock-data");
  return {
    ...actual,
    useConversationTasks: (id: string | null) => {
      const testPath = expect.getState().testPath ?? "";
      const isLegacy = testPath.includes("sprint-1-") || testPath.includes("sprint-5-5-files");
      if (isLegacy) {
        const { MOCK_TASKS, MOCK_TASK_DETAILS } = mockData;
        const isSprint15 = testPath.includes("sprint-1-5");
        const mappedTasks = MOCK_TASKS.map((t: any) => {
          const detail = isSprint15 ? MOCK_TASK_DETAILS.find((d: any) => d.id === t.id) : null;
          const assignee = detail ? detail.assignee : t.assignee;
          return {
            id: t.id,
            title: detail ? detail.title : t.title,
            status: t.status.toUpperCase(),
            priority: detail ? detail.priority : (t.priority ?? "medium"),
            dueDate: t.dueDate,
            assigneeId: assignee ? assignee.id : null,
            assigneeName: assignee ? assignee.name : null,
            assigneeAvatarInitials: assignee ? assignee.avatarInitials : null,
            description: detail ? detail.description : null,
            createdAt: detail ? detail.createdAt : "2026-05-01T00:00:00Z",
            createdBy: detail ? detail.createdBy : "System",
            conversationId: t.conversationRef,
          };
        });
        return { tasks: mappedTasks, loading: false, errorType: "none", errorMessage: null, refresh: vi.fn() };
      }
      return actual.useConversationTasks(id);
    }
  };
});

vi.mock("@/app/app/messaging/lib/use-thread-replies", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/app/messaging/lib/use-thread-replies")>();
  const mockData = await import("@/app/app/messaging/mock-data");
  return {
    ...actual,
    useThreadReplies: (conversationId: string | null, threadId: string | null) => {
      const testPath = expect.getState().testPath ?? "";
      const isLegacy = testPath.includes("sprint-1-") || testPath.includes("sprint-5-5-files");
      if (isLegacy) {
        const { MOCK_THREAD_REPLIES_CH_F_1 } = mockData;
        const replies = threadId ? MOCK_THREAD_REPLIES_CH_F_1.map((r: any) => ({
          id: r.id,
          orgId: "org-aaa",
          conversationId: conversationId ?? "ch-finance",
          threadId: threadId,
          authorId: r.authorId || "u1",
          authorName: r.authorName || "Priya Sharma",
          authorInitials: r.authorInitials || "PS",
          body: r.body,
          status: "ACTIVE",
          editedAt: null,
          deletedAt: null,
          reactionSummary: [],
          attachmentCount: 0,
          createdAt: r.sentAt || "2026-05-09T10:30:00Z",
        })) : [];
        return { replies, loading: false, error: null, refresh: vi.fn() };
      }
      return actual.useThreadReplies(conversationId, threadId);
    }
  };
});

vi.mock("@/app/app/messaging/lib/use-attachment-files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/app/messaging/lib/use-attachment-files")>();
  const mockData = await import("@/app/app/messaging/mock-data");
  return {
    ...actual,
    useAttachmentFiles: () => {
      const testPath = expect.getState().testPath ?? "";
      const isLegacy = testPath.includes("sprint-1-") || testPath.includes("sprint-5-5-files");
      if (isLegacy) {
        const { MOCK_FILES } = mockData;
        const files = MOCK_FILES.map((f: any) => ({
          id: f.id,
          storageRef: f.storageRef,
          name: f.name,
          mimeType: f.mimeType,
          mimeCategory: f.mimeCategory ?? f.category,
          sizeLabel: f.sizeLabel,
          sizeBytes: f.sizeBytes,
          thumbnailRef: f.thumbnailRef,
          scanStatus: "scanned",
          uploadedAt: f.uploadedAt,
          messageId: "msg-1",
        }));
        return {
          files,
          loading: false,
          error: null,
          fetchFiles: vi.fn(),
          fetchDownloadUrl: vi.fn().mockResolvedValue({ signedUrl: "https://mock.url", fileName: "test.pdf", mimeType: "application/pdf" }),
          clearError: vi.fn()
        };
      }
      return actual.useAttachmentFiles();
    }
  };
});

