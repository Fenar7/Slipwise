"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  SettingsCard,
  SettingsCardHeader,
  SettingsCardContent,
} from "@/components/settings/settings-primitives";
import { Input } from "@/components/ui/input";
import {
  ASSIGNABLE_ROLES,
  ROLE_LABELS,
  getRoleColor,
  type Role,
} from "@/lib/permissions";
import { Users, UserPlus, Mail } from "lucide-react";

interface MemberWithProfile {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

interface InvitationRow {
  id: string;
  email: string;
  role: string | null;
  status: string;
  expiresAt: string;
  inviterId: string;
}

type ActionResult = { success: boolean; error?: string };

function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative slipwise-panel p-6 w-full max-w-sm mx-4">
        <h3 className="text-base font-semibold text-[var(--text-primary)] mb-2">{title}</h3>
        <p className="text-sm text-[var(--text-muted)] mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Confirm
          </Button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({
  open,
  onClose,
  onInvite,
}: {
  open: boolean;
  onClose: () => void;
  onInvite: (email: string, role: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("viewer");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError("");
    try {
      await onInvite(email.trim(), role);
      setEmail("");
      setRole("viewer");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative slipwise-panel p-6 w-full max-w-md mx-4">
        <div className="flex items-center gap-2.5 mb-4">
          <UserPlus className="h-5 w-5 text-[var(--brand-primary)]" />
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Invite Team Member
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            >
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-[var(--state-danger)]">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={sending}>
              {sending ? "Sending…" : "Send Invitation"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const label =
    ROLE_LABELS[role as Role] ??
    role
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(role)}`}
    >
      {label}
    </span>
  );
}

interface UsersClientProps {
  currentUserId: string;
  initialMembers: MemberWithProfile[];
  initialInvitations: InvitationRow[];
  inviteUserAction: (data: { email: string; role: string }) => Promise<ActionResult>;
  updateMemberRoleAction: (memberId: string, role: string) => Promise<ActionResult>;
  deactivateMemberAction: (memberId: string) => Promise<ActionResult>;
  reactivateMemberAction: (memberId: string) => Promise<ActionResult>;
  removeMemberAction: (memberId: string) => Promise<ActionResult>;
  resendInvitationAction: (invitationId: string) => Promise<ActionResult>;
  cancelInvitationAction: (invitationId: string) => Promise<ActionResult>;
}

export default function UsersClient({
  currentUserId,
  initialMembers,
  initialInvitations,
  inviteUserAction,
  updateMemberRoleAction,
  deactivateMemberAction,
  reactivateMemberAction,
  removeMemberAction,
  resendInvitationAction,
  cancelInvitationAction,
}: UsersClientProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  const activeMembers = initialMembers.filter((m) => m.role !== "deactivated");
  const deactivatedMembers = initialMembers.filter((m) => m.role === "deactivated");

  async function handleInvite(email: string, role: string) {
    const result = await inviteUserAction({ email, role });
    if (!result.success) throw new Error(result.error);
    router.refresh();
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    const result = await updateMemberRoleAction(memberId, newRole);
    if (!result.success) {
      setError(result.error ?? "Failed to update role");
      return;
    }
    setError("");
    router.refresh();
  }

  async function handleDeactivate(member: MemberWithProfile) {
    setConfirm({
      title: "Deactivate Member",
      message: `Deactivate ${member.user.name}? They will lose access until reactivated.`,
      action: async () => {
        const result = await deactivateMemberAction(member.id);
        if (!result.success) setError(result.error ?? "Failed");
        else setError("");
        setConfirm(null);
        router.refresh();
      },
    });
  }

  async function handleReactivate(memberId: string) {
    const result = await reactivateMemberAction(memberId);
    if (!result.success) setError(result.error ?? "Failed");
    else setError("");
    router.refresh();
  }

  async function handleRemove(member: MemberWithProfile) {
    setConfirm({
      title: "Remove Member",
      message: `Remove ${member.user.name} from the organization? This cannot be undone.`,
      action: async () => {
        const result = await removeMemberAction(member.id);
        if (!result.success) setError(result.error ?? "Failed");
        else setError("");
        setConfirm(null);
        router.refresh();
      },
    });
  }

  async function handleResendInvite(id: string) {
    const result = await resendInvitationAction(id);
    if (!result.success) setError(result.error ?? "Failed");
    else setError("");
    router.refresh();
  }

  async function handleCancelInvite(id: string) {
    const result = await cancelInvitationAction(id);
    if (!result.success) setError(result.error ?? "Failed");
    else setError("");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-[var(--state-danger)]/20 bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {error}
          <button
            onClick={() => setError("")}
            className="ml-2 text-[var(--state-danger)] hover:opacity-80"
          >
            ✕
          </button>
        </div>
      )}

      {/* Active Members */}
      <SettingsCard>
        <SettingsCardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-[var(--brand-primary)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Team Members
                <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                  ({activeMembers.length})
                </span>
              </h2>
            </div>
            <Button size="sm" onClick={() => setShowInvite(true)}>
              Invite Member
            </Button>
          </div>
        </SettingsCardHeader>
        <SettingsCardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)]">
                  <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-right px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeMembers.map((member) => {
                  const isOwner = member.role === "owner";
                  const isSelf = member.userId === currentUserId;

                  return (
                    <tr
                      key={member.id}
                      className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--surface-subtle)]/50 transition-colors"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-[var(--surface-subtle)] flex items-center justify-center text-xs font-medium text-[var(--text-muted)]">
                            {member.user.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .toUpperCase()
                              .slice(0, 2)}
                          </div>
                          <span className="font-medium text-[var(--text-primary)]">
                            {member.user.name}
                            {isSelf && (
                              <span className="ml-1.5 text-xs text-[var(--text-muted)]">
                                (you)
                              </span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {member.user.email}
                      </td>
                      <td className="px-5 py-3">
                        {isOwner ? (
                          <RoleBadge role={member.role} />
                        ) : (
                          <select
                            value={member.role}
                            onChange={(e) =>
                              handleRoleChange(member.id, e.target.value)
                            }
                            className="border border-[var(--border-soft)] rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
                          >
                            {ASSIGNABLE_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {!isOwner && !isSelf && (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeactivate(member)}
                            >
                              Deactivate
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[var(--state-danger)] hover:text-[var(--state-danger)]"
                              onClick={() => handleRemove(member)}
                            >
                              Remove
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {activeMembers.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center text-sm text-[var(--text-muted)]"
                    >
                      No team members found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SettingsCardContent>
      </SettingsCard>

      {/* Deactivated Members */}
      {deactivatedMembers.length > 0 && (
        <SettingsCard>
          <SettingsCardHeader>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Deactivated Members
              <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                ({deactivatedMembers.length})
              </span>
            </h2>
          </SettingsCardHeader>
          <SettingsCardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)]">
                    <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Email
                    </th>
                    <th className="text-right px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deactivatedMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b border-[var(--border-soft)] last:border-0 opacity-60 hover:opacity-100 transition-opacity"
                    >
                      <td className="px-5 py-3 text-[var(--text-primary)]">
                        {member.user.name}
                      </td>
                      <td className="px-5 py-3 text-[var(--text-secondary)]">
                        {member.user.email}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleReactivate(member.id)}
                          >
                            Reactivate
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-[var(--state-danger)] hover:text-[var(--state-danger)]"
                            onClick={() => handleRemove(member)}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SettingsCardContent>
        </SettingsCard>
      )}

      {/* Pending Invitations */}
      {initialInvitations.length > 0 && (
        <SettingsCard>
          <SettingsCardHeader>
            <div className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 text-[var(--brand-primary)]" />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Pending Invitations
                <span className="ml-2 text-sm font-normal text-[var(--text-muted)]">
                  ({initialInvitations.length})
                </span>
              </h2>
            </div>
          </SettingsCardHeader>
          <SettingsCardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)]">
                    <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Email
                    </th>
                    <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Role
                    </th>
                    <th className="text-left px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="text-right px-5 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {initialInvitations.map((inv) => {
                    const expired = new Date(inv.expiresAt) < new Date();
                    return (
                      <tr
                        key={inv.id}
                        className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--surface-subtle)]/50 transition-colors"
                      >
                        <td className="px-5 py-3 text-[var(--text-primary)]">
                          {inv.email}
                        </td>
                        <td className="px-5 py-3">
                          <RoleBadge role={inv.role ?? "viewer"} />
                        </td>
                        <td className="px-5 py-3 text-[var(--text-secondary)]">
                          {expired ? (
                            <span className="text-[var(--state-danger)] text-xs font-medium">
                              Expired
                            </span>
                          ) : (
                            new Date(inv.expiresAt).toLocaleDateString()
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResendInvite(inv.id)}
                            >
                              Resend
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[var(--state-danger)] hover:text-[var(--state-danger)]"
                              onClick={() => handleCancelInvite(inv.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SettingsCardContent>
        </SettingsCard>
      )}

      {/* Modals */}
      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onInvite={handleInvite}
      />
      {confirm && (
        <ConfirmDialog
          open
          title={confirm.title}
          message={confirm.message}
          onConfirm={confirm.action}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
