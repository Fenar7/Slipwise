import { Users, Plus } from "lucide-react";
import Link from "next/link";

export function ClientWorkspaceEmpty() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border-default)] bg-white px-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[var(--text-muted)]">
        <Users className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">
        No clients yet
      </h3>
      <p className="mt-1 max-w-sm text-sm text-[var(--text-muted)]">
        Get started by adding your first client. You can also import a list in
        bulk.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/app/data/customers/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--brand-cta)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#B91C1C] shadow-[0_1px_3px_rgba(220,38,38,0.25)]"
        >
          <Plus className="h-4 w-4" />
          Add Client
        </Link>
        <Link
          href="/app/data/customers"
          className="inline-flex items-center rounded-xl border border-[var(--border-default)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
        >
          Import
        </Link>
      </div>
    </div>
  );
}
