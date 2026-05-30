import type { Metadata } from "next";
import { VoucherBrandingWrapper } from "./branding-wrapper";
import type { VoucherFormValues } from "@/features/docs/voucher/types";
import { getOrgDefaults } from "@/app/app/actions/org-defaults-actions";

export const metadata: Metadata = {
  title: "Voucher Studio",
  description: "Create and export payment and receipt vouchers.",
};

export default async function NewVoucherPage({
  searchParams,
}: {
  // Accept optional vendorId and template query parameters
  searchParams: Promise<{ template?: string; vendorId?: string }>;
}) {
  const params = await searchParams;
  const [vendorResult, defaults] = await Promise.all([
    listVendors({ limit: 100 }).catch(() => ({ vendors: [] })),
    getOrgDefaults().catch(() => null),
  ]);

  // Resolve template ID from query or org defaults
  const templateId = params.template || defaults?.defaultVoucherTemplate || undefined;

  // Build initial form values from org defaults and optional vendorId
  const initialValues: Partial<VoucherFormValues> = {
    vendorId: params.vendorId,
    notes: defaults?.defaultVoucherNotes ?? "",
    approvedBy: defaults?.defaultVoucherApprovedBy ?? "",
    receivedBy: defaults?.defaultVoucherReceivedBy ?? "",
    paymentMode: defaults?.defaultVoucherPaymentMode ?? "",
  };

  return (
    <VoucherBrandingWrapper
      vendors={vendorResult.vendors}
      initialTemplateId={templateId}
      initialValues={initialValues}
    />
  );
}
