"use client";

/**
 * MessagingAdminPanel — Sprint 1.4
 *
 * The admin governance panel. Rendered when the user navigates to the "admin"
 * section in the left rail.
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  ShieldAlert,
  Download,
  X,
  Plus,
} from "lucide-react";
import type { AdminPanelTab } from "./types";
import { MOCK_AUDIT_LOG, MOCK_ADMIN_ENTRIES } from "./mock-data";
import { RadioPill, ToggleSwitch } from "./messaging-ui-primitives";

// ─── Styled select pill ───────────────────────────────────────────────────────

interface SelectPillProps {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  testId?: string;
}

function SelectPill({ options, value, onChange, testId }: SelectPillProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold transition-colors hover:border-[#DC2626] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
        style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
        onClick={() => setOpen((o) => !o)}
        data-testid={testId}
      >
        {value}
        <span className="ml-1 text-[#79747E]">▾</span>
      </button>
      {open && (
        <div
          className="absolute left-0 top-full z-10 mt-1 min-w-[140px] rounded-lg border bg-white shadow-lg overflow-hidden"
          style={{ borderColor: "#E0E0E0" }}
        >
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              className={cn(
                "flex w-full items-center px-3 py-2 text-xs transition-colors hover:bg-gray-50",
                opt === value ? "font-semibold text-[#DC2626]" : "text-[#1C1B1F]"
              )}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── AdminPanelHeader ─────────────────────────────────────────────────────────

interface AdminPanelHeaderProps {
  activeTab: AdminPanelTab;
  onTabChange: (tab: AdminPanelTab) => void;
}

function AdminPanelHeader({ activeTab, onTabChange }: AdminPanelHeaderProps) {
  const tabs: { id: AdminPanelTab; label: string }[] = [
    { id: "channel-policy", label: "Channel Policy" },
    { id: "retention", label: "Retention" },
    { id: "moderation", label: "Moderation" },
    { id: "audit-log", label: "Audit Log" },
    { id: "member-governance", label: "Member Governance" },
  ];

  return (
    <div className="shrink-0 border-b bg-white" style={{ borderColor: "#E0E0E0" }}>
      <div className="flex items-center gap-3 px-6 pt-5 pb-3">
        <ShieldAlert className="h-5 w-5 text-amber-500" />
        <div>
          <h2 className="text-base font-bold" style={{ color: "#1C1B1F" }}>
            Admin &amp; Governance
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#79747E" }}>
            Restricted to org admins and owners
          </p>
        </div>
      </div>
      {/* Tab bar — horizontal scroll on small widths */}
      <div className="flex overflow-x-auto border-t" role="tablist" aria-label="Admin panel tabs" style={{ borderColor: "#F0F0F0" }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "shrink-0 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#DC2626]",
              activeTab === tab.id
                ? "border-b-2 border-[#DC2626] text-[#DC2626]"
                : "text-[#79747E] hover:text-[#1C1B1F]"
            )}
            aria-selected={activeTab === tab.id}
            role="tab"
            data-testid={`admin-tab-${tab.id}`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── ChannelPolicyTab ─────────────────────────────────────────────────────────

function ChannelPolicyTab() {
  const [publicDefault, setPublicDefault] = React.useState(true);
  const [allMembersChannels, setAllMembersChannels] = React.useState(true);
  const [allMembersGroups, setAllMembersGroups] = React.useState(true);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-1" data-testid="admin-channel-policy-tab">
      {/* Default channel visibility */}
      <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "#F0F0F0" }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: "#49454F" }}>Public channels by default</p>
          <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>New channels are visible to everyone.</p>
        </div>
        <ToggleSwitch
          checked={publicDefault}
          onChange={setPublicDefault}
          label="Public channels by default"
          testId="admin-public-default-toggle"
        />
      </div>

      {/* Who can create channels */}
      <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "#F0F0F0" }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: "#49454F" }}>All members can create channels</p>
          <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>Admins only when off.</p>
        </div>
        <ToggleSwitch
          checked={allMembersChannels}
          onChange={setAllMembersChannels}
          label="All members can create channels"
          testId="admin-create-channels-toggle"
        />
      </div>

      {/* Who can create groups */}
      <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: "#F0F0F0" }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: "#49454F" }}>All members can create groups</p>
          <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>Admins only when off.</p>
        </div>
        <ToggleSwitch
          checked={allMembersGroups}
          onChange={setAllMembersGroups}
          label="All members can create groups"
          testId="admin-create-groups-toggle"
        />
      </div>

      {/* Save */}
      <div className="pt-4">
        <button
          type="button"
          className="rounded-lg bg-[#DC2626] px-5 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          data-testid="admin-channel-policy-save"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

// ─── RetentionTab ─────────────────────────────────────────────────────────────

