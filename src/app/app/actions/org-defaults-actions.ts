"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type OrgDefaultsInput = {
  defaultInvoiceTemplate?: string;
  defaultVoucherTemplate?: string;
  defaultSlipTemplate?: string;
  defaultCurrency?: string;
  defaultInvoiceNotes?: string;
  defaultInvoiceTerms?: string;
  defaultInvoiceAuthorizedBy?: string;
  defaultVoucherNotes?: string;
  defaultVoucherApprovedBy?: string;
  defaultVoucherReceivedBy?: string;
  defaultVoucherPaymentMode?: string;
  defaultQuoteNotes?: string;
  defaultQuoteTerms?: string;
  quoteValidityDays?: number;
};

export async function getOrgDefaults() {
  try {
    const { orgId } = await requireOrgContext();
    const defaults = await db.orgDefaults.findUnique({
      where: { organizationId: orgId },
    });
    return defaults;
  } catch {
    return null;
  }
}

export async function updateOrgDefaults(input: OrgDefaultsInput) {
  try {
    const { orgId } = await requireOrgContext();
    await db.orgDefaults.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...input },
      update: input,
    });
    revalidatePath("/app/docs/templates");
    revalidatePath("/app/settings");
    return { success: true };
  } catch (error) {
    console.error("updateOrgDefaults error:", error);
    return { success: false, error: "Failed to update defaults" };
  }
}
