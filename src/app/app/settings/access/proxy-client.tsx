"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";

type ProxyGrant = {
  id: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  representedId: string;
  representedName: string;
  representedEmail: string;
  scope: string[];
  reason: string;
  expiresAt: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  grantedBy: string;
  revokedAt: string | null;
  revokedBy: string | null;
};

type OrgMember = { id: string; name: string; email: string };

const SCOPE_OPTIONS = [
  "Invoices",
  "Vouchers",
  "Salary",
  "Pay",
  "Flow",
  "All",
] as const;

const STATUS_VARIANT: Record<string, "success" | "default" | "danger"> = {
  ACTIVE: "success",
  EXPIRED: "default",
  REVOKED: "danger",
};

const STATUS_FILTERS = ["All", "ACTIVE", "EXPIRED", "REVOKED"] as const;

type CreateGrantResult =
  | { success: true; id?: string }
  | { success: false; error: string };

type RevokeGrantResult =
  | { success: true }
  | { success: false; error: string };

interface ProxyClientProps {
  initialGrants: ProxyGrant[];
  initialMembers: OrgMember[];
  createGrant: (data: {
    actorId: string;
    representedId: string;
    scope: string[];
    reason: string;
    expiresAt: string;
  }) => Promise<CreateGrantResult>;
  revokeGrant: (id: string) => Promise<RevokeGrantResult>;
}

export function ProxyClient({
  initialGrants,
  initialMembers,
  createGrant,
  revokeGrant,
}: ProxyClientProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [showModal, setShowModal] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      statusFilter === "All"
        ? initialGrants
        : initialGrants.filter((g) => g.status === statusFilter),
    [initialGrants, statusFilter]
  );

  async function handleRevoke(id: string) {
    setRevoking(id);
    const res = await revokeGrant(id);
    if (!res.success) alert(res.error);
    setConfirmRevoke(null);
    setRevoking(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Proxy Access</h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Grant team members the ability to act on behalf of others.
          </p>
        </div>
        <Button size="sm" onClick={() => setShowModal(true)}>
          Grant Proxy
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 rounded-lg bg-[var(--surface-subtle)] p-1 w-fit">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              statusFilter === f
                ? "bg-white text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="slipwise-panel overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--text-muted)]">
            No proxy grants found.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-soft)] bg-[var(--surface-subtle)]">
                <th className="text-left px-4 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Actor
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Representing
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Scope
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Expires
                </th>
                <th className="text-left px-4 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right px-4 py-3 font-medium text-xs text-[var(--text-muted)] uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr
                  key={g.id}
                  className="border-b border-[var(--border-soft)] last:border-0 hover:bg-[var(--surface-subtle)]/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--text-primary)]">
                      {g.actorName}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {g.actorEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--text-primary)]">
                      {g.representedName}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {g.scope.map((s) => (
                        <Badge key={s} variant="default">
                          {s}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-muted)]">
                    {new Date(g.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[g.status] ?? "default"}>
                      {g.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {g.status === "ACTIVE" && (
                      <>
                        {confirmRevoke === g.id ? (
                          <span className="inline-flex gap-2">
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={revoking === g.id}
                              onClick={() => handleRevoke(g.id)}
                            >
                              {revoking === g.id ? "Revoking…" : "Confirm"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmRevoke(null)}
                            >
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setConfirmRevoke(g.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Grant Proxy Modal */}
      {showModal && (
        <GrantProxyModal
          members={initialMembers}
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            router.refresh();
          }}
          createGrant={createGrant}
        />
      )}
    </div>
  );
}

// ── Grant Proxy Modal ───────────────────────────────────────────────

function GrantProxyModal({
  members,
  onClose,
  onCreated,
  createGrant,
}: {
  members: OrgMember[];
  onClose: () => void;
  onCreated: () => void;
  createGrant: ProxyClientProps["createGrant"];
}) {
  const [actorId, setActorId] = useState("");
  const [representedId, setRepresentedId] = useState("");
  const [scope, setScope] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 90);
    return d.toISOString().slice(0, 10);
  }, []);

  const minDate = new Date().toISOString().slice(0, 10);

  function toggleScope(s: string) {
    if (s === "All") {
      setScope((prev) =>
        prev.includes("All") ? [] : SCOPE_OPTIONS.map(String)
      );
      return;
    }
    setScope((prev) =>
      prev.includes(s)
        ? prev.filter((x) => x !== s && x !== "All")
        : [...prev.filter((x) => x !== "All"), s]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (actorId === representedId) {
      setError("Actor and represented cannot be the same person.");
      return;
    }
    if (reason.trim().length < 10) {
      setError("Reason must be at least 10 characters.");
      return;
    }
    if (!scope.length) {
      setError("Select at least one scope.");
      return;
    }

    setSaving(true);
    const result = await createGrant({
      actorId,
      representedId,
      scope,
      reason: reason.trim(),
      expiresAt,
    });
    setSaving(false);

    if (!result.success) {
      setError(result.error);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl slipwise-panel">
        <div className="flex items-center gap-2.5 mb-4">
          <ShieldCheck className="h-5 w-5 text-[var(--brand-primary)]" />
          <h3 className="text-base font-semibold text-[var(--text-primary)]">
            Grant Proxy Access
          </h3>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Actor */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Actor (who will act)
            </label>
            <select
              required
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            >
              <option value="">Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          {/* Represented */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Representing (act on behalf of)
            </label>
            <select
              required
              value={representedId}
              onChange={(e) => setRepresentedId(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            >
              <option value="">Select member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              Scope
            </label>
            <div className="flex flex-wrap gap-2">
              {SCOPE_OPTIONS.map((s) => (
                <label
                  key={s}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-colors",
                    scope.includes(s)
                      ? "border-[var(--brand-primary)] bg-[var(--surface-selected)] text-[var(--brand-primary)]"
                      : "border-[var(--border-soft)] text-[var(--text-muted)] hover:border-[var(--border-default)]"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={scope.includes(s)}
                    onChange={() => toggleScope(s)}
                    className="sr-only"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Reason
            </label>
            <textarea
              required
              minLength={10}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this proxy is needed (min 10 chars)…"
              className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] resize-none"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {reason.trim().length}/10 characters minimum
            </p>
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">
              Expires
            </label>
            <input
              type="date"
              required
              min={minDate}
              max={maxDate}
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-soft)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Maximum 90 days from today
            </p>
          </div>

          {error && (
            <p className="text-sm text-[var(--state-danger)] bg-[var(--state-danger-soft)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? "Granting…" : "Grant Proxy"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