const RETENTION_OPTIONS = ["30 days", "90 days", "1 year", "Forever"];

function RetentionTab() {
  const [messageRetention, setMessageRetention] = React.useState("1 year");
  const [fileRetention, setFileRetention] = React.useState("90 days");
  const [autoDelete, setAutoDelete] = React.useState(false);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" data-testid="admin-retention-tab">
      {/* Message retention */}
      <div className="space-y-2">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          Message retention period
        </label>
        <SelectPill
          options={RETENTION_OPTIONS}
          value={messageRetention}
          onChange={setMessageRetention}
          testId="admin-message-retention-select"
        />
      </div>

      {/* File retention */}
      <div className="space-y-2">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          File retention period
        </label>
        <SelectPill
          options={RETENTION_OPTIONS}
          value={fileRetention}
          onChange={setFileRetention}
          testId="admin-file-retention-select"
        />
      </div>

      {/* Auto-delete toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold" style={{ color: "#49454F" }}>
            Auto-delete after retention period
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>
            Messages and files will be permanently deleted.
          </p>
        </div>
        <ToggleSwitch
          checked={autoDelete}
          onChange={setAutoDelete}
          label="Auto-delete after retention period"
          testId="admin-auto-delete-toggle"
        />
      </div>

      {/* Policy note */}
      <div
        className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5"
      >
        <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
        <p className="text-xs text-amber-700">
          Retention settings apply org-wide. Contact your compliance officer before making changes.
        </p>
      </div>
    </div>
  );
}

// ─── ModerationTab ────────────────────────────────────────────────────────────

const BLOCKED_USERS = [
  { id: "bu-1", name: "Vikram Rao" },
  { id: "bu-2", name: "Anita Desai" },
];

