"use server";

import { requireOrgContext } from "@/lib/auth";
import { resolveVoucherDefaults, type VoucherDefaults } from "../shared/defaulting";
import { db } from "@/lib/db";

export type VoucherAutofillPayload = VoucherDefaults & {
  metadata?: {
    resolvedAt: string;
  };
};

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

export async function resolveVoucherAutofill(params: {
  vendorId?: string;
}): Promise<VoucherAutofillPayload> {
  const { orgId } = await requireOrgContext();
  const defaults = await resolveVoucherDefaults({
    orgId,
    vendorId: params.vendorId,
  });
  return {
    ...defaults,
    metadata: {
      resolvedAt: new Date().toISOString(),
    },
  };
}
