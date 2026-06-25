import "server-only";

import { db } from "@/lib/db";

const BATCH_SIZE = 1000;

export async function runMailboxGarbageCollection(batchSize = BATCH_SIZE): Promise<void> {
  const disconnectedConnections = await db.mailboxConnection.findMany({
    where: { status: "DISCONNECTED" },
    take: 10,
    select: { id: true, orgId: true, emailAddress: true },
  });

  for (const connection of disconnectedConnections) {
    console.log(`[mailbox-gc] Starting garbage collection for connection ${connection.id} (${connection.emailAddress})`);
    
    let hasMore = true;
    let iteration = 0;
    const MAX_ITERATIONS = 50; // Keep cron short

    while (hasMore && iteration < MAX_ITERATIONS) {
      iteration++;
      let deletedCount = 0;

      // 1. Delete Search Documents
      const searchDocIds = await db.mailboxSearchDocument.findMany({
        where: { mailboxConnectionId: connection.id },
        select: { id: true },
        take: batchSize,
      });
      if (searchDocIds.length > 0) {
        await db.mailboxSearchDocument.deleteMany({
          where: { id: { in: searchDocIds.map((d) => d.id) } },
        });
        deletedCount += searchDocIds.length;
      }

      // 2. Delete Sync Runs
      const syncRunIds = await db.mailboxSyncRun.findMany({
        where: { mailboxConnectionId: connection.id },
        select: { id: true },
        take: batchSize,
      });
      if (syncRunIds.length > 0) {
        await db.mailboxSyncRun.deleteMany({
          where: { id: { in: syncRunIds.map((r) => r.id) } },
        });
        deletedCount += syncRunIds.length;
      }

      // 3. Delete Threads (Cascade deletes Messages)
      const threadIds = await db.mailboxThread.findMany({
        where: { mailboxConnectionId: connection.id },
        select: { id: true },
        take: batchSize,
      });
      if (threadIds.length > 0) {
        await db.mailboxThread.deleteMany({
          where: { id: { in: threadIds.map((t) => t.id) } },
        });
        deletedCount += threadIds.length;
      }

      // 4. Delete Drafts
      const draftIds = await db.mailboxDraft.findMany({
        where: { mailboxConnectionId: connection.id },
        select: { id: true },
        take: batchSize,
      });
      if (draftIds.length > 0) {
        await db.mailboxDraft.deleteMany({
          where: { id: { in: draftIds.map((d) => d.id) } },
        });
        deletedCount += draftIds.length;
      }

      if (deletedCount === 0) {
        hasMore = false;
      }
    }

    if (!hasMore) {
      console.log(`[mailbox-gc] Purged all child records. Hard-deleting connection ${connection.id}`);
      // Hard delete the connection now that all large child tables are purged
      await db.mailboxConnection.delete({
        where: { id: connection.id },
      });
    } else {
      console.log(`[mailbox-gc] Connection ${connection.id} partially purged. Will resume next run.`);
    }
  }
}
