import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, label, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={id}
            className="text-[0.75rem] font-semibold text-[var(--foreground)]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--accent)]",
            error ? "border-red-500" : "border-[var(--border-strong)]",
            "disabled:bg-[var(--surface-soft)] disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-[var(--state-danger)]">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";
