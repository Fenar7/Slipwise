"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type FormSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
};

export function FormSection({
  title,
  description,
  children,
  defaultOpen = true,
  icon,
}: FormSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[var(--border-soft)]">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-start justify-between py-4 text-left group"
      >
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="mt-0.5 shrink-0 text-[var(--brand-cta)]">
              {icon}
            </span>
          ) : null}
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              {title}
            </h3>
            {description && !isOpen ? (
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        <svg
          className={cn(
            "mt-1 h-4 w-4 text-[var(--text-muted)] transition-transform shrink-0",
            isOpen ? "rotate-180" : ""
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen ? (
        <div className="pb-6">
          {description && isOpen ? (
            <p className="mb-4 text-xs text-[var(--text-muted)]">
              {description}
            </p>
          ) : null}
          <div className="space-y-4">{children}</div>
        </div>
      ) : null}
    </div>
  );
}