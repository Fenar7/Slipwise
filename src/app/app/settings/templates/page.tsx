import {
  TEMPLATE_REGISTRY,
  CATEGORY_LABELS,
  DOCTYPE_LABELS,
  type DocType,
  type TemplateCategory,
} from "@/lib/docs/templates/registry";
import { getOrgDefaults } from "@/app/app/actions/org-defaults-actions";
import { TemplateLibraryClient } from "./template-library-client";

export const metadata = {
  title: "Templates | Slipwise Settings",
};

export default async function TemplatesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; type?: string }>;
}) {
  const params = await searchParams;
  const activeCategory = params.category as TemplateCategory | undefined;
  const activeType = params.type as DocType | undefined;

  const defaults = await getOrgDefaults();

  const currentDefaults = {
    invoice: defaults?.defaultInvoiceTemplate ?? null,
    voucher: defaults?.defaultVoucherTemplate ?? null,
    "salary-slip": defaults?.defaultSlipTemplate ?? null,
  };

  const filtered = TEMPLATE_REGISTRY.filter((t) => {
    if (activeCategory && t.category !== activeCategory) return false;
    if (activeType && !t.docTypes.includes(activeType)) return false;
    return true;
  });

  return (
    <TemplateLibraryClient
      templates={filtered}
      allTemplates={TEMPLATE_REGISTRY}
      currentDefaults={currentDefaults}
      activeCategory={activeCategory}
      activeType={activeType}
    />
  );
}
