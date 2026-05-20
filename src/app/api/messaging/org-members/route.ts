import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  requireMessagingApiContext,
  messagingApiResponse,
  handleMessagingApiError,
} from "../../_utils";

export const runtime = "nodejs";

/**
 * GET /api/messaging/org-members
 * List active members of the current org for conversation creation pickers.
 * Returns id, name, and avatar initials for each member.
 */
export async function GET(request: NextRequest) {
  try {
    const { orgId, userId } = await requireMessagingApiContext();
    const { searchParams } = request.nextUrl;
    const query = searchParams.get("q")?.trim().toLowerCase() ?? "";

    const members = await db.member.findMany({
      where: {
        organizationId: orgId,
        ...(query
          ? {
              user: {
                name: { contains: query, mode: "insensitive" },
              },
            }
          : {}),
      },
      select: {
        userId: true,
        role: true,
        user: {
          select: {
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: {
        user: {
          name: "asc",
        },
      },
      take: 50,
    });

    const results = members
      .filter((m) => m.userId !== userId)
      .map((m) => ({
        id: m.userId,
        name: m.user.name ?? "Unknown",
        avatarInitials: makeInitials(m.user.name ?? "Unknown"),
        orgRole: m.role,
      }));

    return messagingApiResponse({ members: results });
  } catch (error) {
    return handleMessagingApiError(error);
  }
}

function makeInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
