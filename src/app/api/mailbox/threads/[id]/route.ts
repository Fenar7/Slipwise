import { NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { getMailboxThreadDetail } from "@/lib/mailbox/thread-service";
import { rateLimitByOrg } from "@/lib/rate-limit";
import type { MailboxThreadDetailReadShape } from "@/lib/mailbox/read-shapes";

export interface ThreadDetailResponse {
  thread: MailboxThreadDetailReadShape | null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireIntegrationMemberRoute();

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error ?? "Unauthorized" },
      { status: auth.status ?? 401 },
    );
  }

  const { org, user, role } = auth;
  const threadId = (await params).id;

  if (!threadId || typeof threadId !== "string") {
    return NextResponse.json(
      { error: "Invalid thread ID" },
      { status: 400 },
    );
  }

  const limitResult = await rateLimitByOrg(org.id, {
    maxRequests: 120,
    window: "60 s",
  });

  if (!limitResult.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 },
    );
  }

  const thread = await getMailboxThreadDetail(
    org.id,
    user.id,
    role,
    threadId,
  );

  if (!thread) {
    return NextResponse.json(
      { error: "Thread not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ thread } satisfies ThreadDetailResponse);
}
