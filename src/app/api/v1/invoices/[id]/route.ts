import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { dispatchEvent } from "@/lib/webhook/deliver";
import {
  authenticateApiRequest,
  requireScope,
  apiResponse,
  handleApiError,
  logApiRequest,
  getClientIp,
  ErrorCode,
  ApiError,
} from "../../_helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const start = Date.now();
  try {
    const auth = await authenticateApiRequest(request);
    requireScope(auth.scopes, "read:invoices");
    const { id } = await context.params;

    const invoice = await db.invoice.findFirst({
      where: { id, organizationId: auth.orgId, archivedAt: null },
      include: { lineItems: true, payments: true, customer: true },
    });

    if (!invoice) {
      throw new ApiError(ErrorCode.NOT_FOUND, "Invoice not found.", 404);
    }

    const resp = apiResponse(invoice);
    logApiRequest(auth.orgId, auth.apiKeyId, "GET", `/api/v1/invoices/${id}`, 200, Date.now() - start, getClientIp(request));
    return resp;
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
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

    if (invoice.status !== "DRAFT") {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, "Only DRAFT invoices can be updated.", 422);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, "Invalid JSON body.", 422);
    }

    const { invoiceDate, dueDate, customerId, notes, formData, lineItems } = body;

    const updateData: Record<string, unknown> = {};
    if (invoiceDate !== undefined) updateData.invoiceDate = invoiceDate;
    if (dueDate !== undefined) updateData.dueDate = dueDate;
    if (customerId !== undefined) updateData.customerId = customerId;
    if (notes !== undefined) updateData.notes = notes;
    if (formData !== undefined) updateData.formData = formData;

    // Replace line items if provided
    if (lineItems) {
      await db.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
      await db.invoiceLineItem.createMany({
        data: (lineItems as Array<{
          description: string;
          quantity?: number;
          unitPrice?: number;
          taxRate?: number;
          discount?: number;
          sortOrder?: number;
        }>).map(
          (li, idx) => {
            const qty = li.quantity ?? 1;
            const price = li.unitPrice ?? 0;
            const tax = li.taxRate ?? 0;
            const disc = li.discount ?? 0;
            const subtotal = qty * price;
            const amount = subtotal + subtotal * (tax / 100) - disc;
            return {
              invoiceId: id,
              description: li.description,
              quantity: qty,
              unitPrice: price,
              taxRate: tax,
              discount: disc,
              amount,
              sortOrder: li.sortOrder ?? idx,
            };
          }
        ),
      });

      const items = await db.invoiceLineItem.findMany({ where: { invoiceId: id } });
      updateData.totalAmount = items.reduce((s, li) => s + li.amount, 0);
    }

    const updated = await db.invoice.update({
      where: { id },
      data: updateData,
      include: { lineItems: true },
    });

    dispatchEvent(auth.orgId, "invoice.updated", {
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      status: updated.status,
    }).catch(() => {});

    const resp = apiResponse(updated);
    logApiRequest(auth.orgId, auth.apiKeyId, "PATCH", `/api/v1/invoices/${id}`, 200, Date.now() - start, getClientIp(request));
    return resp;
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const start = Date.now();
  try {
    const auth = await authenticateApiRequest(request);
    requireScope(auth.scopes, "delete:invoices");
    const { id } = await context.params;

    const invoice = await db.invoice.findFirst({
      where: { id, organizationId: auth.orgId, archivedAt: null },
    });

    if (!invoice) {
      throw new ApiError(ErrorCode.NOT_FOUND, "Invoice not found.", 404);
    }

    if (invoice.status !== "DRAFT" && invoice.status !== "CANCELLED") {
      throw new ApiError(ErrorCode.VALIDATION_ERROR, "Only DRAFT or CANCELLED invoices can be deleted.", 422);
    }

    await db.invoice.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    dispatchEvent(auth.orgId, "invoice.deleted", {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber ?? "",
    }).catch(() => {});

    const resp = apiResponse({ id, deleted: true });
    logApiRequest(auth.orgId, auth.apiKeyId, "DELETE", `/api/v1/invoices/${id}`, 200, Date.now() - start, getClientIp(request));
    return resp;
  } catch (err) {
    return handleApiError(err);
  }
}
