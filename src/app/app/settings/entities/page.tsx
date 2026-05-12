import { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardContent,
  SettingsSectionHeader,
} from "@/components/settings/settings-primitives";
import { Badge } from "@/components/ui/badge";
import { listOrgEntityGroups } from "./actions";
import { EntityGroupCreateForm } from "./entity-group-create-form";
import { AddEntityForm } from "./add-entity-form";
import { LayoutGrid, ArrowRight } from "lucide-react";

export const metadata: Metadata = { title: "Entity Groups | Settings" };

const ENTITY_TYPE_LABELS: Record<string, string> = {
  STANDALONE: "Standalone",
  HOLDING: "Holding",
  SUBSIDIARY: "Subsidiary",
  BRANCH: "Branch",
};

const ENTITY_TYPE_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "soon"> = {
  STANDALONE: "default",
  HOLDING: "success",
  SUBSIDIARY: "warning",
  BRANCH: "soon",
};

export default async function EntitiesSettingsPage() {
  const result = await listOrgEntityGroups();

  if (!result.success) {
    redirect("/app/settings");
  }

  const { asAdmin, asMember } = result.data;
  const memberGroup = asMember?.entityGroup ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Entity Groups</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Manage multi-entity structures. A Holding Company can consolidate financials across subsidiaries and branches.
        </p>
      </div>

      {/* Groups where this org is admin */}
      {asAdmin.length > 0 ? (
        <div className="space-y-4">
          {asAdmin.map((group) => (
            <SettingsCard key={group.id}>
              <SettingsCardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{group.name}</h3>
                    {group.description && (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{group.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">Currency: {group.currency}</span>
                </div>
              </SettingsCardHeader>
              <SettingsCardContent>
                <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Member Entities</h4>
                {group.members.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">No member entities yet.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border-soft)]">
                    {group.members.map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-2.5">
                        <span className="text-sm font-medium text-[var(--text-primary)]">{m.name}</span>
                        <Badge
                          variant={ENTITY_TYPE_VARIANTS[m.entityType] ?? "default"}
                          className="text-xs"
                        >
                          {ENTITY_TYPE_LABELS[m.entityType] ?? m.entityType}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-4 border-t border-[var(--border-soft)] pt-4">
                  <AddEntityForm entityGroupId={group.id} />
                </div>
              </SettingsCardContent>
            </SettingsCard>
          ))}
        </div>
      ) : memberGroup ? (
        /* This org is a member (not admin) of a group */
        <SettingsCard>
          <SettingsCardHeader>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Member of: {memberGroup.name}
            </h3>
          </SettingsCardHeader>
          <SettingsCardContent>
            <p className="text-sm text-[var(--text-secondary)]">
              This organisation is a member of the <strong>{memberGroup.name}</strong> entity
              group, administered by <strong>{memberGroup.adminOrg.name}</strong>.
            </p>
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Contact the group admin to modify membership or run consolidated reports.
            </p>
          </SettingsCardContent>
        </SettingsCard>
      ) : (
        /* Not in any group — show create form */
        <SettingsCard>
          <SettingsCardHeader>
            <div className="flex items-center gap-2.5">
              <LayoutGrid className="h-4 w-4 text-[var(--brand-primary)]" />
              <SettingsSectionHeader
                title="Create an Entity Group"
                description="Turn this organisation into a Holding Company and start adding subsidiaries or branches."
              />
            </div>
          </SettingsCardHeader>
          <SettingsCardContent>
            <EntityGroupCreateForm />
          </SettingsCardContent>
        </SettingsCard>
      )}

      {/* Consolidated reports link */}
      {asAdmin.length > 0 && (
        <div className="slipwise-soft-panel p-4">
          <p className="text-sm font-medium text-[var(--text-primary)]">Consolidated Reporting</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            View consolidated P&amp;L and Balance Sheet across all entities in the group.
          </p>
          <a
            href="/app/intel/consolidation"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[var(--brand-primary)] hover:underline"
          >
            Open Consolidation Dashboard
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}
