"use server";

import { db } from "@/lib/db";
import type { DefaultResolution, DefaultResolutionInput, OrgDefaultsSnapshot, EntityInfo } from "./types";

type EntityRecord = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
  taxId: string | null;
  paymentTermsDays: number | null;
};

function pickFirst(...values: (string | null | undefined)[]): string {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function pickString(dbValue: string | null | undefined): string {
  return dbValue?.trim() || "";
}

function pickInt(dbValue: number | null | undefined, fallback: number): number {
  return dbValue ?? fallback;
}

function snapshotDefaults(record: Record<string, unknown> | null): OrgDefaultsSnapshot {
  return {
    gstin: pickFirst((record?.gstin as string) ?? null),
    taxId: pickFirst((record?.taxId as string) ?? null),
    bankName: pickString((record?.bankName as string) ?? null),
    bankAccount: pickString((record?.bankAccount as string) ?? null),
    bankIFSC: pickString((record?.bankIFSC as string) ?? null),
    businessAddress: pickString((record?.businessAddress as string) ?? null),
    defaultInvoiceTemplate: pickString((record?.defaultInvoiceTemplate as string) ?? "professional"),
    defaultInvoiceNotes: pickString((record?.defaultInvoiceNotes as string) ?? null),
    defaultInvoiceTerms: pickString((record?.defaultInvoiceTerms as string) ?? null),
    defaultInvoiceAuthorizedBy: pickString((record?.defaultInvoiceAuthorizedBy as string) ?? null),
    defaultVoucherTemplate: pickString((record?.defaultVoucherTemplate as string) ?? "minimal-office"),
    defaultVoucherNotes: pickString((record?.defaultVoucherNotes as string) ?? null),
    defaultVoucherApprovedBy: pickString((record?.defaultVoucherApprovedBy as string) ?? null),
    defaultVoucherReceivedBy: pickString((record?.defaultVoucherReceivedBy as string) ?? null),
    defaultVoucherPaymentMode: pickString((record?.defaultVoucherPaymentMode as string) ?? null),
    defaultQuoteNotes: pickString((record?.defaultQuoteNotes as string) ?? null),
    defaultQuoteTerms: pickString((record?.defaultQuoteTerms as string) ?? null),
    quoteValidityDays: pickInt(record?.quoteValidityDays as number, 14),
  };
}

function buildEntityInfo(record: EntityRecord): EntityInfo {
  return {
    id: record.id,
    name: record.name,
    email: record.email?.trim() || "",
    phone: record.phone?.trim() || "",
    address: record.address?.trim() || "",
    gstin: record.gstin?.trim() || "",
    taxId: record.taxId?.trim() || "",
    paymentTermsDays: record.paymentTermsDays ?? 30,
  };
}

function resolveTemplateKind(input: DefaultResolutionInput, od: OrgDefaultsSnapshot): string {
  const queryOverride = input.queryParams?.template?.trim();
  if (queryOverride) return queryOverride;

  if (input.kind === "invoice") return od.defaultInvoiceTemplate || "professional";
  if (input.kind === "voucher") return od.defaultVoucherTemplate || "minimal-office";
  return od.defaultInvoiceTemplate || "professional";
}

export async function resolveDefaults(input: DefaultResolutionInput): Promise<DefaultResolution> {
  const orgDefaultsRecord = await db.orgDefaults.findUnique({
    where: { organizationId: input.orgId },
  });

  const orgDefaults = snapshotDefaults(orgDefaultsRecord as Record<string, unknown> | null);

  let entity: EntityInfo | null = null;

  if (input.entityId) {
    if (input.kind === "voucher") {
      const vendor = await db.vendor.findFirst({
        where: {
          id: input.entityId,
          organizationId: input.orgId,
        },
      });

      if (!vendor) {
        throw new Error("Vendor not found or does not belong to this organisation.");
      }

      entity = buildEntityInfo(vendor);
    } else {
      const customer = await db.customer.findFirst({
        where: {
          id: input.entityId,
          organizationId: input.orgId,
        },
      });

      if (!customer) {
        throw new Error("Customer not found or does not belong to this organisation.");
      }

      entity = buildEntityInfo(customer);
    }
  }

  const templateId = resolveTemplateKind(input, orgDefaults);

  return { orgDefaults, entity, templateId };
}
