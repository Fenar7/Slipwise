"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft, X } from "lucide-react";
import { SettingsNav } from "./settings-nav";
import { getSettingsContext } from "./settings-registry";

export function SettingsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { entry, group } = useMemo(() => getSettingsContext(pathname), [pathname]);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Mobile header */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] px-4 py-4 lg:hidden">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {group?.label ?? "Workspace settings"}
          </p>
          <h1 className="truncate text-lg font-semibold text-[var(--text-primary)]">
            {entry?.label ?? "Settings"}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          className="inline-flex items-center justify-center rounded-md border border-[var(--border-soft)] bg-white px-3 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-subtle)]"
        >
          {mobileNavOpen ? <X className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          <span className="ml-2">{mobileNavOpen ? "Close" : "Menu"}</span>
        </button>
      </div>

      {mobileNavOpen ? (
        <div className="border-b border-[var(--border-soft)] bg-white lg:hidden">
          <SettingsNav onNavigate={() => setMobileNavOpen(false)} />
        </div>
      ) : null}

      <div className="flex min-h-[calc(100vh-var(--topbar-height)-1px)]">
        {/* Left nav */}
        <aside className="hidden w-[260px] shrink-0 border-r border-[var(--border-soft)] lg:block">
          <div className="sticky top-[var(--topbar-height)] max-h-[calc(100vh-var(--topbar-height))] overflow-y-auto">
            <SettingsNav />
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <div className="px-6 py-8 sm:px-8">
            {/* Page header */}
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                {group?.label ?? "Workspace settings"}
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                {entry?.label ?? "Settings"}
              </h1>
              {entry?.description && (
                <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
                  {entry.description}
                </p>
              )}
            </div>

            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
