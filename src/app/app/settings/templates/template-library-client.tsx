"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOrgDefaults } from "@/app/app/actions/org-defaults-actions";
import type { TemplateDefinition, DocType } from "@/lib/docs/templates/registry";
import { CATEGORY_LABELS, DOCTYPE_LABELS } from "@/lib/docs/templates/registry";
import { TemplateCard } from "@/components/templates/template-card";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { LayoutGrid, SlidersHorizontal, CheckCircle2 } from "lucide-react";

interface TemplateLibraryClientProps {
  templates: TemplateDefinition[];
  allTemplates: TemplateDefinition[];
  currentDefaults: Record<DocType, string | null>;
  activeCategory?: string;
  activeType?: string;
}

type PreviewState = { template: TemplateDefinition; docType: DocType } | null;

const DOC_TYPE_DEFAULT_KEY: Record<DocType, "defaultInvoiceTemplate" | "defaultVoucherTemplate" | "defaultSlipTemplate"> = {
  invoice: "defaultInvoiceTemplate",
  voucher: "defaultVoucherTemplate",
  "salary-slip": "defaultSlipTemplate",
};

export function TemplateLibraryClient({
  templates,
  allTemplates,
  currentDefaults,
  activeCategory,
  activeType,
}: TemplateLibraryClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [previewState, setPreviewState] = useState<PreviewState>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const handleSetDefault = async (templateId: string, docType: DocType) => {
    const result = await updateOrgDefaults({ [DOC_TYPE_DEFAULT_KEY[docType]]: templateId });
    if (result.success) {
      toast.success("Default template updated");
      router.refresh();
    } else {
      toast.error("Failed to update default template");
      throw new Error("Update failed");
    }
  };

  const handlePreview = (template: TemplateDefinition, docType: DocType) => {
    setPreviewState({ template, docType });
  };

  const buildHref = (params: { category?: string; type?: string }) => {
    const sp = new URLSearchParams();
    if (params.category) sp.set("category", params.category);
    if (params.type) sp.set("type", params.type);
    const q = sp.toString();
    return `/app/settings/templates${q ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Document Templates
        </p>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Template Library
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          Browse, preview, and manage your organization&apos;s document templates. Set defaults for each document type to streamline creation.
        </p>
      </div>

      {/* Current defaults summary */}
      <div className="rounded-lg border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
            Current Defaults
          </p>
          <a
            href="/app/settings/templates/defaults"
            className="text-xs font-medium text-[var(--brand-primary)] hover:underline"
          >
            Manage defaults →
          </a>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["invoice", "Invoice", currentDefaults.invoice] as const,
              ["voucher", "Voucher", currentDefaults.voucher] as const,
              ["salary-slip", "Salary Slip", currentDefaults["salary-slip"]] as const,
            ]
          ).map(([type, label, defaultId]) => {
            const template = defaultId
              ? allTemplates.find((t) =>
                  t.docTypes.includes(type) &&
                  (t.templateId === defaultId || t.templateIdByDocType?.[type] === defaultId)
                )
              : null;
            return (
              <div
                key={type}
                className="flex items-center gap-2 rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-3 py-2"
              >
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {label}
                </span>
                <span className="text-xs font-medium text-[var(--text-primary)]">
                  {template?.name ?? (
                    <span className="text-[var(--text-muted)]">No default</span>
                  )}
                </span>
                {template && (
                  <span className="inline-block h-2 w-2 rounded-full bg-[var(--state-success)]" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Doc type filter */}
        <div className="flex flex-wrap gap-1.5">
          <a
            href={buildHref({ category: activeCategory })}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
              !activeType
                ? "border border-transparent bg-[var(--text-primary)] text-white shadow-[var(--shadow-xs)]"
                : "border border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            }`}
          >
            All Types
          </a>
          {(Object.entries(DOCTYPE_LABELS) as [DocType, string][]).map(([type, label]) => (
            <a
              key={type}
              href={buildHref({ category: activeCategory, type })}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                activeType === type
                  ? "border border-transparent bg-[var(--text-primary)] text-white shadow-[var(--shadow-xs)]"
                  : "border border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
              }`}
            >
              {label}
            </a>
          ))}
        </div>

        {/* View mode + category filter */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-[var(--border-default)] bg-white p-0.5 shadow-[var(--shadow-xs)]">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-md p-1.5 transition-all ${
                viewMode === "grid"
                  ? "bg-[var(--surface-selected)] text-[var(--brand-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-md p-1.5 transition-all ${
                viewMode === "list"
                  ? "bg-[var(--surface-selected)] text-[var(--brand-primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              aria-label="List view"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Category filter */}
          <div className="flex flex-wrap gap-1">
            <a
              href={buildHref({ type: activeType })}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                !activeCategory
                  ? "border border-transparent bg-[var(--brand-cta)] text-white shadow-[var(--shadow-xs)]"
                  : "border border-[var(--border-default)] bg-white text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"
              }`}
            >
              All
            </a>
            {(Object.entries(CATEGORY_LABELS) as [string, string][]).map(([cat, label]) => (
              <a
                key={cat}
                href={buildHref({ category: cat, type: activeType })}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  activeCategory === cat
                    ? "border border-transparent bg-[var(--brand-cta)] text-white shadow-[var(--shadow-xs)]"
                    : "border border-[var(--border-default)] bg-white text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]"
                }`}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      <p className="text-sm text-[var(--text-muted)]">
        <span className="font-medium text-[var(--text-primary)]">{templates.length}</span> template
        {templates.length !== 1 ? "s" : ""}
        {activeCategory ? ` in ${CATEGORY_LABELS[activeCategory as keyof typeof CATEGORY_LABELS]}` : ""}
        {activeType ? ` for ${DOCTYPE_LABELS[activeType as DocType]}` : ""}
      </p>

      {/* Grid */}
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] bg-white p-12 text-center">
          <p className="text-[var(--text-muted)]">No templates match your filters.</p>
          <a
            href="/app/settings/templates"
            className="mt-2 inline-block text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            Clear all filters
          </a>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              currentDefaults={currentDefaults}
              onSetDefault={handleSetDefault}
              onPreview={handlePreview}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <TemplateListRow
              key={template.id}
              template={template}
              currentDefaults={currentDefaults}
              onSetDefault={handleSetDefault}
              onPreview={handlePreview}
            />
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewState && (
        <TemplatePreviewModal
          template={previewState.template}
          initialDocType={previewState.docType}
          currentDefaults={currentDefaults}
          onClose={() => setPreviewState(null)}
          onSetDefault={handleSetDefault}
        />
      )}
    </div>
  );
}

// ── List view row ───────────────────────────────────────────────────

function TemplateListRow({
  template,
  currentDefaults,
  onSetDefault,
  onPreview,
}: {
  template: TemplateDefinition;
  currentDefaults: Record<DocType, string | null>;
  onSetDefault: (templateId: string, docType: DocType) => void;
  onPreview: (template: TemplateDefinition, docType: DocType) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeDocType, setActiveDocType] = useState<DocType>(template.docTypes[0]);

  const effectiveId = template.templateIdByDocType?.[activeDocType] ?? template.templateId;
  const isDefault = currentDefaults[activeDocType] === effectiveId;

  const handleUseOnce = () => {
    const path = {
      invoice: "/app/docs/invoices/new",
      voucher: "/app/docs/vouchers/new",
      "salary-slip": "/app/docs/salary-slips/new",
    }[activeDocType];
    router.push(`${path}?template=${effectiveId}`);
  };

  const handleSetDefault = () => {
    startTransition(() => {
      onSetDefault(effectiveId, activeDocType);
    });
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-xs)] transition-all hover:shadow-[var(--shadow-card)]">
      <button
        type="button"
        onClick={() => onPreview(template, activeDocType)}
        className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-[var(--surface-subtle)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
      >
        <img
          src={template.previewImage}
          alt={template.name}
          className="h-full w-full object-contain p-1"
        />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{template.name}</h3>
          {template.isPremium && (
            <span className="rounded-md bg-[var(--brand-secondary)]/10 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[var(--brand-secondary)]">
              Pro
            </span>
          )}
          {isDefault && (
            <span className="inline-flex items-center gap-1 rounded-md bg-[var(--state-success-soft)] px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[var(--state-success)]">
              <CheckCircle2 className="h-3 w-3" />
              Default
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{template.description}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {CATEGORY_LABELS[template.category]}
          </span>
          {template.docTypes.map((dt) => {
            const dtEffective = template.templateIdByDocType?.[dt] ?? template.templateId;
            const dtIsDefault = currentDefaults[dt] === dtEffective;
            return (
              <button
                key={dt}
                type="button"
                onClick={() => setActiveDocType(dt)}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.7rem] font-medium transition-all ${
                  activeDocType === dt
                    ? "border border-transparent bg-[var(--surface-accent)] text-[var(--text-accent)]"
                    : "border border-[var(--border-soft)] bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:bg-[var(--surface-selected)]"
                }`}
              >
                {DOCTYPE_LABELS[dt]}
                {dtIsDefault && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--state-success)]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={handleUseOnce}
          disabled={isPending}
          className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--surface-subtle)] disabled:opacity-50"
        >
          Use Once
        </button>
        <button
          type="button"
          onClick={handleSetDefault}
          disabled={isPending || isDefault}
          className={`rounded-lg px-3 py-2 text-xs font-medium transition-all disabled:opacity-50 ${
            isDefault
              ? "border border-[var(--state-success)]/30 bg-[var(--state-success-soft)] text-[var(--state-success)] cursor-default"
              : "border border-transparent bg-[var(--brand-cta)] text-white shadow-[var(--shadow-xs)] hover:bg-[#B91C1C]"
          }`}
        >
          {isPending ? "Saving…" : isDefault ? "Default Set" : "Set Default"}
        </button>
      </div>
    </div>
  );
}
