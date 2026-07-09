"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useActiveOrg } from "@/hooks/use-active-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getActivePortalSessions,
  revokeCustomerPortalAccess,
  revokeAllPortalTokens,
  getPortalCustomersWithAccessState,
} from "../actions";
import {
  enableClientHubForCustomer,
  disableClientHubForCustomer,
  resendClientHubInvite,
} from "@/app/app/actions/client-hub-actions";
import { PortalAccessState } from "@/lib/portal-auth";
import {
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCheck,
  XCircle,
  Lock,
  Unlock,
  Key,
  Info,
} from "lucide-react";

type Session = {
  id: string;
  jti: string;
  issuedAt: string | Date;
  expiresAt: string | Date;
  lastSeenAt: string | Date | null;
  ip: string | null;
  customer: { id: string; name: string; email: string };
};

type CustomerAccess = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  accessState: PortalAccessState;
  clientHubLifecycle: {
    enabled: boolean;
    latestInviteSentAt: string | Date | null;
    latestInviteEmail: string | null;
    inviteSentCount: number;
    publicAccessHandle: string | null;
  } | null;
  inviteEligible: boolean;
  blockers: string[];
};

export default function PortalAccessPage() {
  const { activeOrg } = useActiveOrg();
  const { role } = usePermissions();
  
  const [activeTab, setActiveTab] = useState<"invites" | "sessions">("invites");
  const [customers, setCustomers] = useState<CustomerAccess[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isAdmin = role === "admin" || role === "owner";

  // Load Customers & Statuses
  const loadCustomers = useCallback(async () => {
    if (!activeOrg?.id) return;
    setLoadingCustomers(true);
    try {
      const data = await getPortalCustomersWithAccessState(activeOrg.id);
      setCustomers(data as CustomerAccess[]);
    } catch (err) {
      console.error("Failed to load portal customers:", err);
      toast.error("Failed to fetch customer portal invite states.");
    } finally {
      setLoadingCustomers(false);
    }
  }, [activeOrg?.id]);

  // Load Active Sessions
  const loadSessions = useCallback(async () => {
    if (!activeOrg?.id) return;
    setLoadingSessions(true);
    try {
      const data = await getActivePortalSessions(activeOrg.id);
      setSessions(data as Session[]);
    } catch (err) {
      console.error("Failed to load portal sessions:", err);
      toast.error("Failed to fetch active portal sessions.");
    } finally {
      setLoadingSessions(false);
    }
  }, [activeOrg?.id]);

  // Unified reload
  const reloadData = useCallback(() => {
    if (activeTab === "invites") {
      loadCustomers();
    } else {
      loadSessions();
    }
  }, [activeTab, loadCustomers, loadSessions]);

  useEffect(() => {
    if (activeOrg?.id) {
      reloadData();
    }
  }, [activeOrg?.id, reloadData]);

  // Handle Send/Re-Enable Initial Invite
  const handleSendInvite = async (customerId: string) => {
    if (!activeOrg?.id) return;
    setActionInProgress(customerId);
    try {
      const res = await enableClientHubForCustomer(customerId, { sendInvite: true });
      if (res.success) {
        toast.success(res.inviteSent ? "Client Hub enabled and welcome invite sent." : "Client Hub enabled successfully.");
        await loadCustomers();
      } else {
        toast.error(res.error || "Failed to enable Client Hub.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Resend Invite
  const handleResendInvite = async (customerId: string) => {
    if (!activeOrg?.id) return;
    setActionInProgress(customerId);
    try {
      const res = await resendClientHubInvite(customerId);
      if (res.success) {
        toast.success("Portal access invite resent successfully.");
        await loadCustomers();
      } else {
        toast.error(res.error || "Failed to resend invite.");
      }
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Revoke Access
  const handleRevokeAccess = async (customerId: string) => {
    if (!activeOrg?.id) return;
    if (!confirm("Are you sure you want to revoke all active sessions and magic link tokens for this customer? They will not be able to log in until re-invited.")) {
      return;
    }
    setActionInProgress(customerId);
    try {
      const res = await revokeCustomerPortalAccess(activeOrg.id, customerId);
      toast.success(`Revoked ${res.revokedSessions} active session(s) and ${res.revokedTokens} token(s).`);
      await loadCustomers();
      if (activeTab === "sessions") await loadSessions();
    } catch {
      toast.error("Failed to revoke customer access.");
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Lock/Disable Customer Lifecycle
  const handleToggleLock = async (customerId: string, currentlyEnabled: boolean) => {
    if (!activeOrg?.id) return;
    setActionInProgress(customerId);
    try {
      let res;
      if (currentlyEnabled) {
        res = await disableClientHubForCustomer(customerId);
        if (res.success) {
          toast.success("Client Hub disabled. Customer is now locked out.");
        } else {
          toast.error(res.error || "Failed to disable Client Hub.");
        }
      } else {
        res = await enableClientHubForCustomer(customerId, { sendInvite: false });
        if (res.success) {
          toast.success("Client Hub re-enabled successfully.");
        } else {
          toast.error(res.error || "Failed to enable Client Hub.");
        }
      }
      await loadCustomers();
    } catch {
      toast.error("An unexpected error occurred.");
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle Revoke All
  const handleRevokeAll = async () => {
    if (!activeOrg?.id) return;
    if (!confirm("This will revoke ALL active sessions and magic links across ALL customers. All active portal users will be logged out. Continue?")) {
      return;
    }
    setRevokingAll(true);
    try {
      const result = await revokeAllPortalTokens(activeOrg.id);
      toast.success(`Successfully revoked ${result.revokedSessions} sessions and ${result.revokedTokens} tokens across organization.`);
      reloadData();
    } catch {
      toast.error("Failed to revoke all portal access.");
    } finally {
      setRevokingAll(false);
    }
  };

  function formatDate(d: string | Date | null) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }

  // Group active sessions by customer for display
  const byCustomer = sessions.reduce<Record<string, { customer: Session["customer"]; sessions: Session[] }>>(
    (acc, s) => {
      if (!acc[s.customer.id]) {
        acc[s.customer.id] = { customer: s.customer, sessions: [] };
      }
      acc[s.customer.id].sessions.push(s);
      return acc;
    },
    {},
  );

  // Filter and Search Customers
  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));
    
    if (statusFilter === "ALL") return matchesSearch;
    return matchesSearch && c.accessState === statusFilter;
  });

  // Render Premium Badges with micro-animations
  const renderStatusBadge = (state: PortalAccessState) => {
    switch (state) {
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 shadow-sm">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            Active
          </span>
        );
      case "ISSUED":
        return (
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-700 shadow-sm">
            Invite Sent
          </span>
        );
      case "VERIFIED":
        return (
          <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 shadow-sm">
            Verified / Onboarded
          </span>
        );
      case "EXPIRED":
        return (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 shadow-sm">
            Invite Expired
          </span>
        );
      case "REVOKED":
        return (
          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 shadow-sm">
            Revoked
          </span>
        );
      case "LOCKED":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-700 shadow-sm">
            <Lock className="h-3 w-3" /> Locked
          </span>
        );
      case "NEVER_INVITED":
      default:
        return (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-600 shadow-sm">
            Never Invited
          </span>
        );
    }
  };

  if (!activeOrg) {
    return <div className="text-sm text-[#666] p-6">No active organization. Please onboard first.</div>;
  }

  if (!isAdmin) {
    return <div className="text-sm text-red-600 p-6">Administrator credentials are required to manage portal access control.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-[#1a1a1a]">Client Hub Onboarding & Access</h1>
          <p className="mt-1 text-sm text-[#666]">
            Confidently invite clients, deliver OTP secure invites, track verification states, and manage active sessions.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={reloadData}
            disabled={loadingCustomers || loadingSessions}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${(loadingCustomers || loadingSessions) ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleRevokeAll}
            disabled={revokingAll || (activeTab === "sessions" && sessions.length === 0)}
          >
            {revokingAll ? "Revoking…" : "Revoke All Access"}
          </Button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("invites")}
            className={`border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
              activeTab === "invites"
                ? "border-[var(--brand-cta)] text-[var(--brand-cta)]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Portal Invites & Lifecycle ({customers.length})
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`border-b-2 py-4 px-1 text-sm font-semibold transition-colors ${
              activeTab === "sessions"
                ? "border-[var(--brand-cta)] text-[var(--brand-cta)]"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Active Sessions ({sessions.length})
          </button>
        </nav>
      </div>

      {/* Tabs Content */}
      {activeTab === "invites" ? (
        <div className="space-y-4">
          {/* Filters card */}
          <div className="flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers by name or email..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none transition focus:border-slate-300 focus:bg-white"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 outline-none"
              >
                <option value="ALL">All States</option>
                <option value="NEVER_INVITED">Never Invited</option>
                <option value="ISSUED">Invite Sent</option>
                <option value="VERIFIED">Verified / Onboarded</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Invite Expired</option>
                <option value="REVOKED">Revoked</option>
                <option value="LOCKED">Locked</option>
              </select>
            </div>
          </div>

          {/* Customers list Card */}
          <Card>
            <CardContent className="p-0">
              {loadingCustomers ? (
                <div className="flex h-32 items-center justify-center text-sm text-slate-500">
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading customer list…
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center p-6 text-center text-sm text-slate-500">
                  <Info className="mb-2 h-5 w-5 text-slate-400" />
                  No customers found matching the search criteria or status filter.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredCustomers.map((c) => {
                    const isHubEnabled = c.clientHubLifecycle?.enabled ?? false;
                    const hasEmail = c.email && c.email.trim().length > 0;
                    const inProgress = actionInProgress === c.id;

                    return (
                      <div key={c.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-semibold text-sm text-[#1a1a1a] truncate">{c.name}</h4>
                            {renderStatusBadge(c.accessState)}
                          </div>
                          
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                            {hasEmail ? (
                              <span className="truncate">{c.email}</span>
                            ) : (
                              <span className="text-rose-500 font-medium">⚠️ No email registered</span>
                            )}
                            {c.phone && <span>· {c.phone}</span>}
                          </div>

                          {c.clientHubLifecycle?.latestInviteSentAt && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
                              <span>Sent {formatDate(c.clientHubLifecycle.latestInviteSentAt)}</span>
                              <span>·</span>
                              <span>Target: {c.clientHubLifecycle.latestInviteEmail || c.email}</span>
                              <span>·</span>
                              <span>Invites: {c.clientHubLifecycle.inviteSentCount}</span>
                            </div>
                          )}
                          {!c.inviteEligible && c.blockers && c.blockers.length > 0 && (
                            <div className="mt-1.5 text-[11px] text-rose-500 font-medium flex items-center gap-1">
                              <span>⚠️ Cannot invite: {c.blockers.join(", ")}</span>
                            </div>
                          )}
                        </div>

                        {/* Inline Actions block */}
                        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                          {/* Send/Resend Invite */}
                          {!isHubEnabled ? (
                            <Button
                              type="button"
                              variant="primary"
                              disabled={!c.inviteEligible || inProgress}
                              onClick={() => handleSendInvite(c.id)}
                              className="text-xs py-1.5 flex items-center gap-1.5"
                            >
                              <Mail className="h-3.5 w-3.5" /> Enable & Invite
                            </Button>
                          ) : c.accessState === "NEVER_INVITED" ? (
                            <Button
                              type="button"
                              variant="primary"
                              disabled={!c.inviteEligible || inProgress}
                              onClick={() => handleResendInvite(c.id)}
                              className="text-xs py-1.5 flex items-center gap-1.5"
                            >
                              <Mail className="h-3.5 w-3.5" /> Send Invite
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={!c.inviteEligible || inProgress}
                              onClick={() => handleResendInvite(c.id)}
                              className="text-xs py-1.5 flex items-center gap-1.5"
                            >
                              <Mail className="h-3.5 w-3.5" /> Resend Invite
                            </Button>
                          )}

                          {/* Revoke active keys/sessions */}
                          {(c.accessState === "ACTIVE" || c.accessState === "VERIFIED" || c.accessState === "ISSUED") && (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={inProgress}
                              onClick={() => handleRevokeAccess(c.id)}
                              className="text-xs py-1.5 border-rose-200 text-rose-600 hover:bg-rose-50"
                            >
                              Revoke Tokens
                            </Button>
                          )}

                          {/* Lock/Unlock Hub Access */}
                          {isHubEnabled ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={inProgress}
                              onClick={() => handleToggleLock(c.id, true)}
                              className="text-xs py-1.5 flex items-center gap-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                              title="Lock customer's access handle"
                            >
                              <Lock className="h-3 w-3" /> Lock Hub
                            </Button>
                          ) : (
                            c.clientHubLifecycle && (
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={inProgress}
                                onClick={() => handleToggleLock(c.id, false)}
                                className="text-xs py-1.5 flex items-center gap-1 text-slate-600 hover:bg-slate-50"
                                title="Unlock customer's access handle"
                              >
                                <Unlock className="h-3 w-3" /> Unlock Hub
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-[#1a1a1a]">
                {loadingSessions ? "Loading…" : `${sessions.length} active session${sessions.length !== 1 ? "s" : ""}`}
              </span>
              <button
                onClick={loadSessions}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Refresh List
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingSessions ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-500">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading sessions…
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-[#666] py-8 text-center">No active customer sessions exist currently.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {Object.values(byCustomer).map(({ customer, sessions: customerSessions }) => (
                  <div key={customer.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-[#1a1a1a] truncate">{customer.name}</p>
                        <p className="text-xs text-[#666] truncate">{customer.email}</p>
                        <div className="mt-2 space-y-1.5">
                          {customerSessions.map((s) => (
                            <div key={s.id} className="flex items-center gap-3 text-[11px] text-[#666]">
                              <span className="flex items-center gap-1">
                                <Key className="h-3 w-3 text-slate-400" />
                                Issued {formatDate(s.issuedAt)}
                              </span>
                              <span className="text-slate-300">·</span>
                              <span>Expires {formatDate(s.expiresAt)}</span>
                              {s.lastSeenAt && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span>Seen {formatDate(s.lastSeenAt)}</span>
                                </>
                              )}
                              {s.ip && (
                                <>
                                  <span className="text-slate-300">·</span>
                                  <span className="font-mono bg-slate-50 px-1 rounded border border-slate-100">{s.ip}</span>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleRevokeAccess(customer.id)}
                        disabled={actionInProgress === customer.id}
                        className="shrink-0 text-xs py-1 px-3 border-rose-200 text-rose-600 hover:bg-rose-50"
                      >
                        {actionInProgress === customer.id ? "Revoking…" : "Revoke Session"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
