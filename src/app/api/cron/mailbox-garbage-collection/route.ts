import { NextResponse } from "next/server";
import { validateCronSecret } from "@/lib/cron";
import { runMailboxGarbageCollection } from "@/lib/mailbox/mailbox-gc-service";

export async function GET(request: Request) {
  const auth = validateCronSecret(request);
  if (!auth.ok) {
    return auth.response;
  }

  try {
    await runMailboxGarbageCollection();
    return NextResponse.json({ success: true, message: "Garbage collection completed" }, { status: 200 });
  } catch (error) {
    console.error("[cron/mailbox-gc] Failed to run garbage collection:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
