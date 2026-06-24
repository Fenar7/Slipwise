import { type NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { listMeetingAttendees } from "@/lib/messaging/rsvp-service";
import { ConversationAccessError, NotFoundError } from "@/lib/messaging/errors";

/**
 * GET /api/messaging/meetings/[meetingId]/attendees
 * Return attendee RSVP status list for organizer view.
 * Caller must be an active participant in the meeting's conversation.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;

  const auth = await getAuthContext(req);
  if (!auth.isAuthenticated || !auth.orgId || !auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const attendees = await listMeetingAttendees(auth.orgId, meetingId, auth.userId);

    return NextResponse.json({
      meetingId,
      attendees: attendees.map((a) => ({
        userId: a.userId,
        rsvpStatus: a.rsvpStatus,
        respondedAt: a.respondedAt?.toISOString() ?? null,
        // providerStatus and providerAttendeeId are internal — omitted from response.
      })),
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    if (err instanceof ConversationAccessError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    console.error("[attendees route]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
