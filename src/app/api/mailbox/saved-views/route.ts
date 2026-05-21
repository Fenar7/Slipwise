import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import {
  listMailboxSavedViews,
  createMailboxSavedView,
} from "@/lib/mailbox/saved-view-service";
import type { ActiveFilter } from "@/app/app/mailbox/types";

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const views = await listMailboxSavedViews(auth.ctx.orgId, auth.ctx.userId);
    return NextResponse.json({ views });
  } catch (error) {
    console.error("[mailbox/saved-views] GET failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

interface CreateSavedViewBody {
  label: string;
  filters?: ActiveFilter[];
  searchQuery?: string;
  smartViewId?: string | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = (await request.json()) as CreateSavedViewBody;
    const label = body.label?.trim();
    if (!label || label.length === 0) {
      return NextResponse.json({ error: "Label is required" }, { status: 400 });
    }
    if (label.length > 120) {
      return NextResponse.json({ error: "Label too long (max 120)" }, { status: 400 });
    }

    const view = await createMailboxSavedView({
      orgId: auth.ctx.orgId,
      createdBy: auth.ctx.userId,
      label,
      filters: body.filters ?? [],
      searchQuery: body.searchQuery ?? "",
      smartViewId: body.smartViewId ?? null,
    });

    return NextResponse.json({ view }, { status: 201 });
  } catch (error) {
    console.error("[mailbox/saved-views] POST failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
