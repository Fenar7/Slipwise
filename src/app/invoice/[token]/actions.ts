"use server";

import { db } from "@/lib/db";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";
import { resolvePublicInvoicePaymentProofEligibility } from "./payment-proof-eligibility";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function getPublicInvoice(token: string) {
  try {
    const tokenRecord = await db.publicInvoiceToken.findUnique({
      where: { token },
      include: {
        invoice: {
          include: {
            lineItems: { orderBy: { sortOrder: "asc" } },
            customer: true,
            organization: true,
            proofs: {
              orderBy: { createdAt: "desc" },
              take: 5,
            },
          },
        },
      },
    });

    if (!tokenRecord) {
      return { success: false as const, error: "Invoice not found or link has expired" };
    }

    if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
      return { success: false as const, error: "This invoice link has expired" };
    }

    const invoice = tokenRecord.invoice;
    const formData = invoice.formData as Record<string, unknown>;
    const paymentProof = await resolvePublicInvoicePaymentProofEligibility({
      id: invoice.id,
      status: invoice.status,
      totalAmount: toAccountingNumber(invoice.totalAmount),
      amountPaid: toAccountingNumber(invoice.amountPaid),
      remainingAmount: toAccountingNumber(invoice.remainingAmount),
    });

    return {
      success: true as const,
      data: {
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber ?? "",
          invoiceDate: formatIsoDate(invoice.invoiceDate),
          dueDate: invoice.dueDate ? formatIsoDate(invoice.dueDate) : null,
          status: paymentProof.status,
          totalAmount: paymentProof.totalAmount,
          amountPaid: paymentProof.amountPaid,
          remainingAmount: paymentProof.remainingAmount,
          paymentPromiseDate: invoice.paymentPromiseDate
            ? formatIsoDate(invoice.paymentPromiseDate)
            : null,
          notes: invoice.notes,
          paidAt: invoice.paidAt?.toISOString() ?? null,
          razorpayPaymentLinkUrl: invoice.razorpayPaymentLinkUrl ?? null,
          paymentLinkStatus: invoice.paymentLinkStatus ?? null,
          paymentLinkExpiresAt: invoice.paymentLinkExpiresAt?.toISOString() ?? null,
          formData,
          lineItems: invoice.lineItems.map((li) => ({
            id: li.id,
            description: li.description,
            quantity: li.quantity,
            unitPrice: li.unitPrice,
            taxRate: li.taxRate,
            discount: li.discount,
            amount: toAccountingNumber(li.amount),
          })),
          customer: invoice.customer
            ? {
                name: invoice.customer.name,
                email: invoice.customer.email,
                phone: invoice.customer.phone,
              }
            : null,
          organization: {
            name: invoice.organization.name,
          },
          proofs: invoice.proofs.map((p) => ({
            id: p.id,
            amount: toAccountingNumber(p.amount),
            reviewStatus: p.reviewStatus,
            createdAt: p.createdAt.toISOString(),
          })),
          paymentProof,
        },
        tokenId: tokenRecord.id,
      },
    };
  } catch (error) {
    console.error("getPublicInvoice error:", error);
    return { success: false as const, error: "Failed to load invoice" };
  }
}

export async function markAsViewed(token: string): Promise<ActionResult<void>> {
  try {
    const tokenRecord = await db.publicInvoiceToken.findUnique({
      where: { token },
      include: { invoice: { select: { id: true, status: true } } },
    });

    if (!tokenRecord) {
      return { success: false, error: "Token not found" };
    }

    await db.publicInvoiceToken.update({
      where: { id: tokenRecord.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    if (tokenRecord.invoice.status === "ISSUED") {
      await db.$transaction([
        db.invoice.update({
          where: { id: tokenRecord.invoice.id },
          data: { status: "VIEWED" },
        }),
        db.invoiceStateEvent.create({
          data: {
            invoiceId: tokenRecord.invoice.id,
            fromStatus: "ISSUED",
            toStatus: "VIEWED",
            reason: "Invoice viewed via public link",
          },
        }),
      ]);
    }

    return { success: true, data: undefined };
  } catch (error) {
    console.error("markAsViewed error:", error);
    return { success: false, error: "Failed to mark as viewed" };
  }
}
export async function uploadPaymentProof(
  token: string,
  data: {
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    note?: string;
    fileUrl: string;
    fileName: string;
    plannedNextPaymentDate?: string;
  }
): Promise<ActionResult<{ proofId: string }>> {
  try {
    const tokenRecord = await db.publicInvoiceToken.findUnique({
      where: { token },
      include: {
        invoice: {
          select: {
            id: true,
            totalAmount: true,
            remainingAmount: true,
            status: true,
            organizationId: true,
          },
        },
      },
    });

    if (!tokenRecord) {
      return { success: false, error: "Invalid token" };
    }

    const invoice = tokenRecord.invoice;
    const paymentProof = await resolvePublicInvoicePaymentProofEligibility({
      id: invoice.id,
      status: invoice.status,
      totalAmount: toAccountingNumber(invoice.totalAmount),
      amountPaid: toAccountingNumber(invoice.amountPaid),
      remainingAmount: toAccountingNumber(invoice.remainingAmount),
    });

    if (!paymentProof.canUpload) {
      return { success: false, error: paymentProof.blockedReason ?? "This invoice no longer accepts payment proofs." };
    }

    if (data.amount <= 0) {
      return { success: false, error: "Amount must be greater than zero" };
    }

    if (data.amount > paymentProof.remainingAmount + 0.01) {
      return {
        success: false,
        error: `Amount exceeds remaining balance of ${paymentProof.remainingAmount.toFixed(2)}`,
      };
    }

    const isPartial = data.amount < paymentProof.remainingAmount - 0.01;

    if (isPartial) {
      if (!data.plannedNextPaymentDate) {
        return { success: false, error: "A planned next payment date is required for partial payments" };
      }
      const promiseDate = new Date(data.plannedNextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (promiseDate < today) {
        return { success: false, error: "Planned next payment date must be today or a future date" };
      }
    }

    const result = await db.$transaction(async (tx) => {
      const payment = await tx.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          orgId: invoice.organizationId,
          amount: data.amount,
          method: data.paymentMethod,
          note: data.note || null,
          paidAt: new Date(data.paymentDate),
          isPartial,
          source: "public_proof",
          status: "PENDING_REVIEW",
          plannedNextPaymentDate: isPartial ? (data.plannedNextPaymentDate ?? null) : null,
        },
      });

      const proof = await tx.invoiceProof.create({
        data: {
          invoiceId: invoice.id,
          fileUrl: data.fileUrl,
          fileName: data.fileName,
          amount: data.amount,
          paymentDate: data.paymentDate,
          paymentMethod: data.paymentMethod,
          uploadedByToken: tokenRecord.id,
          reviewStatus: "PENDING",
          invoicePaymentId: payment.id,
          plannedNextPaymentDate: isPartial ? (data.plannedNextPaymentDate ?? null) : null,
        },
      });

      return proof;
    });

    return {
      success: true,
      data: { proofId: result.id },
    };
  } catch (error) {
    console.error("uploadPaymentProof error:", error);
    return { success: false, error: "Failed to upload payment proof" };
  }
}
