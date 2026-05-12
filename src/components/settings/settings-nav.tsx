"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSettingsVisibleEntries,
  isSettingsHrefActive,
  searchSettingsEntries,
  settingsGroups,
  type SettingsRouteEntry,
} from "./settings-registry";

interface SettingsNavProps {
  onNavigate?: () => void;
}

function SettingsNavItem({
  item,
  isActive,
  onNavigate,
}: {
  item: SettingsRouteEntry;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-[var(--surface-subtle)] font-medium text-[var(--text-primary)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0",
          isActive
            ? "text-[var(--text-secondary)]"
            : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
        )}
      />
      <span className="truncate">{item.label}</span>
      {item.statusBadge ? (
        <span className="ml-auto shrink-0 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
          {item.statusBadge}
        </span>
      ) : null}
    </Link>
  );
}

export function SettingsNav({ onNavigate }: SettingsNavProps) {
  const pathname = usePathname();
  const [searchQuery, setSearchQuery] = useState("");

  const matchedIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return new Set(searchSettingsEntries(searchQuery).map((entry) => entry.id));
  }, [searchQuery]);

  const visibleGroups = useMemo(() => {
    return settingsGroups
      .map((group) => {
        const entries = getSettingsVisibleEntries(group.id);
        const filteredEntries = matchedIds
          ? entries.filter((entry) => matchedIds.has(entry.id))
          : entries;
        if (filteredEntries.length === 0) return null;
        return { ...group, entries: filteredEntries };
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group));
  }, [matchedIds]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pb-3 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            placeholder="Search settings"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="w-full rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-8 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
          />
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {visibleGroups.map((group) => (
          <div key={group.id}>
            <div className="mb-1 px-3 py-1.5">
              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                {group.label}
              </span>
            </div>
            <ul className="space-y-0.5">
              {group.entries.map((item) => {
                const isActive = isSettingsHrefActive(pathname, item.href);
                return (
                  <li key={item.id}>
                    <SettingsNavItem
                      item={item}
                      isActive={isActive}
                      onNavigate={onNavigate}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}
