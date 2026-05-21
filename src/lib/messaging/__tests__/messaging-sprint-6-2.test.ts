import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    conversationParticipant: {
      findFirst: vi.fn(),
    },
    messagingTask: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
  return { db };
});

import { db } from "@/lib/db";
import { createTask, updateTaskStatus, assignTask } from "../task-service";
import { ConversationAccessError } from "../errors";

describe("Sprint 6.2 Service layer — Tasks Work Coordination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
        .mockResolvedValueOnce({ id: "membership-1" }) // Creator check
        .mockResolvedValueOnce(null); // Assignee check

      const promise = createTask({
        orgId: "org-1",
        conversationId: "conv-1",
        createdBy: "user-1",
        title: "Test Task",
        assigneeId: "user-assignee",
      });

      await expect(promise).rejects.toThrow("Assignee must be an active participant");
      await expect(promise).rejects.toThrow(expect.objectContaining({ name: "InvalidInputError" }));
    });

    it("successfully creates task when creator and assignee are valid", async () => {
      (db.conversationParticipant.findFirst as any)
        .mockResolvedValueOnce({ id: "membership-1" }) // Creator check
        .mockResolvedValueOnce({ id: "membership-assignee" }); // Assignee check

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
      });

      await expect(promise).rejects.toThrow("Task not found");
      await expect(promise).rejects.toThrow(expect.objectContaining({ name: "NotFoundError" }));
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
      };

      (db.messagingTask.findUnique as any).mockResolvedValue(mockTask);
      (db.conversationParticipant.findFirst as any).mockResolvedValue({ id: "membership-1" });
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
      (db.conversationParticipant.findFirst as any).mockResolvedValue({ id: "membership-1" });
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
        .mockResolvedValueOnce({ id: "membership-actor" }) // Actor check
        .mockResolvedValueOnce({ id: "membership-assignee" }); // Assignee check
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
      });

      expect(result.assigneeId).toBe("user-assignee");
      expect(db.messagingTask.update).toHaveBeenCalledWith({
        where: { id: "task-1" },
        data: { assigneeId: "user-assignee" },
      });
    });
  });
});
