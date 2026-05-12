import { cn } from "@/lib/utils";

interface SettingsSectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function SettingsSectionHeader({
  title,
  description,
  action,
  className,
}: SettingsSectionHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

interface SettingsCardProps {
  children: React.ReactNode;
  className?: string;
}

export function SettingsCard({ children, className }: SettingsCardProps) {
  return (
    <div className={cn("py-6", className)}>
      {children}
    </div>
  );
}

export function SettingsCardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4", className)}>
      {children}
    </div>
  );
}

export function SettingsCardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

interface SettingsFormFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsFormField({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: SettingsFormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-[var(--text-primary)]"
      >
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-[var(--text-muted)]">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-[var(--state-danger)]">{error}</p>
      )}
    </div>
  );
}

interface SettingsSaveBarProps {
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  savedMessage?: string;
  disabled?: boolean;
}

export function SettingsSaveBar({
  saving,
  saved,
  error,
  onSave,
  onCancel,
  saveLabel = "Save changes",
  savedMessage,
  disabled,
}: SettingsSaveBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-4">
      <button
        type="submit"
        onClick={onSave}
        disabled={disabled || saving}
        className="slipwise-btn slipwise-btn-primary h-9 px-4 text-sm disabled:opacity-50"
      >
        {saving ? "Saving…" : saveLabel}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="slipwise-btn slipwise-btn-secondary h-9 px-4 text-sm"
        >
          Cancel
        </button>
      )}
      {saved && savedMessage && (
        <span className="text-sm text-[var(--state-success)]">
          {savedMessage}
        </span>
      )}
      {error && (
        <span className="text-sm text-[var(--state-danger)]">{error}</span>
      )}
    </div>
  );
}

interface SettingsReadOnlyFieldProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
}

export function SettingsReadOnlyField({ label, value, hint }: SettingsReadOnlyFieldProps) {
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-medium text-[var(--text-primary)]">{label}</span>
      <div className="rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-3 py-2 text-sm text-[var(--text-secondary)]">
        {value}
      </div>
      {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}
