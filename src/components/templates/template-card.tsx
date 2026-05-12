"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { TemplateDefinition, DocType } from "@/lib/docs/templates/registry";
import { DOCTYPE_LABELS, CATEGORY_LABELS, getEffectiveTemplateId } from "@/lib/docs/templates/registry";
import { CheckCircle2, Eye, Star, FileText } from "lucide-react";

const DOC_NEW_PATHS: Record<DocType, string> = {
  invoice: "/app/docs/invoices/new",
  voucher: "/app/docs/vouchers/new",
  "salary-slip": "/app/docs/salary-slips/new",
};

export interface TemplateCardProps {
  template: TemplateDefinition;
  currentDefaults: Record<DocType, string | null>;
  onSetDefault?: (templateId: string, docType: DocType) => void;
  onPreview?: (template: TemplateDefinition, docType: DocType) => void;
  size?: "default" | "compact";
}

export function TemplateCard({
  template,
  currentDefaults,
  onSetDefault,
  onPreview,
  size = "default",
}: TemplateCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeDocType, setActiveDocType] = useState<DocType>(template.docTypes[0]);

  const effectiveId = getEffectiveTemplateId(template, activeDocType);
  const isDefault = currentDefaults[activeDocType] === effectiveId;

  const handleUseOnce = () => {
    const path = DOC_NEW_PATHS[activeDocType];
    router.push(`${path}?template=${effectiveId}`);
  };

  const handleSetDefault = () => {
    startTransition(() => {
      onSetDefault?.(effectiveId, activeDocType);
    });
  };

  const handlePreview = () => {
    onPreview?.(template, activeDocType);
  };

  const isCompact = size === "compact";

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border border-[var(--border-default)] bg-white transition-colors duration-200",
        "hover:border-[var(--border-strong)]"
      )}
    >
      {/* Preview thumbnail */}
      <button
        type="button"
        onClick={handlePreview}
        className={cn(
          "relative w-full overflow-hidden bg-[var(--surface-subtle)] border-b border-[var(--border-soft)] cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
          isCompact ? "h-36" : "h-48"
        )}
        aria-label={`Preview ${template.name}`}
      >
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-[120px] overflow-hidden rounded-sm border border-[var(--border-soft)] bg-white">
            <Image
              src={template.previewImage}
              alt={template.name}
              width={120}
              height={156}
              className="w-full h-auto"
              unoptimized
            />
          </div>
        </div>

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
          {isDefault && (
            <div className="inline-flex items-center gap-1 rounded-sm bg-[var(--state-success)] px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-white">
              <CheckCircle2 className="h-3 w-3" />
              Default
            </div>
          )}
          {template.isPremium && (
            <div className="inline-flex items-center gap-1 rounded-sm bg-[var(--brand-secondary)] px-2 py-1 text-[0.6rem] font-bold uppercase tracking-wider text-white">
              <Star className="h-3 w-3" />
              Pro
            </div>
          )}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-white/95 text-[var(--text-primary)]">
            <Eye className="h-4 w-4" />
          </div>
          <span className="text-xs font-semibold text-white drop-shadow-md">Preview</span>
        </div>
      </button>

      {/* Info */}
      <div className={cn("flex flex-1 flex-col", isCompact ? "p-3" : "p-4")}>
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <h3 className={cn("font-semibold text-[var(--text-primary)]", isCompact ? "text-xs" : "text-sm")}>
            {template.name}
          </h3>
          <span className="shrink-0 rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {CATEGORY_LABELS[template.category]}
          </span>
        </div>

        <p className={cn("text-[var(--text-secondary)] line-clamp-2", isCompact ? "text-[0.7rem] leading-4 mb-2" : "text-xs leading-5 mb-3")}>
          {template.description}
        </p>

        {/* Doc type chips */}
        <div className="mb-3 flex flex-wrap gap-1">
          {template.docTypes.map((dt) => {
            const dtEffective = getEffectiveTemplateId(template, dt);
            const dtIsDefault = currentDefaults[dt] === dtEffective;
            return (
              <button
                key={dt}
                type="button"
                onClick={() => setActiveDocType(dt)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[0.7rem] font-medium transition-all",
                  activeDocType === dt
                    ? "border border-transparent bg-[var(--surface-accent)] text-[var(--text-accent)]"
                    : "border border-[var(--border-soft)] bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:bg-[var(--surface-selected)]"
                )}
              >
                <FileText className="h-3 w-3" />
                {DOCTYPE_LABELS[dt]}
                {dtIsDefault && (
                  <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[var(--state-success)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tags */}
        <div className="mb-3 flex flex-wrap gap-1">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[0.65rem] text-[var(--text-muted)]">
              #{tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-auto flex gap-2">
          <button
            type="button"
            onClick={handleUseOnce}
            disabled={isPending}
            className="flex-1 rounded-md border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)] disabled:opacity-50"
          >
            Use Once
          </button>
          <button
            type="button"
            onClick={handleSetDefault}
            disabled={isPending || isDefault}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50",
              isDefault
                ? "border border-[var(--state-success)]/30 bg-[var(--state-success-soft)] text-[var(--state-success)] cursor-default"
                : "border border-transparent bg-[var(--brand-cta)] text-white hover:bg-[#B91C1C]"
            )}
          >
            {isPending ? "Saving…" : isDefault ? "Default Set" : "Set Default"}
          </button>
        </div>
      </div>
    </div>
  );
}
