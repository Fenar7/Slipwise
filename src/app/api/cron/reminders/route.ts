import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateCronSecret } from "@/lib/cron";
import { sendEmail } from "@/lib/email";
import { reminderEmailHtml } from "@/lib/email-templates/reminder-email";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";

export const dynamic = "force-dynamic";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export async function GET(request: Request) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jobId = crypto.randomUUID();
  const triggeredAt = new Date();

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const target3 = new Date(today);
    target3.setDate(target3.getDate() + 3);
    const target1 = new Date(today);
    target1.setDate(target1.getDate() + 1);

    const target3Str = target3.toISOString().split("T")[0];
    const target1Str = target1.toISOString().split("T")[0];

    const invoices = await db.invoice.findMany({
      where: {
        status: { in: ["ISSUED", "VIEWED", "DUE"] },
        dueDate: { in: [target3Str, target1Str] },
        archivedAt: null,
      },
      include: {
        customer: { select: { name: true, email: true } },
        publicTokens: { take: 1, orderBy: { createdAt: "desc" } },
        stateEvents: {
          where: { reason: { startsWith: "Reminder:" } },
          select: { createdAt: true },
        },
      },
    });

    // Filter out already-reminded invoices (reminded within the same day)
    const todayStr = today.toISOString().split("T")[0];
    const toRemind = invoices.filter((inv) => {
      const alreadyReminded = inv.stateEvents.some(
        (e) => e.createdAt.toISOString().split("T")[0] === todayStr
      );
      return !alreadyReminded;
    });

    let sentCount = 0;
    for (const inv of toRemind) {
      const email = inv.customer?.email;
      if (!email) continue;

      const dueDateIso = inv.dueDate ? formatIsoDate(inv.dueDate) : null;
      const daysUntilDue = dueDateIso === target1Str ? 1 : 3;
      const token = inv.publicTokens[0]?.token;
      const viewUrl = token
        ? `${process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app"}/invoice/${token}`
        : `${process.env.NEXT_PUBLIC_APP_URL || "https://app.slipwise.app"}/app/docs/invoices/${inv.id}`;

      try {
        await sendEmail({
          to: email,
          subject: `Reminder: Invoice ${inv.invoiceNumber || "N/A"} due in ${daysUntilDue} day${daysUntilDue > 1 ? "s" : ""}`,
          html: reminderEmailHtml({
            invoiceNumber: inv.invoiceNumber || "",
            customerName: inv.customer?.name || "",
            totalAmount: formatCurrency(toAccountingNumber(inv.totalAmount)),
            dueDate: dueDateIso ?? target3Str,
            daysUntilDue,
            viewUrl,
          }),
        });

        await db.invoiceStateEvent.create({
          data: {
            invoiceId: inv.id,
            fromStatus: inv.status,
            toStatus: inv.status,
            actorName: "System",
            reason: `Reminder: due in ${daysUntilDue} day${daysUntilDue > 1 ? "s" : ""}`,
          },
        });

        sentCount++;
      } catch {
        // Individual send failure — continue with next
      }
    }

    await db.jobLog.create({
      data: {
        jobName: "send-reminders",
        jobId,
        status: "completed",
        triggeredAt,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ success: true, remindersSent: sentCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db.jobLog.create({
      data: {
        jobName: "send-reminders",
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
