"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateOrgDefaults } from "@/app/app/actions/org-defaults-actions";
import type { TemplateDefinition, DocType } from "@/lib/docs/templates/registry";
import { DOCTYPE_LABELS, CATEGORY_LABELS, getEffectiveTemplateId } from "@/lib/docs/templates/registry";
import { TemplatePreviewModal } from "@/components/templates/template-preview-modal";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  RotateCcw,
  Eye,
  FileText,
  ChevronDown,
  AlertCircle,
  Sparkles,
} from "lucide-react";

interface DefaultTemplatesClientProps {
  currentDefaults: Record<DocType, string | null>;
  slipwiseDefaults: Record<DocType, string>;
  allTemplates: TemplateDefinition[];
}

type PreviewState = { template: TemplateDefinition; docType: DocType } | null;

const DOC_TYPE_DEFAULT_KEY: Record<DocType, "defaultInvoiceTemplate" | "defaultVoucherTemplate" | "defaultSlipTemplate"> = {
  invoice: "defaultInvoiceTemplate",
  voucher: "defaultVoucherTemplate",
  "salary-slip": "defaultSlipTemplate",
};

const DOC_TYPE_META: Record<DocType, { label: string; description: string; icon: React.ElementType; color: string }> = {
  invoice: {
    label: "Invoice",
    description: "Default template used when creating new invoices",
    icon: FileText,
    color: "text-blue-600 bg-blue-50 border-blue-200",
  },
  voucher: {
    label: "Voucher",
    description: "Default template used when creating new vouchers",
    icon: FileText,
    color: "text-amber-600 bg-amber-50 border-amber-200",
  },
  "salary-slip": {
    label: "Salary Slip",
    description: "Default template used when creating new salary slips",
    icon: FileText,
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
  },
};

