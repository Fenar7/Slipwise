import { type NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import {
  getImminentMeetingAlert,
  listImminentMeetings,
  assertOrgMembership,
} from "@/lib/messaging/imminent-meeting-service";
import { ConversationAccessError } from "@/lib/messaging/errors";

/**
 * GET /api/messaging/meetings/imminent-alert
 *
 * Returns the authoritative imminent-meeting alert for the authenticated user.
 * This route is called by the global app shell (dashboard, top bar) — not only messaging.
 *
 * Query params:
 *   ?list=true  — return all imminent meetings instead of just the primary alert.
 *   ?process=true — also trigger pending reminder dispatch (bounded, idempotent).
 *
 * Security:
 * - User must be authenticated and belong to the org.
 * - Only meetings in conversations the user actively participates in are returned.
 * - join URLs are only surfaced to users with non-DECLINED RSVP.
 * - Unauthorized users cannot infer meeting existence through this endpoint.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);

  if (!auth.isAuthenticated || !auth.orgId || !auth.userId) {
    return NextResponse.json({ alert: null }, { status: 401 });
  }

  try {
    await assertOrgMembership(auth.orgId, auth.userId);
  } catch {
    // Non-members receive a null alert — not a 403 — to avoid leaking org membership state.
    return NextResponse.json({ alert: null });
  }

  const url = new URL(req.url);
  const returnList = url.searchParams.get("list") === "true";

  const now = new Date();

  try {
    if (returnList) {
      const meetings = await listImminentMeetings(auth.orgId, auth.userId, now);
      return NextResponse.json({ alerts: meetings });
    }

    const alert = await getImminentMeetingAlert(auth.orgId, auth.userId, now);
    return NextResponse.json({ alert });
  } catch (err) {
    if (err instanceof ConversationAccessError) {
      return NextResponse.json({ alert: null }, { status: 403 });
    }
    console.error("[imminent-alert route]", err);
    return NextResponse.json({ alert: null }, { status: 500 });
  }
}
