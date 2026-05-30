import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getTaskHealthDiagnostics } from "@/lib/messaging/read-models";

export async function GET(_request: NextRequest) {
  try {
    const { orgId, userId } = await requireRole("admin");

    const diagnostics = await getTaskHealthDiagnostics(orgId, userId);

    if (diagnostics === null) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ diagnostics });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
