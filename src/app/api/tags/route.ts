import { NextRequest, NextResponse } from "next/server";
import { listTags, createTag } from "@/lib/tags/tag-service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeArchived = searchParams.get("includeArchived") === "true";
    const result = await listTags({ includeArchived });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ tags: result.data });
  } catch (error) {
    return NextResponse.json({ error: "Failed to list tags" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
    }
    const result = await createTag({
      name: body.name,
      color: body.color,
      description: body.description,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ tag: result.data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 });
  }
}
