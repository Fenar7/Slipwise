import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const db = {
    conversationParticipant: {
      findFirst: vi.fn(),
    },
    messagingTask: {
      findMany: vi.fn(),
    },
  };
  return { db };
});

import { db } from "@/lib/db";
import { listTasksForConversation } from "../task-service";
import { ConversationAccessError } from "../errors";
import { safeRead, MessagingNotFoundError } from "@/app/api/messaging/_utils";

describe("Sprint 6.1 — structured access error signaling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listTasksForConversation throws ConversationAccessError when participant membership is absent", async () => {
    (db.conversationParticipant.findFirst as any).mockResolvedValue(null);

    await expect(
      listTasksForConversation("org-1", "conv-1", "user-1")
    ).rejects.toThrow(ConversationAccessError);

    expect(db.conversationParticipant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org-1",
          conversationId: "conv-1",
          userId: "user-1",
          leftAt: null,
        }),
      })
    );
  });

  it("listTasksForConversation returns tasks when participant membership is active", async () => {
    (db.conversationParticipant.findFirst as any).mockResolvedValue({
      id: "membership-1",
      orgId: "org-1",
      conversationId: "conv-1",
      userId: "user-1",
    });

    const mockTasks = [
      {
        id: "task-1",
        orgId: "org-1",
        conversationId: "conv-1",
        title: "Task 1",
        status: "OPEN",
        priority: "medium",
        dueDate: null,
        assigneeId: null,
        createdBy: "user-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    (db.messagingTask.findMany as any).mockResolvedValue(mockTasks);

    const result = await listTasksForConversation("org-1", "conv-1", "user-1");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Task 1");
    expect(db.messagingTask.findMany).toHaveBeenCalled();
  });

  it("safeRead intercepts ConversationAccessError and converts it to MessagingNotFoundError", async () => {
    const errorPromise = Promise.reject(new ConversationAccessError("Access denied"));

    await expect(safeRead(errorPromise)).rejects.toThrow(MessagingNotFoundError);
    await expect(safeRead(errorPromise)).rejects.toThrow("Conversation not found or access denied.");
  });
});
