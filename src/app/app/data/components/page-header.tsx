import Link from "next/link";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

interface PageHeaderProps {
  title: string;
  description?: string;
  addLink?: string;
  addLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  addLink,
  addLabel,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-6 space-y-4", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--text-muted)]">{description}</p>
          )}
        </div>
        {addLink && (
          <Link
            href={addLink}
            className="inline-flex items-center gap-1.5 self-start rounded-xl bg-[var(--brand-cta)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#B91C1C] shadow-[0_1px_3px_rgba(220,38,38,0.25)]"
          >
            <Plus className="h-4 w-4" />
            {addLabel || "Add New"}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}
