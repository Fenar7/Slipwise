import type { Metadata } from "next";
import { VoucherBrandingWrapper } from "./branding-wrapper";
import { listVendors } from "@/app/app/data/actions";
import { getOrgDefaults } from "@/app/app/actions/org-defaults-actions";
import { resolveVoucherAutofill } from "../autofill-resolver";

export const metadata: Metadata = {
  title: "Voucher Studio",
  description: "Create and export payment and receipt vouchers.",
};

export default async function NewVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string; vendorId?: string }>;
}) {
  const params = await searchParams;
  const [vendorResult, defaults, autofillPayload] = await Promise.all([
    listVendors({ limit: 100 }).catch(() => ({ vendors: [] })),
    getOrgDefaults().catch(() => null),
    params.vendorId
      ? resolveVoucherAutofill({ vendorId: params.vendorId }).catch(() => null)
      : resolveVoucherAutofill({}).catch(() => null),
  ]);
  const templateId = params.template || defaults?.defaultVoucherTemplate || autofillPayload?.templateId || undefined;
  return (
    <VoucherBrandingWrapper
      vendors={vendorResult.vendors}
      initialTemplateId={templateId}
      initialAutofill={autofillPayload}
    />
  );
}
