import Link from "next/link";
import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface QuickActionCardProps {
  href: string;
  label: string;
  description?: string;
  icon?: LucideIcon;
  variant?: "default" | "featured" | "subtle";
  className?: string;
}

export function QuickActionCard({
  href,
  label,
  description,
  icon: Icon,
  variant = "default",
  className,
}: QuickActionCardProps) {
  const variantStyles = {
    default:
      "bg-[var(--surface-panel)] border border-[var(--border-soft)] text-[var(--text-primary)] hover:border-[var(--border-default)] hover:bg-[var(--surface-subtle)]",
    featured:
      "bg-[var(--brand-primary)] text-white border border-[var(--brand-primary)] hover:opacity-90 shadow-md",
    subtle:
      "bg-[var(--surface-subtle)] border border-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-selected)] hover:text-[var(--text-primary)]",
  };

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
        variantStyles[variant],
        className
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors",
            variant === "featured"
              ? "bg-white/15 text-white"
              : "bg-[var(--surface-subtle)] text-[var(--text-muted)] group-hover:bg-[var(--surface-selected)] group-hover:text-[var(--brand-primary)]"
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0">
        <p className="font-semibold leading-tight">{label}</p>
        {description && (
          <p
            className={cn(
              "mt-0.5 text-xs leading-tight",
              variant === "featured" ? "text-white/70" : "text-[var(--text-muted)]"
            )}
          >
            {description}
          </p>
        )}
      </div>
    </Link>
  );
}
