import { NextResponse } from "next/server";
import { buildGmailAuthUrl } from "@/lib/mailbox/gmail-provider";

export async function GET() {
  try {
    const url = buildGmailAuthUrl("test-state");
    return NextResponse.json({ ok: true, url: url.substring(0, 80) + "..." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message });
  }
}
