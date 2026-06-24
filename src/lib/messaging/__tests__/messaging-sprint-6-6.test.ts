import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    conversationParticipant: {
      findFirst: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
    },
    conversationMessage: {
      findUnique: vi.fn(),
    },
    messagingTask: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
  };
  (db as any).$transaction = vi.fn(async (cb: any) => cb(db));
  return { db };
});

import { db } from "@/lib/db";
import { createTask, updateTask } from "../task-service";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "../errors";

describe("Sprint 6.6 Service layer — Task Reminders & Create-from-Message", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockActiveConversation(overrides: Record<string, unknown> = {}) {
    return {
      id: "conv-1",
      orgId: "org-1",
      type: "CHANNEL",
      name: "engineering",
      description: null,
      visibility: "PUBLIC",
      dmPeerId: null,
      archivedAt: null,
      archivedBy: null,
      lockedAt: null,
      lockedBy: null,
      lockReason: null,
      createdBy: "user-owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function mockActiveParticipant(overrides: Record<string, unknown> = {}) {
    return {
      id: "membership-1",
      orgId: "org-1",
      conversationId: "conv-1",
      userId: "user-1",
      role: "MEMBER",
      leftAt: null,
      mutedUntil: null,
      displayName: null,
      isPinned: false,
      joinedAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function mockDbRecord(overrides: Record<string, unknown> = {}) {
    return {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      originatingMessageId: null,
      title: "Test Task",
      description: null,
      status: "OPEN",
      priority: 0,
      assigneeId: null,
      dueDate: null,
      reminderAt: null,
      reminderSentAt: null,
      completedAt: null,
      completedBy: null,
      createdBy: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe("createTask with reminder", () => {
    it("creates a task with a valid reminder", async () => {
      const reminderAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
      const dueDate = new Date(Date.now() + 48 * 60 * 60 * 1000); // day after

      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.messagingTask.create as any).mockResolvedValue(mockDbRecord({ reminderAt, dueDate }));

      const result = await createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Test Task",
        reminderAt,
        dueDate,
      });

      expect(result.reminderAt).toEqual(reminderAt);
      expect(db.messagingTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reminderAt }),
        })
      );
    });

    it("rejects reminder after dueDate", async () => {
      const reminderAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

      const promise = createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Test Task",
        reminderAt,
        dueDate,
      });

      await expect(promise).rejects.toThrow("Reminder must not be after the due date");
      await expect(promise).rejects.toThrow(InvalidInputError);
    });

    it("rejects past reminder", async () => {
      const reminderAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday

      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

      const promise = createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Test Task",
        reminderAt,
      });

      await expect(promise).rejects.toThrow("Reminder must be in the future");
      await expect(promise).rejects.toThrow(InvalidInputError);
    });

    it("allows null reminder without validation", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.messagingTask.create as any).mockResolvedValue(mockDbRecord());

      const result = await createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Test Task",
      });

      expect(result.reminderAt).toBeNull();
    });
  });

  describe("createTask from message", () => {
    it("creates a task anchored to a valid message in the same conversation", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.conversationMessage.findUnique as any).mockResolvedValue({
        id: "msg-1",
        orgId: "org-1",
        conversationId: "conv-1",
      });
      (db.messagingTask.create as any).mockResolvedValue(
        mockDbRecord({ originatingMessageId: "msg-1" })
      );

      const result = await createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Follow up",
        originatingMessageId: "msg-1",
      });

      expect(result.originatingMessageId).toBe("msg-1");
      expect(db.messagingTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originatingMessageId: "msg-1" }),
        })
      );
    });

    it("rejects originatingMessageId from a different conversation", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.conversationMessage.findUnique as any).mockResolvedValue({
        id: "msg-1",
        orgId: "org-1",
        conversationId: "conv-other",
      });

      const promise = createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Follow up",
        originatingMessageId: "msg-1",
      });

      await expect(promise).rejects.toThrow("Originating message must belong to the same conversation");
      await expect(promise).rejects.toThrow(InvalidInputError);
    });

    it("rejects create-from-message on archived conversation", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(
        mockActiveConversation({ archivedAt: new Date() })
      );

      const promise = createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Follow up",
        originatingMessageId: "msg-1",
      });

      await expect(promise).rejects.toThrow("createTask: conversation is archived");
    });
  });

  describe("updateTask with reminder", () => {
    it("updates reminderAt successfully", async () => {
      const reminderAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const mockTask = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        status: "OPEN",
        dueDate: null,
        assigneeId: null,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.messagingTask.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({ ...mockTask, ...data });
      });

      const result = await updateTask({
        orgId: "org-1",
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1",
        reminderAt,
      });

      expect(result.reminderAt).toEqual(reminderAt);
    });

    it("clears reminderAt when marking task DONE", async () => {
      const reminderAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const mockTask = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        status: "OPEN",
        dueDate: null,
        assigneeId: null,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.messagingTask.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({ ...mockTask, ...data });
      });

      const result = await updateTask({
        orgId: "org-1",
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1",
        status: "DONE",
      });

      expect(db.messagingTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reminderAt: null }),
        })
      );
    });

    it("rejects reminder that violates dueDate invariant on update", async () => {
      const dueDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const reminderAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const mockTask = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        status: "OPEN",
        dueDate,
        assigneeId: null,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

      const promise = updateTask({
        orgId: "org-1",
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1",
        reminderAt,
      });

      await expect(promise).rejects.toThrow("Reminder must not be after the due date");
      await expect(promise).rejects.toThrow(InvalidInputError);
    });
  });
});
