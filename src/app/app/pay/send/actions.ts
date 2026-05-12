"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";
import { sendEmail } from "@/lib/email";
import { invoiceEmailHtml } from "@/lib/email-templates/invoice-email";
import { revalidatePath } from "next/cache";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export async function sendInvoiceEmail(
  invoiceId: string,
  recipientEmail: string
): Promise<ActionResult<{ sendId: string }>> {
  try {
    const { orgId } = await requireOrgContext();

    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      include: {
        customer: { select: { name: true } },
        publicTokens: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { id: true, token: true },
        },
      },
    });

    if (!invoice) {
      return { success: false, error: "Invoice not found" };
    }

    // Get or create public token
    let publicToken = invoice.publicTokens[0];
    if (!publicToken) {
      publicToken = await db.publicInvoiceToken.create({
        data: {
          invoiceId: invoice.id,
          orgId,
        },
        select: { id: true, token: true },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const viewUrl = `${baseUrl}/invoice/${publicToken.token}`;

    const html = invoiceEmailHtml({
      invoiceNumber: invoice.invoiceNumber ?? "",
      customerName: invoice.customer?.name || recipientEmail,
      totalAmount: formatCurrency(toAccountingNumber(invoice.totalAmount)),
      dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : "",
      viewUrl,
    });

    await sendEmail({
      to: recipientEmail,
      subject: `Invoice ${invoice.invoiceNumber} from Slipwise`,
      html,
    });

    const send = await db.scheduledSend.create({
      data: {
        invoiceId: invoice.id,
        orgId,
        recipientEmail,
        scheduledAt: new Date(),
        status: "SENT",
        sentAt: new Date(),
      },
    });

    revalidatePath("/app/pay/send");
    return { success: true, data: { sendId: send.id } };
  } catch (error) {
    console.error("sendInvoiceEmail error:", error);

    // Log a failed send if possible
    try {
      const { orgId } = await requireOrgContext();
      await db.scheduledSend.create({
        data: {
          invoiceId: invoiceId,
          orgId,
          recipientEmail,
          scheduledAt: new Date(),
          status: "FAILED",
          failReason: error instanceof Error ? error.message : "Unknown error",
        },
      });
    } catch {
      // Ignore logging errors
    }

    return { success: false, error: "Failed to send email" };
  }
}

export async function getInvoiceSendLog(
  invoiceId: string
): Promise<
  ActionResult<
    Array<{
      id: string;
      recipientEmail: string;
      status: string;
      sentAt: string | null;
      failReason: string | null;
      createdAt: string;
    }>
  >
> {
  try {
    const { orgId } = await requireOrgContext();

    const sends = await db.scheduledSend.findMany({
      where: { invoiceId, orgId },
      orderBy: { createdAt: "desc" },
    });

    return {
      success: true,
      data: sends.map((s) => ({
        id: s.id,
        recipientEmail: s.recipientEmail,
        status: s.status,
        sentAt: s.sentAt?.toISOString() ?? null,
        failReason: s.failReason,
        createdAt: s.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("getInvoiceSendLog error:", error);
    return { success: false, error: "Failed to load send log" };
  }
}
