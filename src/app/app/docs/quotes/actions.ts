"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { checkLimit } from "@/lib/plans/enforcement";
import { incrementUsage } from "@/lib/plans/usage";
import {
  createQuote,
  updateQuote,
  sendQuote,
  convertQuoteToInvoice,
} from "@/lib/quotes";
import { revalidatePath } from "next/cache";
import { emitQuoteEvent } from "@/lib/document-events";
import { syncQuoteToIndex, removeDocumentFromIndex } from "@/lib/docs-vault";
import { resolveQuoteAutofill, type QuoteAutofillPayload } from "./autofill-resolver";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuoteStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "DECLINED"
  | "EXPIRED"
  | "CONVERTED";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export interface QuoteLineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

export interface QuoteInput {
  customerId: string;
  title: string;
  issueDate?: string;
  validUntil?: string;
  currency?: string;
  notes?: string;
  termsAndConditions?: string;
  templateId?: string;
  discountAmount?: number;
  lineItems: QuoteLineItemInput[];
}

// ─── Quote Autofill & Validation ──────────────────────────────────────────────

export async function validateQuoteCustomer(customerId: string, orgId: string): Promise<void> {
  if (!customerId) {
    throw new Error("Customer ID is required");
  }
  const customer = await db.customer.findFirst({
    where: { id: customerId, organizationId: orgId },
  });
  if (!customer) {
    throw new Error("Customer not found or does not belong to this organisation.");
  }
}

export async function resolveQuoteAutofillAction(params: {
  customerId?: string;
}): Promise<ActionResult<QuoteAutofillPayload>> {
  try {
    const payload = await resolveQuoteAutofill(params);
    return { success: true, data: payload };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to resolve quote autofill",
    };
  }
}

// ─── List Quotes ──────────────────────────────────────────────────────────────

export async function listQuotes(params?: {
  status?: QuoteStatus;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const { orgId } = await requireOrgContext();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const skip = (page - 1) * limit;

  const where = {
    orgId,
    archivedAt: null as Date | null,
    ...(params?.status && { status: params.status }),
    ...(params?.search && {
      OR: [
        { quoteNumber: { contains: params.search, mode: "insensitive" as const } },
        { title: { contains: params.search, mode: "insensitive" as const } },
        { customer: { name: { contains: params.search, mode: "insensitive" as const } } },
      ],
    }),
  };

  const [quotes, total] = await Promise.all([
    db.quote.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { customer: true },
    }),
    db.quote.count({ where }),
  ]);

  return {
    quotes,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Get Quote ────────────────────────────────────────────────────────────────

export async function getQuote(quoteId: string) {
  const { orgId } = await requireOrgContext();

  return db.quote.findFirst({
    where: { id: quoteId, orgId, archivedAt: null },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" } },
      customer: true,
      org: true,
    },
  });
}

// ─── Create Quote Action ──────────────────────────────────────────────────────

