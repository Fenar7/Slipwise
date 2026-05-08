import { NextRequest, NextResponse } from "next/server";
import { getTag, renameTag, archiveTag, unarchiveTag } from "@/lib/tags/tag-service";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getTag(id);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json({ tag: result.data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const hasArchive = typeof body.archive === "boolean";
  const hasName = typeof body.name === "string" && body.name.trim().length > 0;

  // Archive/unarchive — does not require name
  if (hasArchive) {
    const result = body.archive ? await archiveTag(id) : await unarchiveTag(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ tag: result.data });
  }

  // Rename — requires name
  if (!hasName) {
    return NextResponse.json(
      { error: "Either 'name' (for rename) or 'archive' (boolean) is required" },
      { status: 400 }
    );
  }

  const result = await renameTag(id, { name: body.name as string });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ tag: result.data });
}
