"use client";

import Link from "next/link";
import type { SVGProps } from "react";
import type { ProductModule } from "@/lib/modules";

type ModuleCardProps = {
  module: ProductModule;
};

type IconProps = SVGProps<SVGSVGElement>;

function VoucherIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M5 6h14a2 2 0 0 1 2 2v2a2.5 2.5 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2.5 2.5 0 0 0 0-4V8a2 2 0 0 1 2-2Z" />
      <path d="M9 10h6" />
      <path d="M9 14h4" />
    </svg>
  );
}

function SalaryIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M8 10h8" />
      <path d="M8 14h5" />
      <circle cx="17" cy="15.5" r="1.5" />
    </svg>
  );
}

function InvoiceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <path d="M7 3h8l4 4v14H7z" />
      <path d="M15 3v4h4" />
      <path d="M10 12h6" />
      <path d="M10 16h6" />
    </svg>
  );
}

function PdfStudioIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <path d="M13 17h8" />
      <path d="M17 13v8" />
    </svg>
  );
}

export function ModuleCard({ module }: ModuleCardProps) {
  const Icon =
    module.slug === "voucher"
      ? VoucherIcon
      : module.slug === "salary-slip"
        ? SalaryIcon
        : module.slug === "pdf-studio"
          ? PdfStudioIcon
          : InvoiceIcon;

  return (
    <article
      data-animate="generator-card"
      className="group relative overflow-hidden rounded-xl border border-[var(--border-strong)] bg-white p-6 transition-colors hover:border-[var(--border-brand)]"
    >
      <div className="relative flex h-full flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] text-[var(--accent)]">
              <Icon className="h-5 w-5" />
            </span>
            <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-[var(--muted-foreground)]">
              {module.eyebrow}
            </p>
            <h3 className="mt-3 text-[1.38rem] leading-[1.08] tracking-[-0.04em] text-[var(--foreground)] md:text-[1.52rem]">
              {module.name}
            </h3>
          </div>
        </div>

        <p className="max-w-sm text-[0.95rem] leading-7 text-[var(--foreground-soft)]">
          {module.description}
        </p>

        <ul className="space-y-2 text-[0.95rem] text-[var(--foreground-soft)]">
          {module.highlights.map((highlight) => (
            <li key={highlight} className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--muted-foreground)]" />
              {highlight}
            </li>
          ))}
        </ul>

        <Link
          href={module.href}
          className="slipwise-btn slipwise-btn-primary mt-auto w-fit gap-2 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          Open workspace
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </article>
  );
}
