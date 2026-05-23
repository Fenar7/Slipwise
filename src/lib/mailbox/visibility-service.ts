import "server-only";

import { db } from "@/lib/db";

export async function listMailboxConnectionsForMember(orgId: string, _userId: string) {
  const rows = await db.mailboxConnection.findMany({
    where: { orgId, status: { not: "DISCONNECTED" } },
  });
  return {
    accessible: rows.map((r) => ({
      id: r.id,
      orgId: r.orgId,
      provider: r.provider,
      emailAddress: r.emailAddress,
      tokenRef: r.tokenRef,
      status: r.status,
    })),
  };
}
