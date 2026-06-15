import { NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg } from "@/lib/rate-limit";
import { resolveMailboxThreadIdFromProviderRef } from "@/lib/mailbox/thread-service";

interface OpenThreadRequestBody {
  mailboxConnectionId?: string;
  providerThreadId?: string;
}

export async function POST(request: Request) {
  const auth = await requireIntegrationMemberRoute();

  if (!auth.ok) {
    return auth.response;
  }

  const { orgId, userId, role } = auth.ctx;
  const body = (await request.json().catch(() => null)) as OpenThreadRequestBody | null;
  const mailboxConnectionId = body?.mailboxConnectionId?.trim();
  const providerThreadId = body?.providerThreadId?.trim();

  if (!mailboxConnectionId || !providerThreadId) {
    return NextResponse.json(
      { error: "mailboxConnectionId and providerThreadId are required" },
      { status: 400 },
    );
  }

  const limitResult = await rateLimitByOrg(orgId, {
    maxRequests: 60,
    window: "60 s",
  });

  if (!limitResult.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const threadId = await resolveMailboxThreadIdFromProviderRef({
    orgId,
    userId,
    role,
    mailboxConnectionId,
    providerThreadId,
  });

  if (!threadId) {
    return NextResponse.json(
      { error: "Thread could not be resolved" },
      { status: 404 },
    );
  }

  return NextResponse.json({ threadId });
}