export function DefaultTemplatesClient({
  currentDefaults,
  slipwiseDefaults,
  allTemplates,
}: DefaultTemplatesClientProps) {
  const router = useRouter();
  const [previewState, setPreviewState] = useState<PreviewState>(null);
  const [openSelector, setOpenSelector] = useState<DocType | null>(null);
  const [saving, setSaving] = useState<DocType | null>(null);

  const handleSetDefault = async (templateId: string, docType: DocType) => {
    setSaving(docType);
    const result = await updateOrgDefaults({ [DOC_TYPE_DEFAULT_KEY[docType]]: templateId });
    if (result.success) {
      toast.success(`${DOCTYPE_LABELS[docType]} default updated`);
      router.refresh();
      setOpenSelector(null);
    } else {
      toast.error("Failed to update default template");
    }
    setSaving(null);
  };

  const handleResetToSlipwise = async (docType: DocType) => {
    setSaving(docType);
    const result = await updateOrgDefaults({ [DOC_TYPE_DEFAULT_KEY[docType]]: slipwiseDefaults[docType] });
    if (result.success) {
      toast.success(`${DOCTYPE_LABELS[docType]} default reset to Slipwise default`);
      router.refresh();
      setOpenSelector(null);
    } else {
      toast.error("Failed to reset default template");
    }
    setSaving(null);
  };

  const getCurrentTemplate = (docType: DocType) => {
    const defaultId = currentDefaults[docType];
    if (!defaultId) return null;
    return allTemplates.find((t) =>
      t.docTypes.includes(docType) &&
      (t.templateId === defaultId || t.templateIdByDocType?.[docType] === defaultId)
    );
  };

  const getAvailableTemplates = (docType: DocType) => {
    return allTemplates.filter((t) => t.docTypes.includes(docType));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
          Document Templates
        </p>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Default Templates
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
          Choose which template loads automatically for each document type. Slipwise defaults are pre-selected; your choices override them for your organization.
        </p>
      </div>

      {/* Status summary */}
      <div className="rounded-lg border border-[var(--border-default)] bg-white p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-[var(--brand-primary)]" />
          <p className="text-sm font-medium text-[var(--text-primary)]">Default Status</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(DOCTYPE_LABELS) as [DocType, string][]).map(([type, label]) => {
            const current = currentDefaults[type];
            const slipwise = slipwiseDefaults[type];
            const isOrgOverride = current !== null && current !== slipwise;
            const isSlipwiseDefault = current === slipwise;
            const hasNoDefault = current === null;

            return (
              <div
                key={type}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2",
                  isOrgOverride
                    ? "border-[var(--brand-primary)]/20 bg-[var(--surface-selected)]"
                    : hasNoDefault
                    ? "border-[var(--border-soft)] bg-[var(--surface-subtle)]"
                    : "border-[var(--state-success)]/20 bg-[var(--state-success-soft)]"
                )}
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {label}
                </span>
                {hasNoDefault ? (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <AlertCircle className="h-3 w-3" />
                    Not set
                  </span>
                ) : isOrgOverride ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand-primary)]">
                    <CheckCircle2 className="h-3 w-3" />
                    Org selected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--state-success)]">
                    <CheckCircle2 className="h-3 w-3" />
                    Slipwise default
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Document type selectors */}
      <div className="space-y-4">
        {(Object.entries(DOC_TYPE_META) as [DocType, typeof DOC_TYPE_META["invoice"]][]).map(([docType, meta]) => {
          const Icon = meta.icon;
          const currentTemplate = getCurrentTemplate(docType);
          const available = getAvailableTemplates(docType);
          const isOpen = openSelector === docType;
          const isSlipwise = currentDefaults[docType] === slipwiseDefaults[docType];
          const hasDefault = currentDefaults[docType] !== null;

          return (
            <div
              key={docType}
              className={cn(
                "rounded-xl border bg-white shadow-[var(--shadow-card)] transition-all",
                isOpen ? "border-[var(--border-brand)]" : "border-[var(--border-default)]"
              )}
            >
              {/* Card header */}
              <div className="flex items-center gap-4 p-4 sm:p-5">
                <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", meta.color)}>
                  <Icon className="h-5 w-5" />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{meta.label}</h3>
                    {hasDefault ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider",
                          isSlipwise
                            ? "bg-[var(--state-success-soft)] text-[var(--state-success)]"
                            : "bg-[var(--surface-accent)] text-[var(--text-accent)]"
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {isSlipwise ? "Slipwise Default" : "Org Override"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                        <AlertCircle className="h-3 w-3" />
                        Not Set
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{meta.description}</p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {currentTemplate && (
                    <button
                      type="button"
                      onClick={() => setPreviewState({ template: currentTemplate, docType })}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--surface-subtle)]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpenSelector(isOpen ? null : docType)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-medium shadow-[var(--shadow-xs)] transition-all",
                      isOpen
                        ? "border border-[var(--border-brand)] bg-[var(--surface-selected)] text-[var(--brand-primary)]"
                        : "border border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                    )}
                  >
                    {isOpen ? "Close" : "Change"}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
                  </button>
                </div>
              </div>

              {/* Current default display */}
              {currentTemplate && (
                <div className="mx-4 mb-4 rounded-lg border border-[var(--border-soft)] bg-[var(--surface-subtle)]/50 p-3 sm:mx-5">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-white shadow-sm">
                      <img
                        src={currentTemplate.previewImage}
                        alt={currentTemplate.name}
                        className="h-full w-full object-contain p-1"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[var(--text-primary)]">{currentTemplate.name}</p>
                      <p className="text-xs text-[var(--text-secondary)]">{currentTemplate.description}</p>
                    </div>
                    {!isSlipwise && (
                      <button
                        type="button"
                        onClick={() => handleResetToSlipwise(docType)}
                        disabled={saving === docType}
                        className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--surface-subtle)] disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset to Slipwise
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Selector dropdown */}
              {isOpen && (
                <div className="border-t border-[var(--border-soft)] p-4 sm:p-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
                    Select a default {meta.label} template
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {available.map((template) => {
                      const effectiveId = getEffectiveTemplateId(template, docType);
                      const isSelected = currentDefaults[docType] === effectiveId;
                      const isSlipwiseDefault = slipwiseDefaults[docType] === effectiveId;

                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => handleSetDefault(effectiveId, docType)}
                          disabled={saving === docType || isSelected}
                          className={cn(
                            "flex items-start gap-3 rounded-lg border p-3 text-left transition-all",
                            isSelected
                              ? "border-[var(--state-success)] bg-[var(--state-success-soft)]"
                              : "border-[var(--border-default)] bg-white hover:border-[var(--border-brand)] hover:shadow-[var(--shadow-card)]"
                          )}
                        >
                          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-[var(--surface-subtle)]">
                            <img
                              src={template.previewImage}
                              alt={template.name}
                              className="h-full w-full object-contain p-1"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium text-[var(--text-primary)]">{template.name}</p>
                              {isSelected && (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--state-success)]" />
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-2">
                              {template.description}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                              <span className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                                {CATEGORY_LABELS[template.category]}
                              </span>
                              {isSlipwiseDefault && (
                                <span className="rounded-md bg-[var(--state-success-soft)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--state-success)]">
                                  Slipwise Default
                                </span>
                              )}
                              {template.isPremium && (
                                <span className="rounded-md bg-[var(--brand-secondary)]/10 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--brand-secondary)]">
                                  Pro
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
