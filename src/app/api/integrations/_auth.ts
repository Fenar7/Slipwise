import { NextResponse } from "next/server";
import { getOrgContext, hasRole, type OrgContext } from "@/lib/auth";

type IntegrationAdminRouteAuthResult =
  | { ok: true; ctx: OrgContext }
  | { ok: false; response: NextResponse };

type IntegrationMemberRouteAuthResult =
  | { ok: true; ctx: OrgContext }
  | { ok: false; response: NextResponse };

export async function requireIntegrationAdminRoute(): Promise<IntegrationAdminRouteAuthResult> {
  const ctx = await getOrgContext();
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!hasRole(ctx.role, "admin")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, ctx };
}

export async function requireIntegrationMemberRoute(): Promise<IntegrationMemberRouteAuthResult> {
  const ctx = await getOrgContext();
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, ctx };
}
