"use server";

import { db } from "@/lib/db";
import { requireOrgContext, requireRole } from "@/lib/auth";

export async function getOrgSettings() {
  const { orgId } = await requireOrgContext();
  const [branding, defaults] = await Promise.all([
    db.brandingProfile.findUnique({ where: { organizationId: orgId } }),
    db.orgDefaults.findUnique({ where: { organizationId: orgId } }),
  ]);
  return { branding, defaults };
}

export async function saveOrgBranding({
  accentColor,
  fontFamily,
}: {
  accentColor: string;
  fontFamily: string;
}) {
  const { orgId } = await requireRole("admin");

  await db.brandingProfile.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, accentColor, fontFamily },
    update: { accentColor, fontFamily },
  });
}

export async function saveOrgFinancials({
  bankName,
  bankAccount,
  bankIFSC,
  taxId,
  gstin,
  businessAddress,
  defaultVoucherNotes,
  defaultVoucherApprovedBy,
  defaultVoucherReceivedBy,
  defaultVoucherPaymentMode,
  defaultInvoiceNotes,
  defaultInvoiceTerms,
  defaultInvoiceAuthorizedBy,
  defaultQuoteNotes,
  defaultQuoteTerms,
  quoteValidityDays,
}: {
  bankName: string;
  bankAccount: string;
  bankIFSC: string;
  taxId: string;
  gstin: string;
  businessAddress: string;
  defaultVoucherNotes: string;
  defaultVoucherApprovedBy: string;
  defaultVoucherReceivedBy: string;
  defaultVoucherPaymentMode: string;
  defaultInvoiceNotes: string;
  defaultInvoiceTerms: string;
  defaultInvoiceAuthorizedBy: string;
  defaultQuoteNotes: string;
  defaultQuoteTerms: string;
  quoteValidityDays: number;
}) {
  const { orgId } = await requireRole("admin");

  await db.orgDefaults.upsert({
    where: { organizationId: orgId },
    create: {
      organizationId: orgId,
      bankName,
      bankAccount,
      bankIFSC,
      taxId,
      gstin,
      businessAddress,
      defaultVoucherNotes: defaultVoucherNotes || null,
      defaultVoucherApprovedBy: defaultVoucherApprovedBy || null,
      defaultVoucherReceivedBy: defaultVoucherReceivedBy || null,
      defaultVoucherPaymentMode: defaultVoucherPaymentMode || null,
      defaultInvoiceNotes: defaultInvoiceNotes || null,
      defaultInvoiceTerms: defaultInvoiceTerms || null,
      defaultInvoiceAuthorizedBy: defaultInvoiceAuthorizedBy || null,
      defaultQuoteNotes: defaultQuoteNotes || null,
      defaultQuoteTerms: defaultQuoteTerms || null,
      quoteValidityDays,
    },
    update: {
      bankName,
      bankAccount,
      bankIFSC,
      taxId,
      gstin,
      businessAddress,
      defaultVoucherNotes: defaultVoucherNotes || null,
      defaultVoucherApprovedBy: defaultVoucherApprovedBy || null,
      defaultVoucherReceivedBy: defaultVoucherReceivedBy || null,
      defaultVoucherPaymentMode: defaultVoucherPaymentMode || null,
      defaultInvoiceNotes: defaultInvoiceNotes || null,
      defaultInvoiceTerms: defaultInvoiceTerms || null,
      defaultInvoiceAuthorizedBy: defaultInvoiceAuthorizedBy || null,
      defaultQuoteNotes: defaultQuoteNotes || null,
      defaultQuoteTerms: defaultQuoteTerms || null,
      quoteValidityDays,
    },
  });
}
