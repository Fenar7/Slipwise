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
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
  return { db };
});

import { db } from "@/lib/db";
import { updateTask, createTask } from "../task-service";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "../errors";

describe("Sprint 6.3 Service layer — Unified updateTask Details", () => {
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

  it("successfully updates all editable details", async () => {
    const originalTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Old Title",
      description: "Old Description",
      status: "OPEN",
      priority: 1,
      assigneeId: "user-1",
      dueDate: new Date("2026-06-01T00:00:00Z"),
      createdBy: "user-owner",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(originalTask);
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant({ userId: "user-1" })) // Actor active participant check
      .mockResolvedValueOnce(mockActiveParticipant({ userId: "user-2" })); // Assignee validation check
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

    const expectedUpdatedTask = {
      ...originalTask,
      title: "New Title",
      description: "New Description",
      priority: 2,
      assigneeId: "user-2",
      dueDate: new Date("2026-06-15T00:00:00Z"),
      status: "IN_PROGRESS",
    };

    (db.messagingTask.update as any).mockResolvedValue(expectedUpdatedTask);

    const result = await updateTask({
      orgId: "org-1",
      taskId: "task-1",
      actorId: "user-1",
      conversationId: "conv-1",
      title: "New Title",
      description: "New Description",
      priority: 2,
      assigneeId: "user-2",
      dueDate: new Date("2026-06-15T00:00:00Z"),
      status: "IN_PROGRESS",
    });

    expect(result.title).toBe("New Title");
    expect(result.description).toBe("New Description");
    expect(result.priority).toBe(2);
    expect(result.assigneeId).toBe("user-2");
    expect(result.status).toBe("IN_PROGRESS");

    expect(db.messagingTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        title: "New Title",
        description: "New Description",
        priority: 2,
        assigneeId: "user-2",
        dueDate: new Date("2026-06-15T00:00:00Z"),
        status: "IN_PROGRESS",
      },
    });
  });

  it("handles reopen-from-done status transition (clears completed metadata)", async () => {
    const originalDoneTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Done Task",
      status: "DONE",
      priority: 1,
      assigneeId: "user-1",
      completedAt: new Date(),
      completedBy: "user-owner",
      createdBy: "user-owner",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(originalDoneTask);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

    const expectedReopenedTask = {
      ...originalDoneTask,
      status: "OPEN",
      completedAt: null,
      completedBy: null,
    };
    (db.messagingTask.update as any).mockResolvedValue(expectedReopenedTask);

    const result = await updateTask({
      orgId: "org-1",
      taskId: "task-1",
      actorId: "user-1",
      conversationId: "conv-1",
      status: "OPEN",
    });

    expect(result.status).toBe("OPEN");
    expect(db.messagingTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        status: "OPEN",
        completedAt: null,
        completedBy: null,
      },
    });
  });

  it("handles mark-done status transition (adds completed metadata)", async () => {
    const originalOpenTask = {
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Open Task",
      status: "OPEN",
      priority: 1,
      assigneeId: "user-1",
      completedAt: null,
      completedBy: null,
      createdBy: "user-owner",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    (db.messagingTask.findUnique as any).mockResolvedValue(originalOpenTask);
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

    const expectedCompletedTask = {
      ...originalOpenTask,
      status: "DONE",
      completedAt: new Date(),
      completedBy: "user-1",
    };
    (db.messagingTask.update as any).mockResolvedValue(expectedCompletedTask);

    const result = await updateTask({
      orgId: "org-1",
      taskId: "task-1",
      actorId: "user-1",
      conversationId: "conv-1",
      status: "DONE",
    });

    expect(result.status).toBe("DONE");
    expect(db.messagingTask.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: {
        status: "DONE",
        completedAt: expect.any(Date),
        completedBy: "user-1",
        reminderAt: null,
      },
    });
  });

  it("rejects non-participant assignee", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue({
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Open Task",
      status: "OPEN",
    });
    (db.conversationParticipant.findFirst as any)
      .mockResolvedValueOnce(mockActiveParticipant()) // Actor check succeeds
      .mockResolvedValueOnce(null); // Assignee check fails
    (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());

    await expect(
      updateTask({
        orgId: "org-1",
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1",
        assigneeId: "user-non-participant",
      })
    ).rejects.toThrow(InvalidInputError);
  });

  it("throws NotFoundError on cross-conversation task mismatch", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue({
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-2", // different conversation!
      title: "Task in different conv",
    });

    await expect(
      updateTask({
        orgId: "org-1",
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1", // target route conversation
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError on task not found or cross-org boundary", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue(null);

    await expect(
      updateTask({
        orgId: "org-2", // different org
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1",
      })
    ).rejects.toThrow(NotFoundError);
  });

  it("rejects task updates on archived conversations", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue({
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Archived Conv Task",
    });
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.conversation.findUnique as any).mockResolvedValue(
      mockActiveConversation({ archivedAt: new Date() })
    );

    await expect(
      updateTask({
        orgId: "org-1",
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1",
        title: "Try to edit title",
      })
    ).rejects.toThrow("updateTask: conversation is archived");
  });

  it("rejects task updates on locked conversations", async () => {
    (db.messagingTask.findUnique as any).mockResolvedValue({
      id: "task-1",
      orgId: "org-1",
      conversationId: "conv-1",
      title: "Locked Conv Task",
    });
    (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
    (db.conversation.findUnique as any).mockResolvedValue(
      mockActiveConversation({ lockedAt: new Date() })
    );

    await expect(
      updateTask({
        orgId: "org-1",
        taskId: "task-1",
        actorId: "user-1",
        conversationId: "conv-1",
        title: "Try to edit title",
      })
    ).rejects.toThrow("updateTask: conversation is locked");
  });

  describe("createTask originatingMessageId validation", () => {
    it("throws InvalidInputError if originating message does not exist", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.conversationMessage.findUnique as any).mockResolvedValue(null);

      await expect(
        createTask({
          orgId: "org-1",
          conversationId: "conv-1",
          createdBy: "user-1",
          title: "Task with bad message id",
          originatingMessageId: "msg-bad",
        })
      ).rejects.toThrow("Originating message not found");
    });

    it("throws InvalidInputError if originating message belongs to a different conversation", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.conversationMessage.findUnique as any).mockResolvedValue({
        id: "msg-123",
        orgId: "org-1",
        conversationId: "conv-2",
      });

      await expect(
        createTask({
          orgId: "org-1",
          conversationId: "conv-1",
          createdBy: "user-1",
          title: "Task with cross-conversation message",
          originatingMessageId: "msg-123",
        })
      ).rejects.toThrow("Originating message must belong to the same conversation and organization");
    });

    it("throws InvalidInputError if originating message belongs to a different organization", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.conversationMessage.findUnique as any).mockResolvedValue({
        id: "msg-123",
        orgId: "org-2",
        conversationId: "conv-1",
      });

      await expect(
        createTask({
          orgId: "org-1",
          conversationId: "conv-1",
          createdBy: "user-1",
          title: "Task with cross-org message",
          originatingMessageId: "msg-123",
        })
      ).rejects.toThrow("Originating message must belong to the same conversation and organization");
    });

    it("successfully creates task with valid originatingMessageId", async () => {
      (db.conversationParticipant.findFirst as any).mockResolvedValue(mockActiveParticipant());
      (db.conversation.findUnique as any).mockResolvedValue(mockActiveConversation());
      (db.conversationMessage.findUnique as any).mockResolvedValue({
        id: "msg-123",
        orgId: "org-1",
        conversationId: "conv-1",
      });
      (db.messagingTask.create as any).mockResolvedValue({
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Task with valid message",
        status: "OPEN",
        priority: 0,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Task with valid message",
        originatingMessageId: "msg-123",
      });

      expect(result.title).toBe("Task with valid message");
    });
  });
});
