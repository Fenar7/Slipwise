"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoucherAutofillPayload = {
  vendorId: string;
  voucherType: "payment" | "receipt";
  date: string;
  counterpartyName: string;
  notes: string;
  approvedBy: string;
  receivedBy: string;
  paymentMode: string;
  referenceNumber: string;
  purpose: string;
  branding: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
    accentColor: string;
  };
  templateId: string;
  metadata?: {
    resolvedAt: string;
  };
};

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Validator ────────────────────────────────────────────────────────────────

export async function validateVoucherVendor(vendorId: string | undefined | null, orgId: string): Promise<void> {
  if (!vendorId) {
    return;
  }
  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, organizationId: orgId },
  });
  if (!vendor) {
    throw new Error("Vendor not found or does not belong to this organisation.");
  }
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

export async function resolveVoucherAutofill(params: {
  vendorId?: string;
}): Promise<VoucherAutofillPayload> {
  const { orgId } = await requireOrgContext();

  const [org, orgDefaults, brandingProfile] = await Promise.all([
    db.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    }),
    db.orgDefaults.findUnique({
      where: { organizationId: orgId },
    }),
    db.brandingProfile.findUnique({
      where: { organizationId: orgId },
    }),
  ]);

  const companyName = org?.name?.trim() || "";
  const address = orgDefaults?.businessAddress?.trim() || "";
  const accentColor = brandingProfile?.accentColor?.trim() || "#dc2626";

  const templateId = orgDefaults?.defaultVoucherTemplate?.trim() || "minimal-office";
  const date = todayIso();

  const notes = orgDefaults?.defaultVoucherNotes?.trim() || "";
  const approvedBy = orgDefaults?.defaultVoucherApprovedBy?.trim() || "";
  const receivedBy = orgDefaults?.defaultVoucherReceivedBy?.trim() || "";
  const paymentMode = orgDefaults?.defaultVoucherPaymentMode?.trim() || "";

  // If no vendor is selected, return org defaults with empty vendor info
  if (!params.vendorId) {
    return {
      vendorId: "",
      voucherType: "payment",
      date,
      counterpartyName: "",
      notes,
      approvedBy,
      receivedBy,
      paymentMode,
      referenceNumber: "",
      purpose: "",
      branding: {
        companyName,
        address,
        email: "",
        phone: "",
        accentColor,
      },
      templateId,
      metadata: {
        resolvedAt: new Date().toISOString(),
      },
    };
  }

  // Load org-scoped vendor
  const vendor = await db.vendor.findFirst({
    where: {
      id: params.vendorId,
      organizationId: orgId,
    },
  });

  if (!vendor) {
    throw new Error("Vendor not found or does not belong to this organisation.");
  }

  return {
    vendorId: vendor.id,
    voucherType: "payment",
    date,
    counterpartyName: vendor.name,
    notes,
    approvedBy,
    receivedBy,
    paymentMode,
    referenceNumber: "",
    purpose: "",
    branding: {
      companyName,
      address,
      email: "",
      phone: "",
      accentColor,
    },
    templateId,
    metadata: {
      resolvedAt: new Date().toISOString(),
    },
  };
}
