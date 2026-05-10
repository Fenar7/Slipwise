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

/**
 * Auth guard for routes that any authenticated org member can access.
 * Returns the org context. Does NOT enforce admin role.
 * Use for mailbox visibility routes where access is policy-controlled
 * at the service layer, not the route layer.
 */
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
