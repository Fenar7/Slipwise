"use server";
import { db } from "@/lib/db";

export async function getOrgSettings(organizationId: string) {
  const [branding, defaults] = await Promise.all([
    db.brandingProfile.findUnique({ where: { organizationId } }),
    db.orgDefaults.findUnique({ where: { organizationId } }),
  ]);
  return { branding, defaults };
}

export async function saveOrgBranding({
  organizationId,
  accentColor,
  fontFamily,
}: {
  organizationId: string;
  accentColor: string;
  fontFamily: string;
}) {
  await db.brandingProfile.upsert({
    where: { organizationId },
    create: { organizationId, accentColor, fontFamily },
    update: { accentColor, fontFamily },
  });
}

export async function saveOrgFinancials({
  organizationId,
  bankName,
  bankAccount,
  bankIFSC,
  taxId,
  gstin,
  businessAddress,
  defaultInvoiceNotes,
  defaultInvoiceTerms,
  defaultInvoiceAuthorizedBy,
}: {
  organizationId: string;
  bankName: string;
  bankAccount: string;
  bankIFSC: string;
  taxId: string;
  gstin: string;
  businessAddress: string;
  defaultInvoiceNotes: string;
  defaultInvoiceTerms: string;
  defaultInvoiceAuthorizedBy: string;
}) {
  await db.orgDefaults.upsert({
    where: { organizationId },
    create: {
      organizationId,
      bankName,
      bankAccount,
      bankIFSC,
      taxId,
      gstin,
      businessAddress,
      defaultInvoiceNotes: defaultInvoiceNotes || null,
      defaultInvoiceTerms: defaultInvoiceTerms || null,
      defaultInvoiceAuthorizedBy: defaultInvoiceAuthorizedBy || null,
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
    },
  });
}
