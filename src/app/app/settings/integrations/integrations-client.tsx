"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardContent,
} from "@/components/settings/settings-primitives";
import { useActiveOrg } from "@/hooks/use-active-org";
import { Plug, Zap, Webhook, ArrowRight } from "lucide-react";

interface IntegrationStatus {
  provider: string;
  isActive: boolean;
  lastSyncAt: string | null;
  tokenExpiresAt: string | null;
  externalOrgId: string | null;
  connectionStatus: string;
  lastSyncAttemptAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  syncedCount: number | null;
  attemptedCount: number | null;
}

export default function IntegrationsClient() {
  const { activeOrg } = useActiveOrg();
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadIntegrations() {
      if (!activeOrg) {
        setIntegrations([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/integrations/status", {
          cache: "no-store",
        });
        if (!res.ok || cancelled) {
          return;
        }
        const data = (await res.json()) as IntegrationStatus[];
        if (!cancelled) {
          setIntegrations(data);
        }
      } catch {
        if (!cancelled) {
          setIntegrations([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadIntegrations();

    return () => {
      cancelled = true;
    };
  }, [activeOrg]);

  function getStatus(provider: string): IntegrationStatus | undefined {
    return integrations.find((i) => i.provider === provider);
  }

  async function handleSync(provider: string) {
    setSyncing(provider);
    try {
      await fetch(`/api/integrations/${provider}/sync`, { method: "POST" });
      const res = await fetch("/api/integrations/status", { cache: "no-store" });
      if (res.ok) {
        setIntegrations((await res.json()) as IntegrationStatus[]);
      }
    } finally {
      setSyncing(null);
    }
  }

  async function handleDisconnect(provider: string) {
    try {
      await fetch(`/api/integrations/${provider}/disconnect`, {
        method: "DELETE",
      });
      const res = await fetch("/api/integrations/status", { cache: "no-store" });
      if (res.ok) {
        setIntegrations((await res.json()) as IntegrationStatus[]);
      }
    } catch {
      // Disconnect failed
    }
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleString();
  }

  function formatSyncSummary(status: IntegrationStatus | undefined): string {
    if (!status?.lastSyncStatus) {
      return "No sync attempts recorded yet.";
    }

    const countSummary =
      status.attemptedCount != null && status.syncedCount != null
        ? ` (${status.syncedCount}/${status.attemptedCount} invoices synced)`
        : "";

    return `${status.lastSyncStatus.replaceAll("_", " ")}${countSummary}`;
  }

  if (loading) {
    return (
      <div className="slipwise-panel p-6">
        <p className="text-sm text-[var(--text-muted)]">Loading integrations…</p>
      </div>
    );
  }

  const integrationsList = [
    {
      key: "tally",
      title: "Tally Prime",
      description: "Import/export invoices and vouchers with Tally ERP 9 / Prime.",
      badge: "Import & Export",
      badgeColor: "bg-[var(--state-info-soft)] text-[var(--state-info)]",
      icon: Plug,
      href: "/app/settings/integrations/tally",
      isConnected: false,
    },
    {
      key: "zapier",
      title: "Zapier",
      description: "Connect Slipwise to 6,000+ apps via Zapier polling triggers.",
      badge: "API Key",
      badgeColor: "bg-orange-50 text-orange-700",
      icon: Zap,
      href: "/app/settings/developer/tokens",
      isConnected: false,
    },
    {
      key: "make",
      title: "Make.com (Integromat)",
      description: "Receive instant webhook events in Make.com scenarios.",
      badge: "Webhook",
      badgeColor: "bg-purple-50 text-purple-700",
      icon: Webhook,
      href: "/app/settings/developer/webhooks/v2",
      isConnected: false,
    },
    {
      key: "quickbooks",
      title: "QuickBooks",
      description: "Sync invoices with QuickBooks Online.",
      badge: getStatus("quickbooks")?.isActive ? "Connected" : "Not connected",
      badgeColor: getStatus("quickbooks")?.isActive
        ? "bg-[var(--state-success-soft)] text-[var(--state-success)]"
        : "bg-[var(--surface-subtle)] text-[var(--text-muted)]",
      icon: Plug,
      isConnected: !!getStatus("quickbooks")?.isActive,
    },
    {
      key: "zoho",
      title: "Zoho Books",
      description: "Sync invoices with Zoho Books.",
      badge: getStatus("zoho")?.isActive ? "Connected" : "Not connected",
      badgeColor: getStatus("zoho")?.isActive
        ? "bg-[var(--state-success-soft)] text-[var(--state-success)]"
        : "bg-[var(--surface-subtle)] text-[var(--text-muted)]",
      icon: Plug,
      isConnected: !!getStatus("zoho")?.isActive,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Integrations</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Connect your accounting software and automation tools to sync invoices automatically.
        </p>
      </div>

      <div className="space-y-4">
        {integrationsList.map((integration) => {
          const Icon = integration.icon;
          const status = integration.isConnected
            ? getStatus(integration.key)
            : undefined;

          return (
            <SettingsCard key={integration.key}>
              <SettingsCardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--surface-selected)]">
                      <Icon className="h-4 w-4 text-[var(--brand-primary)]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {integration.title}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        {integration.description}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${integration.badgeColor}`}>
                    {integration.badge}
                  </span>
                </div>
              </SettingsCardHeader>
              <SettingsCardContent>
                {integration.href ? (
                  <a href={integration.href}>
                    <Button variant="secondary" size="sm">
                      Open {integration.title} Hub
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                  </a>
                ) : status?.isActive ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleSync(integration.key)}
                        disabled={syncing === integration.key}
                      >
                        {syncing === integration.key ? "Syncing…" : "Sync now"}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDisconnect(integration.key)}
                      >
                        Disconnect
                      </Button>
                      <span className="text-xs text-[var(--text-muted)]">
                        Last sync: {formatDate(status?.lastSyncAt ?? null)}
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-[var(--text-muted)]">
                      <p>Status: {formatSyncSummary(status)}</p>
                      <p>Token expiry: {formatDate(status?.tokenExpiresAt ?? null)}</p>
                      <p>Company ID: {status?.externalOrgId ?? "Pending callback"}</p>
                      {status?.lastSyncError && (
                        <p className="text-[var(--state-danger)]">
                          Last sync issue: {status.lastSyncError}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <a href={`/api/integrations/${integration.key}/connect`}>
                    <Button variant="primary" size="sm">
                      Connect {integration.title}
                    </Button>
                  </a>
                )}
              </SettingsCardContent>
            </SettingsCard>
          );
        })}
      </div>
    </div>
  );
}
