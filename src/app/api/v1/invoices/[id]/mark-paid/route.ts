import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { postInvoicePaymentTx } from "@/lib/accounting";
import { toAccountingNumber } from "@/lib/accounting/utils";
import { dispatchEvent } from "@/lib/webhook/deliver";
import { validatePaymentAmount, reconcileInvoicePayment } from "@/lib/invoice-reconciliation";
import {
  authenticateApiRequest,
  requireScope,
  apiResponse,
  handleApiError,
  logApiRequest,
  getClientIp,
  ErrorCode,
  ApiError,
} from "../../../_helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const start = Date.now();
  try {
    const auth = await authenticateApiRequest(request);
    requireScope(auth.scopes, "write:invoices");
    const { id } = await context.params;

    const invoice = await db.invoice.findFirst({
      where: { id, organizationId: auth.orgId, archivedAt: null },
    });

    if (!invoice) {
      throw new ApiError(ErrorCode.NOT_FOUND, "Invoice not found.", 404);
    }

    if (invoice.status === "PAID") {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, "Invoice is already paid.", 422);
    }

    const body = await request.json().catch(() => ({})) as {
      amount?: number;
      method?: string;
      note?: string;
      currency?: string;
      paidAt?: string;
      plannedNextPaymentDate?: string;
    };

    const remainingAmount = toAccountingNumber(invoice.remainingAmount);
    const paymentAmount = body.amount ?? remainingAmount;

    const validation = await validatePaymentAmount(id, paymentAmount);
    if (!validation.valid) {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, validation.error!, 422);
    }

    const isPartial = paymentAmount < remainingAmount - 0.01;

    if (isPartial && body.plannedNextPaymentDate) {
      const promiseDate = new Date(body.plannedNextPaymentDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (promiseDate < today) {
        throw new ApiError(ErrorCode.VALIDATION_ERROR, "plannedNextPaymentDate must be today or a future date.", 422);
      }
    }

    const payment = await db.$transaction(async (tx) => {
      const created = await tx.invoicePayment.create({
        data: {
          invoiceId: id,
          orgId: auth.orgId,
          amount: paymentAmount,
          currency: body.currency ?? "INR",
          method: body.method ?? null,
          note: body.note ?? null,
          source: "api",
          status: "SETTLED",
          isPartial,
          paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
          plannedNextPaymentDate: isPartial ? (body.plannedNextPaymentDate ?? null) : null,
          recordedByUserId: null,
        },
      });

      await postInvoicePaymentTx(tx, {
        orgId: auth.orgId,
        invoicePaymentId: created.id,
      });

      return created;
    });

    const reconciled = await reconcileInvoicePayment(id);

    dispatchEvent(auth.orgId, "invoice.payment_received", {
      invoiceId: id,
      invoiceNumber: invoice.invoiceNumber ?? "",
      paymentId: payment.id,
      amount: paymentAmount,
      status: reconciled.derivedStatus,
      amountPaid: reconciled.amountPaid,
      remainingAmount: reconciled.remainingAmount,
    }).catch(() => {});

    const resp = apiResponse({
      paymentId: payment.id,
      invoiceId: id,
      status: reconciled.derivedStatus,
      amountPaid: reconciled.amountPaid,
      remainingAmount: reconciled.remainingAmount,
      isPartial: reconciled.remainingAmount > 0,
    });
    logApiRequest(auth.orgId, auth.apiKeyId, "POST", `/api/v1/invoices/${id}/mark-paid`, 200, Date.now() - start, getClientIp(request));
    return resp;
  } catch (err) {
    return handleApiError(err);
  }
}
