import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateCronSecret } from "@/lib/cron";
import { dispatchDueMeetingReminders } from "@/lib/messaging/meeting-reminder-service";

export const dynamic = "force-dynamic";

/**
 * Cron route for messaging meeting reminder dispatch.
 *
 * Protected by CRON_SECRET — not accessible to normal users.
 * Runs the idempotent reminder sweep and returns a structured execution summary.
 */
export async function GET(request: Request) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = crypto.randomUUID();
  const triggeredAt = new Date();

  try {
    const result = await dispatchDueMeetingReminders();

    await db.jobLog.create({
      data: {
        jobName: "messaging-meeting-reminders",
        jobId,
        status: "completed",
        triggeredAt,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.jobLog.create({
      data: {
        jobName: "messaging-meeting-reminders",
        jobId,
        status: "failed",
        triggeredAt,
        completedAt: new Date(),
        error: message,
      },
    }).catch(() => {});

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
