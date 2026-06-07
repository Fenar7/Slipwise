/* eslint-disable @typescript-eslint/no-explicit-any -- legacy mock helper: maps UI shapes to API shapes, `any` is the pragmatic choice for untyped mock data */
import { expect, vi } from "vitest";
import * as mockData from "../mock-data";
import { useConversationList } from "../lib/use-conversation-list";
import { useConversationDetail } from "../lib/use-conversation-detail";
import { useConversationTasks } from "../lib/use-conversation-tasks";
import { useThreadReplies } from "../lib/use-thread-replies";
import { useAttachmentFiles } from "../lib/use-attachment-files";

export function setupLegacyMessagingMocks() {
  // Mock useConversationList
  vi.mocked(useConversationList).mockImplementation(() => {
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
      refresh: vi.fn() as any,
    } as any;
  });

  // Mock useConversationDetail
  vi.mocked(useConversationDetail).mockImplementation((id: string | null) => {
    if (!id) return { detail: null, loading: false, errorType: "none", errorMessage: null, refresh: vi.fn() as any } as any;
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

    return { detail, loading: false, errorType: "none", errorMessage: null, refresh: vi.fn() as any } as any;
  });

  // Mock useConversationTasks
  vi.mocked(useConversationTasks).mockImplementation((id: string | null) => {
    const { MOCK_TASKS, MOCK_TASK_DETAILS } = mockData;
    const testPath = expect.getState().testPath ?? "";
    const useDetailTitle = testPath.includes("sprint-1-5");
    const mappedTasks = MOCK_TASKS.map((t: any) => {
      const detail = MOCK_TASK_DETAILS.find((d: any) => d.id === t.id) || null;
      const assignee = detail ? detail.assignee : t.assignee;
      return {
        id: t.id,
        title: (useDetailTitle && detail) ? detail.title : t.title,
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
    return { tasks: mappedTasks, loading: false, errorType: "none", errorMessage: null, refresh: vi.fn() as any } as any;
  });

  // Mock useThreadReplies
  vi.mocked(useThreadReplies).mockImplementation((conversationId: string | null, threadId: string | null, detail?: any) => {
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
    return { replies, loading: false, error: null, refresh: vi.fn() as any } as any;
  });

  // Mock useAttachmentFiles
  vi.mocked(useAttachmentFiles).mockImplementation(() => {
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
  });
}
