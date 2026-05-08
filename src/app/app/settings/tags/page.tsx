"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  listTagsWithUsage,
  renameTag,
  archiveTag,
  unarchiveTag,
  type TagManagementRow,
} from "./actions";
import { formatCurrency } from "@/features/intel/components/report-data-table";

export default function TagManagementPage() {
  const [isPending, startTransition] = useTransition();
  const [tags, setTags] = useState<TagManagementRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchTags = useCallback(() => {
    startTransition(async () => {
      try {
        const result = await listTagsWithUsage();
        setTags(result);
        setLoaded(true);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load tags");
        setLoaded(true);
      }
    });
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const handleArchive = (id: string) => {
    startTransition(async () => {
      await archiveTag(id);
      fetchTags();
    });
  };

  const handleUnarchive = (id: string) => {
    startTransition(async () => {
      await unarchiveTag(id);
      fetchTags();
    });
  };

  const handleRename = (id: string) => {
    if (!renameValue.trim()) return;
    startTransition(async () => {
      await renameTag(id, { name: renameValue });
      setRenamingId(null);
      setRenameValue("");
      fetchTags();
    });
  };

  const filtered = tags.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase())
  );

  const active = filtered.filter((t) => !t.isArchived);
  const archived = filtered.filter((t) => t.isArchived);

  return (
    <div className="min-h-screen">
      <header className="mb-6">
        <Link
          href="/app/settings"
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
        >
          ← Settings
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)]">
          Tag Management
        </h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Manage your organisation&apos;s tag vocabulary. Rename, archive, and review usage.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags..."
          className="w-full max-w-sm rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
      </div>

      {isPending && !loaded ? (
        <div className="flex items-center justify-center py-20 text-[var(--muted-foreground)]">
          Loading…
        </div>
      ) : (
        <div className={isPending ? "opacity-60" : ""}>
          {/* Active tags */}
          <TagTable
            title={`Active Tags (${active.length})`}
            tags={active}
            renamingId={renamingId}
            renameValue={renameValue}
            onRenameStart={(id, name) => { setRenamingId(id); setRenameValue(name); }}
            onRenameCancel={() => { setRenamingId(null); setRenameValue(""); }}
            onRenameChange={setRenameValue}
            onRenameSubmit={handleRename}
            onArchive={handleArchive}
            onUnarchive={handleUnarchive}
          />

          {/* Archived tags */}
          {archived.length > 0 && (
            <div className="mt-8">
              <TagTable
                title={`Archived Tags (${archived.length})`}
                tags={archived}
                renamingId={renamingId}
                renameValue={renameValue}
                onRenameStart={(id, name) => { setRenamingId(id); setRenameValue(name); }}
                onRenameCancel={() => { setRenamingId(null); setRenameValue(""); }}
                onRenameChange={setRenameValue}
                onRenameSubmit={handleRename}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
              />
            </div>
          )}

          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] p-12 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">
                {search ? "No tags matching your search." : "No tags defined in your organisation yet."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TagTable({
  title,
  tags,
  renamingId,
  renameValue,
  onRenameStart,
  onRenameCancel,
  onRenameChange,
  onRenameSubmit,
  onArchive,
  onUnarchive,
}: {
  title: string;
  tags: TagManagementRow[];
  renamingId: string | null;
  renameValue: string;
  onRenameStart: (id: string, name: string) => void;
  onRenameCancel: () => void;
  onRenameChange: (v: string) => void;
  onRenameSubmit: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
}) {
  if (tags.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">{title}</h2>
      <div className="rounded-xl border border-[var(--border-soft)] bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-soft)]">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Tag</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Invoices</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Vouchers</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Total</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Defaults</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id} className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--surface-soft)] transition-colors">
                <td className="px-4 py-3">
                  {renamingId === tag.id ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); onRenameSubmit(tag.id); }}
                      className="flex items-center gap-2"
                    >
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={(e) => onRenameChange(e.target.value)}
                        className="h-8 rounded border border-[var(--border-soft)] px-2 text-sm focus:border-[var(--accent)] focus:outline-none"
                      />
                      <button type="submit" className="text-xs text-[var(--accent)] hover:underline">Save</button>
                      <button type="button" onClick={onRenameCancel} className="text-xs text-[var(--muted-foreground)] hover:underline">Cancel</button>
                    </form>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      {tag.color && (
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                      )}
                      <span className={`font-medium ${tag.isArchived ? "opacity-50 line-through" : ""}`}>
                        {tag.name}
                      </span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--muted-foreground)]">{tag.invoiceUsageCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--muted-foreground)]">{tag.voucherUsageCount}</td>
                <td className="px-4 py-3 text-right tabular-nums font-medium">{tag.totalUsageCount}</td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--muted-foreground)]">
                  {tag.customerDefaultCount + tag.vendorDefaultCount > 0
                    ? `${tag.customerDefaultCount + tag.vendorDefaultCount}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {!tag.isArchived && (
                      <>
                        <button
                          onClick={() => onRenameStart(tag.id, tag.name)}
                          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => {
                            if (tag.totalUsageCount >= 10) {
                              const ok = window.confirm(
                                `"${tag.name}" is used on ${tag.totalUsageCount} document${tag.totalUsageCount !== 1 ? "s" : ""}. Archiving will prevent future selection but preserve existing assignments. Continue?`
                              );
                              if (!ok) return;
                            }
                            onArchive(tag.id);
                          }}
                          className="text-xs text-amber-600 hover:text-amber-800"
                        >
                          Archive
                        </button>
                      </>
                    )}
                    {tag.isArchived && (
                      <button
                        onClick={() => onUnarchive(tag.id)}
                        className="text-xs text-emerald-600 hover:text-emerald-800"
                      >
                        Unarchive
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
