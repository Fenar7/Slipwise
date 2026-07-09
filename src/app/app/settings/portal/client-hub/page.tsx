"use client";

import { useActiveOrg } from "@/hooks/use-active-org";
import { usePermissions } from "@/hooks/use-permissions";
import { CustomizationShell } from "./components/customization-shell";

export default function ClientHubCustomizationPage() {
  const { activeOrg } = useActiveOrg();
  const { role } = usePermissions();

  const isAdmin = role === "admin" || role === "owner";

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
          You need admin or owner access to customize the Client Hub.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Client Hub Customization</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Customize branding, content, and experience for your client-facing hub. Changes preview in real time.
        </p>
      </div>

      <CustomizationShell />
    </div>
  );
}
