"use client";
import { useState, useEffect } from "react";
import { useActiveOrg } from "@/hooks/use-active-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardContent,
} from "@/components/settings/settings-primitives";
import { getPortalSettings, updatePortalSettings, revokeAllPortalTokens } from "./actions";
import { DoorOpen, Link2, ShieldAlert } from "lucide-react";

export default function PortalSettingsPage() {
  const { activeOrg } = useActiveOrg();
  const { role } = usePermissions();
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [headerMessage, setHeaderMessage] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAdmin = role === "admin" || role === "owner";

  useEffect(() => {
    if (activeOrg?.id) {
      getPortalSettings(activeOrg.id).then((data) => {
        if (data) {
          setPortalEnabled(data.portalEnabled);
          setHeaderMessage(data.portalHeaderMessage ?? "");
          setSupportEmail(data.portalSupportEmail ?? "");
          setSupportPhone(data.portalSupportPhone ?? "");
        }
      });
    }
  }, [activeOrg?.id]);

  if (!activeOrg) {
    return (
      <div className="slipwise-panel p-6">
        <p className="text-sm text-[var(--text-muted)]">
          No active organization. Complete onboarding first.
        </p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="slipwise-panel p-6">
        <p className="text-sm text-[var(--state-danger)]">
          You need admin or owner access to manage portal settings.
        </p>
      </div>
    );
  }

  const portalUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/portal/${activeOrg.slug}`;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrg?.id) return;
    setSaving(true);
    setSuccess(null);
    await updatePortalSettings({
      organizationId: activeOrg.id,
      portalEnabled,
      portalHeaderMessage: headerMessage,
      portalSupportEmail: supportEmail,
      portalSupportPhone: supportPhone,
    });
    setSaving(false);
    setSuccess("settings");
  }

  async function handleCopyUrl() {
    await navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevokeAll() {
    if (!activeOrg?.id) return;
    if (!confirm("This will revoke all active portal tokens. Customers will need to request new magic links. Continue?")) return;
    setRevoking(true);
    const result = await revokeAllPortalTokens(activeOrg.id);
    setRevoking(false);
    setSuccess(`revoked-${result.revokedCount}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Customer Portal</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Allow customers to view their invoices and statements via a self-service portal.
        </p>
      </div>

      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <DoorOpen className="h-4 w-4 text-[var(--brand-primary)]" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Portal Settings</h3>
          </div>
        </SettingsCardHeader>
        <SettingsCardContent>
          <form onSubmit={handleSave} className="space-y-5 max-w-md">
            <div className="flex items-center gap-3">
              <label className="block text-sm font-medium text-[var(--text-primary)]">
                Portal Enabled
              </label>
              <button
                type="button"
                role="switch"
                aria-checked={portalEnabled}
                onClick={() => setPortalEnabled(!portalEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  portalEnabled ? "bg-[var(--brand-cta)]" : "bg-[var(--border-default)]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    portalEnabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-[var(--text-muted)]">
                {portalEnabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Header Message
              </label>
              <input
                type="text"
                value={headerMessage}
                onChange={(e) => setHeaderMessage(e.target.value)}
                placeholder="Welcome to our customer portal"
                className="w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Support Email
              </label>
              <input
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="support@yourcompany.com"
                className="w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
                Support Phone
              </label>
              <input
                type="tel"
                value={supportPhone}
                onChange={(e) => setSupportPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-[var(--border-soft)] px-3 py-2 text-sm text-[var(--text-primary)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
            </div>

            {success === "settings" && (
              <p className="text-sm text-[var(--state-success)]">✓ Portal settings saved</p>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </form>
        </SettingsCardContent>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <Link2 className="h-4 w-4 text-[var(--brand-primary)]" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Portal URL</h3>
          </div>
        </SettingsCardHeader>
        <SettingsCardContent>
          <p className="text-sm text-[var(--text-muted)] mb-3">
            Share this URL with customers so they can access the portal.
          </p>
          <div className="flex items-center gap-3 max-w-lg">
            <code className="flex-1 bg-[var(--surface-subtle)] border border-[var(--border-soft)] rounded-lg px-3 py-2 text-sm font-mono text-[var(--text-primary)] truncate">
              {portalUrl}
            </code>
            <Button type="button" onClick={handleCopyUrl} variant="secondary">
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </SettingsCardContent>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="h-4 w-4 text-[var(--state-danger)]" />
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Security</h3>
          </div>
        </SettingsCardHeader>
        <SettingsCardContent>
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Revoke all active portal tokens. Customers will need to request new magic links.
          </p>
          {success?.startsWith("revoked-") && (
            <p className="text-sm text-[var(--state-success)] mb-3">
              ✓ {success.replace("revoked-", "")} token(s) revoked
            </p>
          )}
          <Button
            type="button"
            variant="danger"
            onClick={handleRevokeAll}
            disabled={revoking}
          >
            {revoking ? "Revoking…" : "Revoke all portal tokens"}
          </Button>
        </SettingsCardContent>
      </SettingsCard>
    </div>
  );
}
