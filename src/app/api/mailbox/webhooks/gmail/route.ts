import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runMailboxSync } from "@/lib/mailbox/mailbox-sync-service";

export const dynamic = "force-dynamic";

interface GmailPushEnvelope {
  emailAddress?: string;
  historyId?: string;
}

interface PubSubPushBody {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

function resolveMailboxWebhookSecret(): string | null {
  return process.env.MAILBOX_WEBHOOK_SECRET ?? process.env.CRON_SECRET ?? null;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = resolveMailboxWebhookSecret();
  if (!secret) return false;

  const bearer = request.headers.get("authorization");
  if (bearer?.replace(/^Bearer\s+/i, "") === secret) {
    return true;
  }

  const token = request.nextUrl.searchParams.get("token");
  return token === secret;
}

function decodePubSubData(data: string): GmailPushEnvelope | null {
  try {
    const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as GmailPushEnvelope;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!resolveMailboxWebhookSecret()) {
    return NextResponse.json({ error: "Mailbox webhook secret not configured" }, { status: 500 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PubSubPushBody;
  try {
    body = (await request.json()) as PubSubPushBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data = body.message?.data;
  if (!data) {
    return NextResponse.json({ error: "Missing Pub/Sub message data" }, { status: 400 });
  }

  const notification = decodePubSubData(data);
  if (!notification?.emailAddress) {
    return NextResponse.json({ error: "Invalid Gmail notification payload" }, { status: 400 });
  }

  const matchingConnections = await db.mailboxConnection.findMany({
    where: {
      provider: "GMAIL",
      emailAddress: notification.emailAddress,
      tokenRef: { not: null },
      disabledAt: null,
      status: { in: ["ACTIVE", "DEGRADED"] },
    },
    select: {
      id: true,
      orgId: true,
      connectedBy: true,
    },
  });

  if (matchingConnections.length === 0) {
    return NextResponse.json({
      received: true,
      emailAddress: notification.emailAddress,
      matchedConnections: 0,
      triggered: 0,
      skipped: 0,
      failures: [],
    });
  }

  let triggered = 0;
  let skipped = 0;
  const failures: Array<{ connectionId: string; message: string }> = [];

  for (const connection of matchingConnections) {
    try {
      const result = await runMailboxSync({
        orgId: connection.orgId,
        connectionId: connection.id,
        actorId: connection.connectedBy,
        triggerSource: "WEBHOOK",
      });
      if (result.success) {
        triggered += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      failures.push({
        connectionId: connection.id,
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    received: true,
    emailAddress: notification.emailAddress,
    historyId: notification.historyId ?? null,
    matchedConnections: matchingConnections.length,
    triggered,
    skipped,
    failures,
  });
}
