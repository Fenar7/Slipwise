"use client";
import { useState, useEffect } from "react";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { Input } from "@/components/ui/input";
import {
  SettingsSectionHeader,
  SettingsFormField,
  SettingsReadOnlyField,
  SettingsSaveBar,
} from "@/components/settings/settings-primitives";
import { getProfileSettings, saveProfileSettings } from "./actions";
import Link from "next/link";
import { KeyRound, Mail, Shield } from "lucide-react";

export default function ProfileSettingsPage() {
  const { isPending } = useSupabaseSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const data = await getProfileSettings();
        if (cancelled) return;
        setName(data.name);
        setEmail(data.email);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Could not load your profile."
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSaving(true);
    try {
      await saveProfileSettings({ name });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not save changes. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  if (isPending || loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-md bg-[var(--surface-subtle)]" />
        <div className="h-48 animate-pulse rounded-md bg-[var(--surface-subtle)]" />
        <div className="h-32 animate-pulse rounded-md bg-[var(--surface-subtle)]" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-10">
      {/* Related links */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/app/settings/security"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--border-soft)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
        >
          <Shield className="h-3.5 w-3.5" />
          <span>Security</span>
        </Link>
        <Link
          href="/app/settings/security/sso"
          className="inline-flex items-center gap-2 rounded-md border border-[var(--border-soft)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
        >
          <KeyRound className="h-3.5 w-3.5" />
          <span>SSO / SAML</span>
        </Link>
      </div>

      {/* Personal details */}
      <section className="space-y-5">
        <SettingsSectionHeader
          title="Personal details"
          description="Update the name people see in account surfaces and collaborative workflows."
        />

        <div className="grid gap-6 xl:grid-cols-2">
          <SettingsFormField label="Full name" htmlFor="profile-name">
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Your full name"
            />
          </SettingsFormField>

          <SettingsReadOnlyField
            label="Primary email"
            value={email}
            hint="Email cannot be changed here. Contact support if needed."
          />
        </div>
      </section>

      {/* Account identity */}
      <section className="border-t border-[var(--border-soft)] pt-10">
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5">
            <SettingsSectionHeader
              title="Account identity"
              description="Reference details tied to your authenticated account and workspace access."
            />

            <div className="grid gap-5 lg:grid-cols-2">
              <SettingsReadOnlyField
                label="Sign-in email"
                value={email}
                hint="This is your authenticated account address."
              />
              <SettingsReadOnlyField
                label="Workspace display name"
                value={name}
                hint="Used anywhere your identity is shown inside Slipwise."
              />
            </div>
          </div>

          <div className="h-fit rounded-md border border-[var(--border-soft)] bg-[var(--surface-subtle)]/50 p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <div>
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  Need more control?
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Use{" "}
                  <Link
                    href="/app/settings/security"
                    className="font-medium text-[var(--text-primary)] hover:underline"
                  >
                    Security
                  </Link>{" "}
                  for password, MFA, and passkeys, or{" "}
                  <Link
                    href="/app/settings/organization"
                    className="font-medium text-[var(--text-primary)] hover:underline"
                  >
                    Organization
                  </Link>{" "}
                  for workspace-wide identity settings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SettingsSaveBar
        saving={saving}
        saved={success}
        error={error || undefined}
        saveLabel="Save changes"
        savedMessage="✓ Profile updated"
      />
    </form>
  );
}
