import { cn } from "@/lib/utils";

/* Standard finance input styling used across Books forms */
export const financeInputClassName =
  "w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]";

interface FormFieldProps {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}

export function FormField({ label, error, hint, children, className, required }: FormFieldProps) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
        {label}
        {required && <span className="text-[var(--state-danger)]">*</span>}
      </span>
      {children}
      {error && <p className="mt-1.5 text-xs font-medium text-[var(--state-danger)]">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-[var(--text-muted)]">{hint}</p>}
    </label>
  );
}

interface FormGridProps {
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
  gap?: "normal" | "tight";
}

export function FormGrid({ children, columns = 2, className, gap = "normal" }: FormGridProps) {
  const colClasses = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <div
      className={cn(
        "grid",
        colClasses[columns],
        gap === "normal" ? "gap-4" : "gap-3",
        className
      )}
    >
      {children}
    </div>
  );
}

interface FormSectionProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {(title || description) && (
        <div>
          {title && <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>}
          {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

interface FormActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function FormActions({ children, className }: FormActionsProps) {
  return (
    <div className={cn("flex items-center justify-end gap-3 pt-2", className)}>
      {children}
    </div>
  );
}
