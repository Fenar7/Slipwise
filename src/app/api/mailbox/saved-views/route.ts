import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { requireIntegrationMemberRoute } from "@/app/api/integrations/_auth";
import { rateLimitByOrg, RATE_LIMITS } from "@/lib/rate-limit";
import {
  listMailboxSavedViews,
  createMailboxSavedView,
} from "@/lib/mailbox/saved-view-service";
import {
  ACTIVE_FILTER_FIELDS,
  SUPPORTED_SAVED_VIEW_SMART_VIEW_IDS,
} from "@/app/app/mailbox/types";
import type { ActiveFilter, SupportedSavedViewSmartViewId } from "@/app/app/mailbox/types";

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
  smartViewId?: SupportedSavedViewSmartViewId | null;
}

const ACTIVE_FILTER_FIELD_SET = new Set<string>(ACTIVE_FILTER_FIELDS);
const SUPPORTED_SMART_VIEW_ID_SET = new Set<string>(SUPPORTED_SAVED_VIEW_SMART_VIEW_IDS);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateCreateSavedViewBody(body: unknown):
  | {
      ok: true;
      value: {
        label: string;
        filters: ActiveFilter[];
        searchQuery: string;
        smartViewId: SupportedSavedViewSmartViewId | null;
      };
    }
  | { ok: false; error: string; status: number } {
  if (!isObject(body)) {
    return { ok: false, error: "Invalid request body", status: 400 };
  }

  const rawLabel = body.label;
  if (typeof rawLabel !== "string") {
    return { ok: false, error: "Label is required", status: 400 };
  }

  const label = rawLabel.trim();
  if (label.length === 0) {
    return { ok: false, error: "Label is required", status: 400 };
  }

  if (label.length > 120) {
    return { ok: false, error: "Label too long (max 120)", status: 400 };
  }

  const rawSearchQuery = body.searchQuery;
  if (rawSearchQuery !== undefined && typeof rawSearchQuery !== "string") {
    return { ok: false, error: "Search query must be a string", status: 400 };
  }

  const rawFilters = body.filters ?? [];
  if (!Array.isArray(rawFilters)) {
    return { ok: false, error: "Filters must be an array", status: 400 };
  }

  const filters: ActiveFilter[] = [];
  for (const filter of rawFilters) {
    if (!isObject(filter)) {
      return { ok: false, error: "Each filter must be an object", status: 400 };
    }

    const field = filter.field;
    const value = filter.value;
    const filterLabel = filter.label;

    if (typeof field !== "string" || !ACTIVE_FILTER_FIELD_SET.has(field)) {
      return { ok: false, error: "Filter field is invalid", status: 400 };
    }

    if (typeof value !== "string") {
      return { ok: false, error: "Filter value must be a string", status: 400 };
    }

    if (typeof filterLabel !== "string") {
      return { ok: false, error: "Filter label must be a string", status: 400 };
    }

    filters.push({
      field: field as ActiveFilter["field"],
      value,
      label: filterLabel,
    });
  }

  const rawSmartViewId = body.smartViewId ?? null;
  if (rawSmartViewId !== null) {
    if (typeof rawSmartViewId !== "string" || !SUPPORTED_SMART_VIEW_ID_SET.has(rawSmartViewId)) {
      return { ok: false, error: "Smart view is invalid", status: 400 };
    }
  }

  return {
    ok: true,
    value: {
      label,
      filters,
      searchQuery: rawSearchQuery ?? "",
      smartViewId: rawSmartViewId as SupportedSavedViewSmartViewId | null,
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await requireIntegrationMemberRoute();
    if (!auth.ok) return auth.response;

    const rl = await rateLimitByOrg(auth.ctx.orgId, RATE_LIMITS.api);
    if (!rl.success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    let body: CreateSavedViewBody;
    try {
      body = (await request.json()) as CreateSavedViewBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const validation = validateCreateSavedViewBody(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const view = await createMailboxSavedView({
      orgId: auth.ctx.orgId,
      createdBy: auth.ctx.userId,
      label: validation.value.label,
      filters: validation.value.filters,
      searchQuery: validation.value.searchQuery,
      smartViewId: validation.value.smartViewId,
    });

    return NextResponse.json({ view }, { status: 201 });
  } catch (error) {
    console.error("[mailbox/saved-views] POST failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
