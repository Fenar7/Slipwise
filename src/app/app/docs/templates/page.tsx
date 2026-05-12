import {
  TEMPLATE_REGISTRY,
  CATEGORY_LABELS,
  DOCTYPE_LABELS,
  type DocType,
  type TemplateCategory,
} from "@/lib/docs/templates/registry";
import { TemplateStoreClient } from "./template-store-client";
import { getOrgDefaults } from "@/app/app/actions/org-defaults-actions";

export const metadata = {
  title: "Template Store | Slipwise",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; type?: string }>;
}) {
  const params = await searchParams;
  const activeCategory = params.category as TemplateCategory | undefined;
  const activeType = params.type as DocType | undefined;

  const [defaults, filtered] = await Promise.all([
    getOrgDefaults(),
    Promise.resolve(
      TEMPLATE_REGISTRY.filter((t) => {
        if (activeCategory && t.category !== activeCategory) return false;
        if (activeType && !t.docTypes.includes(activeType)) return false;
        return true;
      })
    ),
  ]);

  const currentDefaults = {
    invoice: defaults?.defaultInvoiceTemplate ?? null,
    voucher: defaults?.defaultVoucherTemplate ?? null,
    "salary-slip": defaults?.defaultSlipTemplate ?? null,
  };

  return (
    <div className="slipwise-shell-bg min-h-screen">
      <div className="mx-auto max-w-[80rem] px-3 py-5 sm:px-4 lg:px-5 lg:py-7">
        <TemplateStoreClient
          templates={filtered}
          allTemplates={TEMPLATE_REGISTRY}
          currentDefaults={currentDefaults}
          activeCategory={activeCategory}
          activeType={activeType}
        />
      </div>
    </div>
  );
}
