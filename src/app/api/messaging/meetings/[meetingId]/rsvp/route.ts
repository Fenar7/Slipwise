import { type NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { updateRsvp } from "@/lib/messaging/rsvp-service";
import { ConversationAccessError, InvalidInputError, NotFoundError } from "@/lib/messaging/errors";
import type { MeetingRsvpStatus } from "@/lib/messaging/domain-types";

const VALID_RSVP_STATUSES: MeetingRsvpStatus[] = ["ACCEPTED", "TENTATIVE", "DECLINED"];

function isValidRsvpStatus(value: unknown): value is MeetingRsvpStatus {
  return VALID_RSVP_STATUSES.includes(value as MeetingRsvpStatus);
}

/**
 * POST /api/messaging/meetings/[meetingId]/rsvp
 * Update the authenticated user's RSVP status for a meeting.
 *
 * Body: { rsvpStatus: "ACCEPTED" | "TENTATIVE" | "DECLINED" }
 *
 * Security: org-scoped, conversation-membership gated, archived/locked enforced.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const { meetingId } = await params;

  const auth = await getAuthContext(req);
  if (!auth.isAuthenticated || !auth.orgId || !auth.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { rsvpStatus } = body as Record<string, unknown>;

  if (!isValidRsvpStatus(rsvpStatus)) {
    return NextResponse.json(
      { error: "rsvpStatus must be ACCEPTED, TENTATIVE, or DECLINED" },
      { status: 400 },
    );
  }

  try {
    const attendee = await updateRsvp({
      orgId: auth.orgId,
      meetingId,
      userId: auth.userId,
      rsvpStatus,
    });

    return NextResponse.json({
      meetingId: attendee.meetingId,
      userId: attendee.userId,
      rsvpStatus: attendee.rsvpStatus,
      respondedAt: attendee.respondedAt?.toISOString() ?? null,
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    if (err instanceof ConversationAccessError) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (err instanceof InvalidInputError) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    console.error("[rsvp route]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