export async function createQuoteAction(
  data: QuoteInput
): Promise<ActionResult<{ id: string; quoteNumber: string }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    // Validate customerId belongs to active org
    await validateQuoteCustomer(data.customerId, orgId);

    // Plan gating
    const limitCheck = await checkLimit(orgId, "quotesPerMonth");
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Monthly quote limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan for more.`,
      };
    }

    const quote = await createQuote({
      orgId,
      userId,
      customerId: data.customerId,
      title: data.title,
      issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      currency: data.currency,
      notes: data.notes,
      termsAndConditions: data.termsAndConditions,
      templateId: data.templateId,
      discountAmount: data.discountAmount,
      lineItems: data.lineItems,
    });

    await incrementUsage(orgId, "quotesPerMonth");

    // Phase 19.2: emit normalized document event
    void emitQuoteEvent(orgId, quote.id, "created", {
      actorId: userId,
      metadata: { quoteNumber: quote.quoteNumber },
    });

    // Phase 19.1: Sync to DocumentIndex (quotes are first-class docs)
    void syncQuoteToIndex(orgId, {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      status: quote.status,
      issueDate: quote.issueDate,
      totalAmount: quote.totalAmount,
      currency: quote.currency,
      archivedAt: null,
    });

    revalidatePath("/app/docs/quotes");
    return { success: true, data: { id: quote.id, quoteNumber: quote.quoteNumber } };
  } catch (error) {
    console.error("createQuoteAction error:", error);
    const message = error instanceof Error ? error.message : "Failed to create quote";
    return { success: false, error: message };
  }
}

// ─── Update Quote Action ──────────────────────────────────────────────────────

export async function updateQuoteAction(
  quoteId: string,
  data: Partial<QuoteInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    if (data.customerId) {
      await validateQuoteCustomer(data.customerId, orgId);
    }

    await updateQuote(quoteId, orgId, userId, {
      title: data.title,
      customerId: data.customerId,
      issueDate: data.issueDate ? new Date(data.issueDate) : undefined,
      validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
      currency: data.currency,
      notes: data.notes,
      termsAndConditions: data.termsAndConditions,
      templateId: data.templateId,
      discountAmount: data.discountAmount,
      lineItems: data.lineItems,
    });

    // Phase 19.2: emit normalized document event
    void emitQuoteEvent(orgId, quoteId, "updated", { actorId: userId });

    // Phase 19.1: Sync updated quote to DocumentIndex
    const updated = await db.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true },
    });
    if (updated) {
      void syncQuoteToIndex(orgId, {
        id: updated.id,
        quoteNumber: updated.quoteNumber,
        title: updated.title,
        status: updated.status,
        issueDate: updated.issueDate,
        totalAmount: updated.totalAmount,
        currency: updated.currency,
        archivedAt: updated.archivedAt,
        customer: updated.customer ?? undefined,
      });
    }

    revalidatePath("/app/docs/quotes");
    revalidatePath(`/app/docs/quotes/${quoteId}`);
    return { success: true, data: { id: quoteId } };
  } catch (error) {
    console.error("updateQuoteAction error:", error);
    const message = error instanceof Error ? error.message : "Failed to update quote";
    return { success: false, error: message };
  }
}

// ─── Delete Quote ─────────────────────────────────────────────────────────────

export async function deleteQuote(quoteId: string): Promise<ActionResult<void>> {
  try {
    const { orgId } = await requireOrgContext();

    const existing = await db.quote.findFirst({
      where: { id: quoteId, orgId },
    });

    if (!existing) {
      return { success: false, error: "Quote not found" };
    }

    if (existing.status !== "DRAFT") {
      return { success: false, error: "Only draft quotes can be deleted" };
    }

    await db.quote.delete({ where: { id: quoteId } });

    await removeDocumentFromIndex(orgId, "quote", quoteId);

    revalidatePath("/app/docs/quotes");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteQuote error:", error);
    return { success: false, error: "Failed to delete quote" };
  }
}

// ─── Archive Quote (Phase 19.1 — first-class vault support) ───────────────────

export async function archiveQuote(quoteId: string): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.quote.findFirst({
      where: { id: quoteId, orgId },
    });

    if (!existing) {
      return { success: false, error: "Quote not found" };
    }

    const archived = await db.quote.update({
      where: { id: quoteId },
      data: { archivedAt: new Date() },
      include: { customer: true },
    });

    // Phase 19.1: Sync archive state to DocumentIndex
    void syncQuoteToIndex(orgId, {
      id: archived.id,
      quoteNumber: archived.quoteNumber,
      title: archived.title,
      status: archived.status,
      issueDate: archived.issueDate,
      totalAmount: archived.totalAmount,
      currency: archived.currency,
      archivedAt: archived.archivedAt,
      customer: archived.customer ?? undefined,
    });

    // Phase 19.2: emit normalized document event
    void emitQuoteEvent(orgId, quoteId, "archived", { actorId: userId });

    revalidatePath("/app/docs/quotes");
    revalidatePath("/app/docs/vault");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("archiveQuote error:", error);
    return { success: false, error: "Failed to archive quote" };
  }
}

export async function restoreQuote(quoteId: string): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.quote.findFirst({
      where: { id: quoteId, orgId },
    });

    if (!existing) {
      return { success: false, error: "Quote not found" };
    }

    const restored = await db.quote.update({
      where: { id: quoteId },
      data: { archivedAt: null },
      include: { customer: true },
    });

    // Phase 19.1: Sync restore state to DocumentIndex
    void syncQuoteToIndex(orgId, {
      id: restored.id,
      quoteNumber: restored.quoteNumber,
      title: restored.title,
      status: restored.status,
      issueDate: restored.issueDate,
      totalAmount: restored.totalAmount,
      currency: restored.currency,
      archivedAt: restored.archivedAt,
      customer: restored.customer ?? undefined,
    });

    // Phase 19.2: emit normalized document event
    void emitQuoteEvent(orgId, quoteId, "restored", { actorId: userId });

    revalidatePath("/app/docs/quotes");
    revalidatePath("/app/docs/vault");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("restoreQuote error:", error);
    return { success: false, error: "Failed to restore quote" };
  }
}
// ─── Send Quote Action ───────────────────────────────────────────────────────

export async function sendQuoteAction(quoteId: string): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    await sendQuote(quoteId, orgId, userId);

    // Phase 19.2: emit normalized document event
    void emitQuoteEvent(orgId, quoteId, "sent", { actorId: userId });

    // Sync status change to DocumentIndex
    const updated = await db.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true },
    });
    if (updated) {
      void syncQuoteToIndex(orgId, {
        id: updated.id,
        quoteNumber: updated.quoteNumber,
        title: updated.title,
        status: updated.status,
        issueDate: updated.issueDate,
        totalAmount: updated.totalAmount,
        currency: updated.currency,
        archivedAt: updated.archivedAt,
        customer: updated.customer ?? undefined,
      });
    }

    revalidatePath("/app/docs/quotes");
    revalidatePath(`/app/docs/quotes/${quoteId}`);
    return { success: true, data: undefined };
  } catch (error) {
    console.error("sendQuoteAction error:", error);
    const message = error instanceof Error ? error.message : "Failed to send quote";
    return { success: false, error: message };
  }
}

// ─── Convert Quote to Invoice Action ──────────────────────────────────────────

export async function convertQuoteAction(
  quoteId: string
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const invoice = await convertQuoteToInvoice(quoteId, orgId, userId);

    // Phase 19.2: emit quote_converted + invoice created events (first-class quote lifecycle)
    void emitQuoteEvent(orgId, quoteId, "quote_converted", {
      actorId: userId,
      metadata: { invoiceId: invoice.id },
    });

    // Sync status change (CONVERTED) to DocumentIndex
    const updated = await db.quote.findUnique({
      where: { id: quoteId },
      include: { customer: true },
    });
    if (updated) {
      void syncQuoteToIndex(orgId, {
        id: updated.id,
        quoteNumber: updated.quoteNumber,
        title: updated.title,
        status: updated.status,
        issueDate: updated.issueDate,
        totalAmount: updated.totalAmount,
        currency: updated.currency,
        archivedAt: updated.archivedAt,
        customer: updated.customer ?? undefined,
      });
    }

    revalidatePath("/app/docs/quotes");
    revalidatePath(`/app/docs/quotes/${quoteId}`);
    revalidatePath("/app/docs/invoices");
    return { success: true, data: { invoiceId: invoice.id } };
  } catch (error) {
    console.error("convertQuoteAction error:", error);
    const message = error instanceof Error ? error.message : "Failed to convert quote";
    return { success: false, error: message };
  }
}

// ─── Duplicate Quote ──────────────────────────────────────────────────────────

export async function duplicateQuote(
  quoteId: string
): Promise<ActionResult<{ id: string; quoteNumber: string }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const existing = await db.quote.findFirst({
      where: { id: quoteId, orgId },
      include: { lineItems: { orderBy: { sortOrder: "asc" } } },
    });

    if (!existing) {
      return { success: false, error: "Quote not found" };
    }

    // Plan gating
    const limitCheck = await checkLimit(orgId, "quotesPerMonth");
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Monthly quote limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan for more.`,
      };
    }

    const quote = await createQuote({
      orgId,
      userId,
      customerId: existing.customerId,
      title: `${existing.title} (Copy)`,
      currency: existing.currency,
      notes: existing.notes ?? undefined,
      termsAndConditions: existing.termsAndConditions ?? undefined,
      templateId: existing.templateId ?? undefined,
      discountAmount: existing.discountAmount,
      lineItems: existing.lineItems.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        taxRate: item.taxRate,
        sortOrder: item.sortOrder,
      })),
    });

    await incrementUsage(orgId, "quotesPerMonth");

    // Phase 19.2: emit normalized document events
    void emitQuoteEvent(orgId, quote.id, "created", {
      metadata: { duplicatedFrom: quoteId, quoteNumber: quote.quoteNumber },
    });
    void emitQuoteEvent(orgId, quoteId, "duplicated", {
      metadata: { newQuoteId: quote.id, newQuoteNumber: quote.quoteNumber },
    });

    // Phase 19.1: Sync the new duplicate to DocumentIndex
    void syncQuoteToIndex(orgId, {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      status: quote.status,
      issueDate: quote.issueDate,
      totalAmount: quote.totalAmount,
      currency: quote.currency,
      archivedAt: null,
    });

    revalidatePath("/app/docs/quotes");
    return { success: true, data: { id: quote.id, quoteNumber: quote.quoteNumber } };
  } catch (error) {
    console.error("duplicateQuote error:", error);
    return { success: false, error: "Failed to duplicate quote" };
  }
}
