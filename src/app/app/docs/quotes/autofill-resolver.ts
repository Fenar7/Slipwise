"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuoteAutofillPayload = {
  customerId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  termsAndConditions: string;
  metadata?: {
    resolvedAt: string;
  };
};

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

export async function resolveQuoteAutofill(params: {
  customerId?: string;
}): Promise<QuoteAutofillPayload> {
  const { orgId } = await requireOrgContext();

  const orgDefaults = await db.orgDefaults.findUnique({
    where: { organizationId: orgId },
  });

  // Org-level quote defaults
  const validityDays = orgDefaults?.quoteValidityDays ?? 14;
  const notes = orgDefaults?.defaultQuoteNotes?.trim() || "";
  const termsAndConditions = orgDefaults?.defaultQuoteTerms?.trim() || "";
  const issueDate = todayIso();
  const validUntil = addDays(issueDate, validityDays);

  // If no customer is selected, return org defaults with empty customer info
  if (!params.customerId) {
    return {
      customerId: "",
      clientName: "",
      clientEmail: "",
      clientPhone: "",
      clientAddress: "",
      issueDate,
      validUntil,
      notes,
      termsAndConditions,
      metadata: {
        resolvedAt: new Date().toISOString(),
      },
    };
  }

  // Load org-scoped customer
  const customer = await db.customer.findFirst({
    where: {
      id: params.customerId,
      organizationId: orgId,
    },
  });

  if (!customer) {
    throw new Error("Customer not found or does not belong to this organisation.");
  }

  return {
    customerId: customer.id,
    clientName: customer.name,
    clientEmail: customer.email?.trim() || "",
    clientPhone: customer.phone?.trim() || "",
    clientAddress: customer.address?.trim() || "",
    issueDate,
    validUntil,
    notes,
    termsAndConditions,
    metadata: {
      resolvedAt: new Date().toISOString(),
    },
  };
}
