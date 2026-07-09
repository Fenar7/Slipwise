"use server";

import { requireOrgContext } from "@/lib/auth";
import { resolveVoucherDefaults } from "@/app/app/docs/shared/defaulting/adapters/voucher-adapter";
import type { VoucherAutofillPayload } from "@/app/app/docs/shared/defaulting/adapters/voucher-adapter";

export type { VoucherAutofillPayload };

export async function validateVoucherVendor(vendorId: string | undefined | null, orgId: string): Promise<void> {
  if (!vendorId) return;
  const { db } = await import("@/lib/db");
  const vendor = await db.vendor.findFirst({
    where: { id: vendorId, organizationId: orgId },
  });
  if (!vendor) {
    throw new Error("Vendor not found or does not belong to this organisation.");
  }
}

export async function resolveVoucherAutofill(params: {
  vendorId?: string;
  templateParam?: string;
}): Promise<VoucherAutofillPayload> {
  const { orgId } = await requireOrgContext();

  return resolveVoucherDefaults({
    orgId,
    vendorId: params.vendorId,
    templateParam: params.templateParam,
  });
}
