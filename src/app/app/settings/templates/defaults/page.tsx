import { TEMPLATE_REGISTRY, DOCTYPE_LABELS, type DocType, getEffectiveTemplateId } from "@/lib/docs/templates/registry";
import { getOrgDefaults } from "@/app/app/actions/org-defaults-actions";
import { DefaultTemplatesClient } from "./default-templates-client";

export const metadata = {
  title: "Default Templates | Slipwise Settings",
};

export default async function DefaultTemplatesPage() {
  const defaults = await getOrgDefaults();

  const currentDefaults = {
    invoice: defaults?.defaultInvoiceTemplate ?? null,
    voucher: defaults?.defaultVoucherTemplate ?? null,
    "salary-slip": defaults?.defaultSlipTemplate ?? null,
  };

  // Determine Slipwise platform defaults (first non-premium template for each doc type)
  // Use getEffectiveTemplateId to respect per-docType overrides.
  const slipwiseDefaults: Record<DocType, string> = {
    invoice: getEffectiveTemplateId(
      TEMPLATE_REGISTRY.find((t) => t.docTypes.includes("invoice") && !t.isPremium) ?? TEMPLATE_REGISTRY[0],
      "invoice"
    ),
    voucher: getEffectiveTemplateId(
      TEMPLATE_REGISTRY.find((t) => t.docTypes.includes("voucher") && !t.isPremium) ?? TEMPLATE_REGISTRY[0],
      "voucher"
    ),
    "salary-slip": getEffectiveTemplateId(
      TEMPLATE_REGISTRY.find((t) => t.docTypes.includes("salary-slip") && !t.isPremium) ?? TEMPLATE_REGISTRY[0],
      "salary-slip"
    ),
  };

  return (
    <DefaultTemplatesClient
      currentDefaults={currentDefaults}
      slipwiseDefaults={slipwiseDefaults}
      allTemplates={TEMPLATE_REGISTRY}
    />
  );
}
