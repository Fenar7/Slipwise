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
  defaultInvoiceNotes,
  defaultInvoiceTerms,
  defaultInvoiceAuthorizedBy,
  defaultQuoteNotes,
  defaultQuoteTerms,
}: {
  bankName: string;
  bankAccount: string;
  bankIFSC: string;
  taxId: string;
  gstin: string;
  businessAddress: string;
  defaultInvoiceNotes: string;
  defaultInvoiceTerms: string;
  defaultInvoiceAuthorizedBy: string;
  defaultQuoteNotes: string;
  defaultQuoteTerms: string;
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
      defaultInvoiceNotes: defaultInvoiceNotes || null,
      defaultInvoiceTerms: defaultInvoiceTerms || null,
      defaultInvoiceAuthorizedBy: defaultInvoiceAuthorizedBy || null,
      defaultQuoteNotes: defaultQuoteNotes || null,
      defaultQuoteTerms: defaultQuoteTerms || null,
    },
    update: {
      bankName,
      bankAccount,
      bankIFSC,
      taxId,
      gstin,
      businessAddress,
      defaultInvoiceNotes: defaultInvoiceNotes || null,
      defaultInvoiceTerms: defaultInvoiceTerms || null,
      defaultInvoiceAuthorizedBy: defaultInvoiceAuthorizedBy || null,
      defaultQuoteNotes: defaultQuoteNotes || null,
      defaultQuoteTerms: defaultQuoteTerms || null,
    },
  });
}
