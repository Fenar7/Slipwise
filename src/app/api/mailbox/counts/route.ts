import "server-only";

import { NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import { listMailboxConnectionsForMember } from "@/lib/mailbox/visibility-service";
import { db } from "@/lib/db";

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const orgId = auth.ctx.orgId;
    const userId = auth.ctx.userId;
    const role = auth.ctx.role;

    const visibleResult = await listMailboxConnectionsForMember(orgId, userId, role);
    const connectionIds = visibleResult.accessible.map((conn) => conn.id);

    if (connectionIds.length === 0) {
      return NextResponse.json({
        smartViews: {
          "all-inboxes": 0,
          "unread": 0,
          "assigned-to-me": 0,
          "unassigned": 0,
          "flagged": 0,
          "waiting": 0,
        },
        folders: {},
      });
    }

    // 1. Resolve Spam and Trash threads across all connections
    const spamRows = await db.mailboxMessage.findMany({
      where: {
        orgId,
        thread: { mailboxConnectionId: { in: connectionIds } },
      },
      select: { threadId: true, providerMetadata: true },
    });

    const spamThreadIds = new Set(
      spamRows
        .filter((row) => {
          const metadata = row.providerMetadata;
          if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
          const labelIds = (metadata as Record<string, unknown>).labelIds;
          return Array.isArray(labelIds) && labelIds.includes("SPAM");
        })
        .map((row) => row.threadId)
    );

    const trashThreadIds = new Set(
      spamRows
        .filter((row) => {
          const metadata = row.providerMetadata;
          if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;
          const labelIds = (metadata as Record<string, unknown>).labelIds;
          return Array.isArray(labelIds) && labelIds.includes("TRASH");
        })
        .map((row) => row.threadId)
    );

    const spamThreadIdArray = Array.from(spamThreadIds);
    const trashThreadIdArray = Array.from(trashThreadIds);

    // 2. Count smart views
    const smartViewOpenUnreadWhere = {
      orgId,
      mailboxConnectionId: { in: connectionIds },
      unreadCount: { gt: 0 },
      status: { in: ["OPEN" as const, "PENDING" as const] },
      NOT: [
        { id: { in: spamThreadIdArray } },
        { id: { in: trashThreadIdArray } },
      ],
    };

    const [allInboxes, assignedToMe, unassigned, flagged, waiting] = await Promise.all([
      db.mailboxThread.count({
        where: smartViewOpenUnreadWhere,
      }),
      db.mailboxThread.count({
        where: {
          ...smartViewOpenUnreadWhere,
          assigneeId: userId,
        },
      }),
      db.mailboxThread.count({
        where: {
          ...smartViewOpenUnreadWhere,
          assigneeId: null,
        },
      }),
      db.mailboxThread.count({
        where: {
          ...smartViewOpenUnreadWhere,
          isFlagged: true,
        },
      }),
      db.mailboxThread.count({
        where: {
          orgId,
          mailboxConnectionId: { in: connectionIds },
          status: "PENDING" as const,
          NOT: [
            { id: { in: spamThreadIdArray } },
            { id: { in: trashThreadIdArray } },
          ],
        },
      }),
    ]);

    // 3. Count connection folders ( Inbox, Drafts, Starred, Spam, Trash )
    const folders: Record<
      string,
      {
        inbox: number;
        sent: number;
        drafts: number;
        starred: number;
        spam: number;
        trash: number;
      }
    > = {};

    const draftsCounts = await db.mailboxDraft.groupBy({
      by: ["mailboxConnectionId"],
      where: {
        orgId,
        mailboxConnectionId: { in: connectionIds },
      },
      _count: true,
    });

    const draftsCountMap = new Map(
      draftsCounts.map((group) => [group.mailboxConnectionId, group._count])
    );

    await Promise.all(
      connectionIds.map(async (connId) => {
        const [inboxCount, starredCount, spamCount, trashCount] = await Promise.all([
          db.mailboxThread.count({
            where: {
              orgId,
              mailboxConnectionId: connId,
              unreadCount: { gt: 0 },
              status: { in: ["OPEN" as const, "PENDING" as const] },
              NOT: [
                { id: { in: spamThreadIdArray } },
                { id: { in: trashThreadIdArray } },
              ],
            },
          }),
          db.mailboxThread.count({
            where: {
              orgId,
              mailboxConnectionId: connId,
              isFlagged: true,
              unreadCount: { gt: 0 },
              status: { in: ["OPEN" as const, "PENDING" as const] },
            },
          }),
          db.mailboxThread.count({
            where: {
              orgId,
              mailboxConnectionId: connId,
              unreadCount: { gt: 0 },
              id: { in: spamThreadIdArray },
            },
          }),
          db.mailboxThread.count({
            where: {
              orgId,
              mailboxConnectionId: connId,
              unreadCount: { gt: 0 },
              id: { in: trashThreadIdArray },
            },
          }),
        ]);

        folders[connId] = {
          inbox: inboxCount,
          sent: 0,
          drafts: draftsCountMap.get(connId) ?? 0,
          starred: starredCount,
          spam: spamCount,
          trash: trashCount,
        };
      })
    );

    return NextResponse.json({
      smartViews: {
        "all-inboxes": allInboxes,
        "unread": allInboxes,
        "assigned-to-me": assignedToMe,
        "unassigned": unassigned,
        "flagged": flagged,
        "waiting": waiting,
      },
      folders,
    });
  } catch (error) {
    console.error("[mailbox/counts] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
