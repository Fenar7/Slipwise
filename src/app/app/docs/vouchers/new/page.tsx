import type { Metadata } from "next";
import { VoucherBrandingWrapper } from "./branding-wrapper";
import { listVendors } from "@/app/app/data/actions";
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
  const [vendorResult, autofillPayload] = await Promise.all([
    listVendors({ limit: 100 }).catch(() => ({ vendors: [] })),
    resolveVoucherAutofill({
      vendorId: params.vendorId || undefined,
      templateParam: params.template || undefined,
    }).catch(() => null),
  ]);
  return (
    <VoucherBrandingWrapper
      vendors={vendorResult.vendors}
      initialTemplateId={autofillPayload?.templateId}
      initialAutofill={autofillPayload}
    />
  );
}
