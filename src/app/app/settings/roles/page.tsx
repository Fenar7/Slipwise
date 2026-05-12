"use client";

import { useState } from "react";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardContent,
} from "@/components/settings/settings-primitives";
import {
  ALL_ROLES,
  ROLE_LABELS,
  PERMISSIONS,
  getRoleColor,
  type Role,
  type Module,
  type Action,
} from "@/lib/permissions";
import { ShieldCheck } from "lucide-react";

const MODULE_LABELS: Record<Module, string> = {
  invoices: "Invoices",
  vouchers: "Vouchers",
  salary_slips: "Salary Slips",
  pay_proofs: "Payment Proofs",
  pay_recurring: "Recurring Payments",
  pay_sendlog: "Send Log",
  flow_tickets: "Tickets",
  flow_approvals: "Approvals",
  flow_notifications: "Notifications",
  intel_dashboard: "Dashboard",
  intel_reports: "Reports",
  settings_users: "User Management",
  settings_roles: "Role Management",
  settings_proxy: "Proxy Access",
  settings_audit: "Audit Log",
  settings_sequences: "Document Numbering",
};

const MODULE_GROUPS: { label: string; modules: Module[] }[] = [
  {
    label: "Documents",
    modules: ["invoices", "vouchers", "salary_slips"],
  },
  {
    label: "Payments",
    modules: ["pay_proofs", "pay_recurring", "pay_sendlog"],
  },
  {
    label: "Workflow",
    modules: ["flow_tickets", "flow_approvals", "flow_notifications"],
  },
  {
    label: "Intelligence",
    modules: ["intel_dashboard", "intel_reports"],
  },
  {
    label: "Settings",
    modules: ["settings_users", "settings_roles", "settings_proxy", "settings_audit", "settings_sequences"],
  },
];

const ACTION_LABELS: Record<Action, string> = {
  read: "Read",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  send: "Send",
  approve: "Approve",
  export: "Export",
};

const ALL_ACTIONS: Action[] = [
  "read",
  "create",
  "edit",
  "delete",
  "send",
  "approve",
  "export",
];

export default function RolesPage() {
  const [activeRole, setActiveRole] = useState<Role>("owner");

  const perms = PERMISSIONS[activeRole];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-primary)]">Roles & Permissions</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          View the permission matrix for each role. Roles are assigned to team members in the Team Members page.
        </p>
      </div>

      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 text-[var(--brand-primary)]" />
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Permission Matrix</h2>
          </div>
        </SettingsCardHeader>
        <SettingsCardContent>
          {/* Role tabs */}
          <div className="flex flex-wrap gap-2 mb-6">
            {ALL_ROLES.map((role) => (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  activeRole === role
                    ? getRoleColor(role) + " ring-2 ring-offset-1 ring-[var(--brand-primary)]"
                    : "bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:bg-[var(--border-soft)]"
                }`}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>

          {/* Permission table */}
          <div className="overflow-x-auto rounded-lg border border-[var(--border-soft)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--surface-subtle)]">
                  <th className="text-left px-4 py-2.5 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-soft)]">
                    Module
                  </th>
                  {ALL_ACTIONS.map((action) => (
                    <th
                      key={action}
                      className="text-center px-3 py-2.5 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-soft)]"
                    >
                      {ACTION_LABELS[action]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULE_GROUPS.map((group) => (
                  <>
                    <tr key={group.label}>
                      <td
                        colSpan={ALL_ACTIONS.length + 1}
                        className="px-4 py-2 bg-[var(--surface-subtle)]/60 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-soft)]"
                      >
                        {group.label}
                      </td>
                    </tr>
                    {group.modules.map((mod) => {
                      const actions = perms[mod] ?? [];
                      return (
                        <tr
                          key={mod}
                          className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--surface-subtle)]/30 transition-colors"
                        >
                          <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium">
                            {MODULE_LABELS[mod]}
                          </td>
                          {ALL_ACTIONS.map((action) => (
                            <td
                              key={action}
                              className="text-center px-3 py-2.5"
                            >
                              {actions.includes(action) ? (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--state-success-soft)] text-[var(--state-success)] text-xs">
                                  ✓
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[var(--surface-subtle)] text-[var(--text-muted)] text-xs">
                                  —
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </SettingsCardContent>
      </SettingsCard>
    </div>
  );
}
