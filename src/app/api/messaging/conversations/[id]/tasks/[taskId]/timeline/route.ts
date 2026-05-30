import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { getTaskActivityTimeline } from "@/lib/messaging/read-models";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { id: conversationId, taskId } = await params;
    const { orgId, userId } = await requireOrgContext();

    // Validate the conversation exists in this org
    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: { id: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const timeline = await getTaskActivityTimeline(orgId, taskId, userId);

    if (timeline === null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Serialize dates to ISO strings for the API boundary
    const serialized = timeline.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    }));

    return NextResponse.json({ timeline: serialized });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
