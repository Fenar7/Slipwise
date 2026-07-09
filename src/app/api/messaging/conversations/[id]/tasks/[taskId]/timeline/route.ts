import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireMessagingApiContext, handleMessagingApiError } from "@/app/api/messaging/_utils";
import { getTaskActivityTimeline } from "@/lib/messaging/read-models";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { id: conversationId, taskId } = await params;
    const { orgId, userId } = await requireMessagingApiContext();

    const conversation = await db.conversation.findFirst({
      where: { id: conversationId, orgId },
      select: { id: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await db.messagingTask.findUnique({
      where: { id: taskId },
      select: { orgId: true, conversationId: true },
    });

    if (!task || task.orgId !== orgId || task.conversationId !== conversationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const timeline = await getTaskActivityTimeline(orgId, taskId, userId);

    if (timeline === null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const serialized = timeline.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    }));

    return NextResponse.json({ timeline: serialized });
  } catch (err) {
    return handleMessagingApiError(err);
  }
}
