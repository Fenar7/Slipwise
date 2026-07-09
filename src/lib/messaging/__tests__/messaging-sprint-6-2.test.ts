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
import { createTask, updateTaskStatus, assignTask } from "../task-service";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "../errors";

describe("Sprint 6.2 Service layer — Tasks Work Coordination", () => {
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

  describe("createTask", () => {
    it("throws ConversationAccessError if creator is not a participant", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(null);

      await expect(
        createTask({
          orgId: "org-1",
          conversationId: "conv-1",
          createdBy: "user-1",
          title: "Test Task",
        })
      ).rejects.toThrow(ConversationAccessError);
    });

    it("throws InvalidInputError if assignee is not a participant", async () => {
      // First call for creator succeeds, second call for assignee returns null
      (db.conversationParticipant.findFirst as any)
        .mockResolvedValueOnce(mockActiveParticipant()) // Creator check
        .mockResolvedValueOnce(null); // Assignee check
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

      const promise = createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Test Task",
        assigneeId: "user-assignee",
      });

      await expect(promise).rejects.toThrow("Assignee must be an active participant");
      await expect(promise).rejects.toThrow(InvalidInputError);
    });

    it("successfully creates task when creator and assignee are valid", async () => {
      (db.conversationParticipant.findFirst as any)
        .mockResolvedValueOnce(mockActiveParticipant()) // Creator check
        .mockResolvedValueOnce(mockActiveParticipant({ userId: "user-assignee" })); // Assignee check
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

      const mockDbRecord = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        originatingMessageId: null,
        title: "Test Task",
        description: "Some context",
        status: "OPEN",
        priority: 1,
        assigneeId: "user-assignee",
        dueDate: null,
        completedAt: null,
        completedBy: null,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (db.messagingTask.create as any).mockResolvedValue(mockDbRecord);

      const result = await createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Test Task",
        description: "Some context",
        priority: 1,
        assigneeId: "user-assignee",
      });

      expect(result.id).toBe("task-1");
      expect(result.title).toBe("Test Task");
      expect(db.messagingTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: "Test Task",
            description: "Some context",
            priority: 1,
            assigneeId: "user-assignee",
          }),
        })
      );
    });
  });

  describe("updateTaskStatus", () => {
    it("throws NotFoundError if task does not exist", async () => {
      (db.messagingTask.findUnique as any).mockResolvedValue(null);

      const promise = updateTaskStatus({
        orgId: "org-1",
        taskId: "task-1",
        status: "DONE",
        actorId: "user-1",
        conversationId: "conv-1",
      });

      await expect(promise).rejects.toThrow("Task not found");
      await expect(promise).rejects.toThrow(NotFoundError);
    });

    it("throws NotFoundError if task conversationId does not match URL conversationId", async () => {
      (db.messagingTask.findUnique as any).mockResolvedValue({
        id: "task-1",
        conversationId: "conv-other",
        status: "OPEN",
      });

      const promise = updateTaskStatus({
        orgId: "org-1",
        taskId: "task-1",
        status: "DONE",
        actorId: "user-1",
        conversationId: "conv-1",
      });

      await expect(promise).rejects.toThrow("Task not found");
      await expect(promise).rejects.toThrow(NotFoundError);
    });

    it("throws ConversationAccessError if actor is not an active participant", async () => {
      (db.messagingTask.findUnique as any).mockResolvedValue({
        id: "task-1",
        conversationId: "conv-1",
        status: "OPEN",
      });
      (db.conversationParticipant.findFirst as any).mockResolvedValue(null);

      await expect(
        updateTaskStatus({
          orgId: "org-1",
          taskId: "task-1",
          status: "DONE",
          actorId: "user-1",
          conversationId: "conv-1",
        })
      ).rejects.toThrow(ConversationAccessError);
    });

    it("updates status and writes completion metadata when marking as DONE", async () => {
      const mockTask = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Task Title",
        status: "OPEN",
        priority: 1,
        createdBy: "user-creator",
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: null,
        assigneeId: null,
        reminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.messagingTask.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...mockTask,
          ...data,
          completedAt: data.completedAt || new Date(),
          completedBy: data.completedBy || "user-actor",
        });
      });

      const result = await updateTaskStatus({
        orgId: "org-1",
        taskId: "task-1",
        status: "DONE",
        actorId: "user-actor",
        conversationId: "conv-1",
      });

      expect(result.status).toBe("DONE");
      expect(result.completedBy).toBe("user-actor");
      expect(result.completedAt).not.toBeNull();

      expect(db.messagingTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-1" },
          data: expect.objectContaining({
            status: "DONE",
            completedAt: expect.any(Date),
            completedBy: "user-actor",
            reminderAt: null,
          }),
        })
      );
    });

    it("clears completion metadata when moving away from DONE", async () => {
      const mockTask = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Task Title",
        status: "DONE",
        priority: 1,
        createdBy: "user-creator",
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: null,
        assigneeId: null,
        completedAt: new Date(),
        completedBy: "user-actor",
      };

      (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.messagingTask.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...mockTask,
          ...data,
        });
      });

      const result = await updateTaskStatus({
        orgId: "org-1",
        taskId: "task-1",
        status: "IN_PROGRESS",
        actorId: "user-actor",
        conversationId: "conv-1",
      });

      expect(result.status).toBe("IN_PROGRESS");
      expect(result.completedBy).toBeNull();
      expect(result.completedAt).toBeNull();

      expect(db.messagingTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "task-1" },
          data: {
            status: "IN_PROGRESS",
            completedAt: null,
            completedBy: null,
          },
        })
      );
    });
  });

  describe("assignTask", () => {
    it("successfully updates task assignee", async () => {
      const mockTask = {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Task Title",
        status: "OPEN",
        priority: 1,
        createdBy: "user-creator",
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: null,
        assigneeId: null,
      };

      (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
      (db.conversationParticipant.findFirst as any)
        .mockResolvedValueOnce(mockActiveParticipant()) // Actor check
        .mockResolvedValueOnce(mockActiveParticipant({ userId: "user-assignee" })); // Assignee check
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.messagingTask.update as any).mockImplementation(({ data }: any) => {
        return Promise.resolve({
          ...mockTask,
          assigneeId: data.assigneeId,
        });
      });

      const result = await assignTask({
        orgId: "org-1",
        taskId: "task-1",
        assigneeId: "user-assignee",
        actorId: "user-actor",
        conversationId: "conv-1",
      });

      expect(result.assigneeId).toBe("user-assignee");
      expect(db.messagingTask.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { assigneeId: "user-assignee" },
      });
    });

    it("throws NotFoundError if task conversationId does not match URL conversationId", async () => {
      (db.messagingTask.findUnique as any).mockResolvedValue({
        id: "task-1",
        conversationId: "conv-other",
        status: "OPEN",
      });

      const promise = assignTask({
        orgId: "org-1",
        taskId: "task-1",
        assigneeId: "user-assignee",
        actorId: "user-actor",
        conversationId: "conv-1",
      });

      await expect(promise).rejects.toThrow("Task not found");
      await expect(promise).rejects.toThrow(NotFoundError);
    });
  });

  describe("conversation action policy enforcement", () => {
    it("createTask rejects writes to archived conversations", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(
        mockActiveConversation({ archivedAt: new Date(), archivedBy: "user-admin" })
      );

      await expect(
        createTask({
          orgId: "org-1",
          conversationId: "conv-1",
          createdBy: "user-1",
          title: "Should fail",
        })
      ).rejects.toThrow("createTask: conversation is archived");
    });

    it("createTask rejects writes to locked conversations", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(
        mockActiveConversation({ lockedAt: new Date(), lockedBy: "user-admin", lockReason: "audit" })
      );

      await expect(
        createTask({
          orgId: "org-1",
          conversationId: "conv-1",
          createdBy: "user-1",
          title: "Should fail",
        })
      ).rejects.toThrow("createTask: conversation is locked");
    });

    it("updateTaskStatus rejects writes to archived conversations", async () => {
      (db.messagingTask.findUnique as any).mockResolvedValue({
        id: "task-1", conversationId: "conv-1", status: "OPEN",
      });
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(
        mockActiveConversation({ archivedAt: new Date() })
      );

      await expect(
        updateTaskStatus({
          orgId: "org-1", taskId: "task-1", status: "DONE", actorId: "user-1", conversationId: "conv-1",
        })
      ).rejects.toThrow("updateTaskStatus: conversation is archived");
    });

    it("updateTaskStatus rejects writes to locked conversations", async () => {
      (db.messagingTask.findUnique as any).mockResolvedValue({
        id: "task-1", conversationId: "conv-1", status: "OPEN",
      });
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(
        mockActiveConversation({ lockedAt: new Date() })
      );

      await expect(
        updateTaskStatus({
          orgId: "org-1", taskId: "task-1", status: "DONE", actorId: "user-1", conversationId: "conv-1",
        })
      ).rejects.toThrow("updateTaskStatus: conversation is locked");
    });

    it("assignTask rejects writes to archived conversations", async () => {
      (db.messagingTask.findUnique as any).mockResolvedValue({
        id: "task-1", conversationId: "conv-1", status: "OPEN",
      });
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(
        mockActiveConversation({ archivedAt: new Date() })
      );

      await expect(
        assignTask({
          orgId: "org-1", taskId: "task-1", assigneeId: "user-2", actorId: "user-1", conversationId: "conv-1",
        })
      ).rejects.toThrow("assignTask: conversation is archived");
    });
  });
});
