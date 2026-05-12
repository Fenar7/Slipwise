import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveOrgBranding, saveOrgFinancials } from "../actions";
import { OrganizationClient } from "./organization-client";

export default async function OrganizationSettingsPage() {
  const ctx = await requireOrgContext();

  const [org, branding, defaults] = await Promise.all([
    db.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true, slug: true },
    }),
    db.brandingProfile.findUnique({ where: { organizationId: ctx.orgId } }),
    db.orgDefaults.findUnique({ where: { organizationId: ctx.orgId } }),
  ]);

  if (!org) {
    return (
      <div className="slipwise-panel p-6">
        <p className="text-sm text-[var(--text-muted)]">
          No active organization. Complete onboarding first.
        </p>
      </div>
    );
  }

  return (
    <OrganizationClient
      orgName={org.name}
      orgSlug={org.slug}
      orgId={ctx.orgId}
      initialBranding={branding}
      initialDefaults={defaults}
      saveBranding={saveOrgBranding}
      saveFinancials={saveOrgFinancials}
    />
  );
}
