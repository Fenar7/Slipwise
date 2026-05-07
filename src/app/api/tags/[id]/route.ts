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
  const body = await request.json();
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
  }
  if (body.archive !== undefined) {
    const result = body.archive ? await archiveTag(id) : await unarchiveTag(id);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ tag: result.data });
  }
  const result = await renameTag(id, { name: body.name });
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ tag: result.data });
}
