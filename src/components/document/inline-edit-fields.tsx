"use client";

import type { CSSProperties, ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { cn } from "@/lib/utils";
import type { BrandingConfig } from "@/lib/branding";

const baseClass =
  "bg-transparent border-0 border-b border-transparent w-full rounded-none px-0 py-0.5 transition-all outline-none text-inherit " +
  "placeholder:text-[rgba(29,23,16,0.3)] " +
  "hover:border-b-[rgba(29,23,16,0.25)] hover:bg-[rgba(29,23,16,0.025)] " +
  "focus:border-b-[var(--voucher-accent)] focus:bg-transparent";

type FieldProps = {
  name: string;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
};

export function InlineTextField({ name, placeholder, className, readOnly }: FieldProps) {
  const { register } = useFormContext();
  return (
    <input
      type="text"
      placeholder={placeholder}
      readOnly={readOnly}
      {...register(name)}
      className={cn(baseClass, className)}
    />
  );
}

export function InlineTextArea({ name, placeholder, className, readOnly }: FieldProps & { rows?: number }) {
  const { register } = useFormContext();
  return (
    <textarea
      placeholder={placeholder}
      readOnly={readOnly}
      rows={2}
      {...register(name)}
      className={cn(baseClass, "resize-none", className)}
    />
  );
}

export function InlineNumberField({ name, placeholder, className, readOnly }: FieldProps) {
  const { register } = useFormContext();
  return (
    <input
      type="number"
      placeholder={placeholder}
      readOnly={readOnly}
      {...register(name)}
      className={cn(baseClass, "document-inline-number", className)}
    />
  );
}

export function InlineDateField({ name, placeholder, className, readOnly }: FieldProps) {
  const { register } = useFormContext();
  return (
    <input
      type="date"
      placeholder={placeholder}
      readOnly={readOnly}
      {...register(name)}
      className={cn(baseClass, "document-inline-date", className)}
    />
  );
}

type SelectOption = { value: string; label: string };

export function InlineSelectField({
  name,
  options,
  className,
}: {
  name: string;
  options: SelectOption[];
  className?: string;
}) {
  const { register } = useFormContext();
  return (
    <select
      {...register(name)}
      className={cn(
        baseClass,
        "cursor-pointer appearance-none",
        className,
      )}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export function DocumentEditorRoot({
  branding,
  children,
}: {
  branding: BrandingConfig;
  children: ReactNode;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[794px] space-y-6 bg-white p-8 text-[var(--voucher-ink)]"
      style={
        {
          "--voucher-ink": "#1d1710",
          "--voucher-accent": branding.accentColor || "#dc2626",
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
