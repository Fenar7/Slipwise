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

export interface RecentContact {
  name: string | null;
  email: string;
}

export async function getMailboxRecentContacts(): Promise<RecentContact[]> {
  const { orgId } = await requireOrgContext();

  const messages = await db.mailboxMessage.findMany({
    where: { orgId },
    select: {
      from: true,
      to: true,
    },
    take: 50,
    orderBy: { sentAt: "desc" },
  });

  const contactsMap = new Map<string, string | null>();

  for (const msg of messages) {
    const fromVal = msg.from as { email?: string; displayName?: string | null } | null;
    if (fromVal?.email) {
      const email = fromVal.email.toLowerCase().trim();
      if (!contactsMap.has(email)) {
        contactsMap.set(email, fromVal.displayName || null);
      }
    }

    const toVal = msg.to as { email?: string; displayName?: string | null }[] | null;
    if (Array.isArray(toVal)) {
      for (const t of toVal) {
        if (t?.email) {
          const email = t.email.toLowerCase().trim();
          if (!contactsMap.has(email)) {
            contactsMap.set(email, t.displayName || null);
          }
        }
      }
    }
  }

  return Array.from(contactsMap.entries()).map(([email, name]) => ({
    name,
    email,
  }));
}
