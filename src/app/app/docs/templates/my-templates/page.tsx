"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { getInstalledTemplates } from "../marketplace/actions";
import { cn } from "@/lib/utils";
import { Package, ExternalLink, Store } from "lucide-react";

type Tab = "installed" | "custom";

interface InstalledTemplate {
  purchaseId: string;
  templateId: string;
  revisionId: string;
  revisionVersion: string;
  displayName: string;
  description: string;
  templateType: string;
  publisherDisplayName: string;
  previewImageUrl: string;
  installedAt: string;
}

export default function MyTemplatesPage() {
  const [tab, setTab] = useState<Tab>("installed");
  const [installed, setInstalled] = useState<InstalledTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    async function load() {
      const result = await getInstalledTemplates();
      if (result.success) {
        setInstalled(result.data);
        setError(null);
      } else {
        setInstalled([]);
        setError(result.error);
      }
    }

    startTransition(() => {
      load();
    });
  }, []);

  return (
    <div className="slipwise-shell-bg min-h-screen">
      <div className="mx-auto max-w-[80rem] px-3 py-5 sm:px-4 lg:px-5 lg:py-7 space-y-6">
        {/* Header */}
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.34em] text-[var(--text-muted)]">
            Template Library
          </p>
          <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.04em] text-[var(--text-primary)] md:text-[2.4rem]">
            My Templates
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
            Manage your installed marketplace templates and custom templates. Set defaults or create documents directly from here.
          </p>
        </div>

        {/* Tabs + marketplace link */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 rounded-xl border border-[var(--border-default)] bg-white p-1 shadow-[var(--shadow-xs)]">
            {(["installed", "custom"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium capitalize transition-all",
                  tab === t
                    ? "bg-[var(--text-primary)] text-white shadow-[var(--shadow-xs)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <Link
            href="/app/docs/templates/marketplace"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-default)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--surface-subtle)]"
          >
            <Store className="h-3.5 w-3.5" />
            Browse Marketplace
          </Link>
        </div>

        {tab === "installed" && (
          <div>
            {error ? (
              <div className="rounded-xl border border-[var(--state-danger)]/20 bg-[var(--state-danger-soft)] px-5 py-4 text-sm text-[var(--state-danger)]">
                {error}
              </div>
            ) : isPending ? (
              <div className="flex items-center justify-center py-20 text-[var(--text-muted)]">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--brand-primary)]" />
                  <span className="text-sm">Loading installed templates...</span>
                </div>
              </div>
            ) : installed.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-white p-12 text-center">
                <Package className="mx-auto h-10 w-10 text-[var(--text-muted)]" />
                <p className="mt-4 text-[var(--text-secondary)]">No installed templates yet.</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Browse the{" "}
                  <Link
                    href="/app/docs/templates/marketplace"
                    className="font-medium text-[var(--brand-primary)] hover:underline"
                  >
                    marketplace
                  </Link>{" "}
                  to discover professional templates.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {installed.map((item) => (
                  <div
                    key={item.purchaseId}
                    className="group rounded-2xl border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-lg)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          {item.displayName}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--text-secondary)] line-clamp-2">
                          {item.description}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-[var(--border-soft)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {item.templateType}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-xs text-[var(--text-secondary)]">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Publisher</span>
                        <span className="font-medium text-[var(--text-primary)]">{item.publisherDisplayName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Revision</span>
                        <span>v{item.revisionVersion}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-muted)]">Installed</span>
                        <span>{new Date(item.installedAt).toLocaleDateString("en-IN")}</span>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <Link
                        href={`/app/docs/templates/marketplace?template=${item.templateId}`}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-primary)] shadow-[var(--shadow-xs)] transition-all hover:bg-[var(--surface-subtle)]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        View in Store
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "custom" && (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-white p-12 text-center">
            <p className="text-[var(--text-secondary)]">Custom templates coming soon.</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              You can{" "}
              <Link
                href="/app/docs/templates/publish"
                className="font-medium text-[var(--brand-primary)] hover:underline"
              >
                publish
              </Link>{" "}
              your own templates to the marketplace.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
