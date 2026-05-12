"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import {
  getSettingsVisibleEntries,
  searchSettingsEntries,
  settingsGroups,
} from "@/components/settings/settings-registry";

export default function SettingsPage() {
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
    <div className="space-y-8">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search settings"
          className="w-full rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-10 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--focus-ring)]"
        />
      </div>

      <div className="space-y-8">
        {visibleGroups.map((group) => {
          const GroupIcon = group.icon;
          return (
            <section key={group.id}>
              <div className="mb-3 flex items-center gap-2">
                <GroupIcon className="h-4 w-4 text-[var(--text-muted)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {group.label}
                </h3>
              </div>
              <div className="divide-y divide-[var(--border-soft)] border-t border-[var(--border-soft)]">
                {group.entries.map((entry) => {
                  const EntryIcon = entry.icon;
                  return (
                    <Link
                      key={entry.id}
                      href={entry.href}
                      className="group flex items-center justify-between gap-4 py-3 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <EntryIcon className="h-4 w-4 text-[var(--text-muted)] group-hover:text-[var(--brand-primary)]" />
                        <span className="text-sm font-medium text-[var(--text-primary)] group-hover:text-[var(--brand-primary)]">
                          {entry.label}
                        </span>
                        {entry.statusBadge ? (
                          <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-[var(--text-muted)]">
                            {entry.statusBadge}
                          </span>
                        ) : null}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
