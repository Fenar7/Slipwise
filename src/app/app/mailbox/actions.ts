"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";

export interface AssignableMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * Fetch org members eligible for mailbox thread assignment.
 * Does not require settings_users permission — any authenticated org
 * member should be able to see teammates for assignment purposes.
 * Excludes deactivated members.
 */
export async function getMailboxAssignableMembers(): Promise<AssignableMember[]> {
  const { orgId } = await requireOrgContext();

  const members = await db.member.findMany({
    where: {
      organizationId: orgId,
      role: { not: "deactivated" },
    },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
  }));
}
