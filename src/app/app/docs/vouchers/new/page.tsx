import type { Metadata } from "next";
import { VoucherBrandingWrapper } from "./branding-wrapper";
import { listVendors } from "@/app/app/data/actions";
import { getOrgDefaults } from "@/app/app/actions/org-defaults-actions";

export const metadata: Metadata = {
  title: "Voucher Studio",
  description: "Create and export payment and receipt vouchers.",
};

export default async function NewVoucherPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const params = await searchParams;
  const [vendorResult, defaults] = await Promise.all([
    listVendors({ limit: 100 }).catch(() => ({ vendors: [] })),
    getOrgDefaults().catch(() => null),
  ]);
  const templateId = params.template || defaults?.defaultVoucherTemplate || undefined;
  return <VoucherBrandingWrapper vendors={vendorResult.vendors} initialTemplateId={templateId} />;
}
