import "server-only";

import { db } from "@/lib/db";
import type { MessagingTaskRecord } from "./domain-types";
import { participantOrgSafeWhere } from "./org-safe-helpers";
import { toTaskRecord } from "./mappers";

export async function listTasksForConversation(
  orgId: string,
  conversationId: string,
  userId: string,
): Promise<MessagingTaskRecord[]> {
  const membership = await db.conversationParticipant.findFirst({
    where: {
      ...participantOrgSafeWhere(orgId, conversationId, userId),
      leftAt: null,
    },
  });

  if (!membership) {
    throw new Error("listTasksForConversation: active participant access required");
  }

  const rows = await db.messagingTask.findMany({
    where: { orgId, conversationId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });

  return rows.map(toTaskRecord);
}