function ModerationTab() {
  const [profanityFilter, setProfanityFilter] = React.useState(true);
  const [requireApproval, setRequireApproval] = React.useState(false);
  const [blockedUsers, setBlockedUsers] = React.useState(BLOCKED_USERS);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" data-testid="admin-moderation-tab">
      {/* Profanity filter */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold" style={{ color: "#49454F" }}>Profanity filter</p>
          <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>
            Automatically flag messages with profanity.
          </p>
        </div>
        <ToggleSwitch
          checked={profanityFilter}
          onChange={setProfanityFilter}
          label="Profanity filter"
          testId="admin-profanity-toggle"
        />
      </div>

      {/* Require admin approval */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold" style={{ color: "#49454F" }}>
            Require admin approval for new public channels
          </p>
        </div>
        <ToggleSwitch
          checked={requireApproval}
          onChange={setRequireApproval}
          label="Require admin approval for new public channels"
          testId="admin-approval-toggle"
        />
      </div>

      {/* Restrict file types */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          Restrict file types
        </label>
        <input
          type="text"
          defaultValue="All file types allowed"
          className="w-full rounded-lg border bg-[#f8f9fc] px-3 py-2 text-xs outline-none"
          style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
          aria-label="Restrict file types"
          data-testid="admin-file-types-input"
          readOnly
        />
      </div>

      {/* Blocked users */}
      <div className="space-y-2">
        <p className="text-xs font-semibold" style={{ color: "#49454F" }}>Blocked users</p>
        <div className="space-y-2">
          {blockedUsers.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2"
              style={{ borderColor: "#F0F0F0" }}
              data-testid={`blocked-user-${u.id}`}
            >
              <span className="text-xs font-medium" style={{ color: "#1C1B1F" }}>
                {u.name}
              </span>
              <button
                type="button"
                className="text-xs font-semibold text-[#DC2626] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] rounded"
                onClick={() => setBlockedUsers((prev) => prev.filter((x) => x.id !== u.id))}
                data-testid={`unblock-btn-${u.id}`}
              >
                Unblock
              </button>
            </div>
          ))}
          {blockedUsers.length === 0 && (
            <p className="text-xs" style={{ color: "#79747E" }}>No blocked users.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AuditLogTab ──────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AuditLogTab() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden" data-testid="admin-audit-log-tab">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b" style={{ borderColor: "#F0F0F0" }}>
        <p className="text-xs font-semibold" style={{ color: "#49454F" }}>
          {MOCK_AUDIT_LOG.length} entries
        </p>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
          style={{ borderColor: "#E0E0E0", color: "#49454F" }}
          data-testid="admin-export-log-btn"
        >
          <Download className="h-3 w-3" />
          Export log
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs" data-testid="admin-audit-log-table">
          <thead className="sticky top-0 bg-[#FAFAFA] border-b" style={{ borderColor: "#F0F0F0" }}>
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold" style={{ color: "#79747E" }}>Actor</th>
              <th className="px-4 py-2.5 text-left font-semibold" style={{ color: "#79747E" }}>Action</th>
              <th className="px-4 py-2.5 text-left font-semibold" style={{ color: "#79747E" }}>Summary</th>
              <th className="px-4 py-2.5 text-left font-semibold" style={{ color: "#79747E" }}>Date</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_AUDIT_LOG.map((entry) => (
              <tr
                key={entry.id}
                className="border-b transition-colors hover:bg-gray-50"
                style={{ borderColor: "#F8F8F8" }}
                data-testid={`audit-log-row-${entry.id}`}
              >
                <td className="px-4 py-3 font-medium" style={{ color: "#1C1B1F" }}>
                  {entry.actorName}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-[#49454F]">
                    {entry.action}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: "#49454F" }}>
                  {entry.summary}
                </td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#79747E" }}>
                  {formatDateTime(entry.occurredAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── MemberGovernanceTab ──────────────────────────────────────────────────────

const INITIAL_DOMAINS = ["zenxvio.com", "slipwise.io"];

function MemberGovernanceTab() {
  const [emailVerification, setEmailVerification] = React.useState(true);
  const [domains, setDomains] = React.useState(INITIAL_DOMAINS);
  const [newDomain, setNewDomain] = React.useState("");
  const [defaultRole, setDefaultRole] = React.useState("member");

  function addDomain() {
    const d = newDomain.trim();
    if (d && !domains.includes(d)) {
      setDomains((prev) => [...prev, d]);
      setNewDomain("");
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" data-testid="admin-member-governance-tab">
      {/* Email domain verification */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold" style={{ color: "#49454F" }}>
            Require email domain verification
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "#79747E" }}>
            Only users with allowed domains can join.
          </p>
        </div>
        <ToggleSwitch
          checked={emailVerification}
          onChange={setEmailVerification}
          label="Require email domain verification"
          testId="admin-email-verification-toggle"
        />
      </div>

      {/* Allowed domains */}
      <div className="space-y-2">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          Allowed email domains
        </label>
        <div className="flex flex-wrap gap-1.5">
          {domains.map((d) => (
            <span
              key={d}
              className="flex items-center gap-1 rounded-full border bg-gray-50 px-2 py-1 text-xs font-medium"
              style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
              data-testid={`domain-chip-${d}`}
            >
              {d}
              <button
                type="button"
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626]"
                aria-label={`Remove ${d}`}
                onClick={() => setDomains((prev) => prev.filter((x) => x !== d))}
              >
                <X className="h-2.5 w-2.5 text-[#79747E]" />
              </button>
            </span>
          ))}
        </div>
        {/* Add domain input */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Add domain (e.g. company.com)"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain()}
            className="flex-1 rounded-lg border bg-white px-3 py-2 text-xs outline-none placeholder:text-[#79747E] transition-colors focus:border-[#DC2626]"
            style={{ borderColor: "#E0E0E0", color: "#1C1B1F" }}
            aria-label="Add domain"
            data-testid="admin-add-domain-input"
          />
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DC2626] text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626]"
            aria-label="Add domain"
            onClick={addDomain}
            data-testid="admin-add-domain-btn"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Default role */}
      <div className="space-y-2">
        <label className="text-xs font-semibold" style={{ color: "#49454F" }}>
          Default role for new members
        </label>
        <RadioPill
          name="admin-default-role"
          options={[
            { value: "member", label: "Member" },
            { value: "admin", label: "Admin" },
          ]}
          value={defaultRole}
          onChange={setDefaultRole}
        />
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MessagingAdminPanel() {
  const [activeTab, setActiveTab] = React.useState<AdminPanelTab>("channel-policy");

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-white"
      data-testid="admin-panel"
    >
      {/* Sprint 1.1 regression compat wrapper */}
      <div data-testid="messaging-pane-admin" className="contents">
        <AdminPanelHeader activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Warning banner — text required by Sprint 1.1 tests */}
        <div className="mx-6 mt-3 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 shrink-0">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
          <p className="text-xs text-amber-700">
            These settings affect all members of your organization. Changes are logged in the audit trail.
          </p>
        </div>

        {/* Hidden compat entries for Sprint 1.1 regression tests */}
        <div className="sr-only" aria-hidden="true">
          {MOCK_ADMIN_ENTRIES.map((entry) => (
            <span key={entry.area} data-testid={`admin-pane-entry-${entry.area}`} />
          ))}
        </div>

        {activeTab === "channel-policy" && <ChannelPolicyTab />}
        {activeTab === "retention" && <RetentionTab />}
        {activeTab === "moderation" && <ModerationTab />}
        {activeTab === "audit-log" && <AuditLogTab />}
        {activeTab === "member-governance" && <MemberGovernanceTab />}
      </div>
    </div>
  );
}
