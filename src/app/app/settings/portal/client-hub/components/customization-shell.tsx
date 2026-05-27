"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import {
  Palette,
  LayoutDashboard,
  FileText,
  ClipboardList,
  CreditCard,
  Info,
  Phone,
  Package,
  Compass,
  Eye,
  RotateCcw,
  Send,
  Save,
  Copy,
  Mail,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { ClientHubConfig } from "@/app/portal/[orgSlug]/client-hub/components/customization-contract";
import { DEFAULT_CLIENT_HUB_CONFIG } from "./mock-config";
import {
  getClientHubOrgConfig,
  updateClientHubOrgConfig,
  getClientHubCustomers,
  getClientOverrideEditorState,
  updateClientHubCustomerOverride,
  clearClientHubCustomerOverride,
  getClientHubCustomerLifecycle,
  enableClientHubForCustomer,
  disableClientHubForCustomer,
  previewClientHubForCustomer,
  copyClientHubLink,
  resendClientHubInvite,
} from "@/app/app/actions/client-hub-actions";
import type { ClientHubCustomerReadiness } from "@/app/app/actions/client-hub-actions";
import { toast } from "sonner";
import { PreviewPane } from "./preview-pane";
import {
  BrandingSection,
  HomeDashboardSection,
  InvoicesSection,
  QuotesSection,
  PaymentsSection,
  AboutSection,
  ContactSection,
  ProductsSection,
  NavigationSection,
} from "./section-forms";

type TabId =
  | "branding"
  | "home"
  | "invoices"
  | "quotes"
  | "payments"
  | "about"
  | "contact"
  | "products"
  | "navigation"
  | "preview";

const tabs: { id: TabId; label: string; icon: React.ElementType; previewPage?: string }[] = [
  { id: "branding", label: "Branding", icon: Palette },
  { id: "home", label: "Home / Dashboard", icon: LayoutDashboard, previewPage: "dashboard" },
  { id: "invoices", label: "Invoices", icon: FileText, previewPage: "invoices" },
  { id: "quotes", label: "Quotes", icon: ClipboardList, previewPage: "quotes" },
  { id: "payments", label: "Payments", icon: CreditCard, previewPage: "payments" },
  { id: "about", label: "About", icon: Info, previewPage: "about" },
  { id: "contact", label: "Contact", icon: Phone, previewPage: "contact" },
  { id: "products", label: "Products / Services", icon: Package, previewPage: "products" },
  { id: "navigation", label: "Navigation / Footer", icon: Compass },
  { id: "preview", label: "Preview", icon: Eye },
];

function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "success" | "red" }) {
  const toneClasses = {
    neutral: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-700",
    success: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-medium uppercase tracking-wide", toneClasses[tone])}>
      {children}
    </span>
  );
}

export function CustomizationShell() {
  const [activeTab, setActiveTab] = useState<TabId>("branding");
  const [activePreviewPage, setActivePreviewPage] = useState("dashboard");
  const [config, setConfig] = useState<ClientHubConfig>(DEFAULT_CLIENT_HUB_CONFIG);
  const [hasChanges, setHasChanges] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Per-Client Override State
  const [customers, setCustomers] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [orgDefaultConfig, setOrgDefaultConfig] = useState<ClientHubConfig>(DEFAULT_CLIENT_HUB_CONFIG);
  const [overrideConfig, setOverrideConfig] = useState<any>({});

  // Sprint 3.3 / 3.4 — Per-Client Lifecycle & Admin State
  const [lifecycleReadiness, setLifecycleReadiness] = useState<ClientHubCustomerReadiness | null>(null);
  const [isLoadingLifecycle, setIsLoadingLifecycle] = useState(false);

  // Sprint 3.4 — Admin Workflow Actions
  const [adminState, setAdminState] = useState<{
    latestInviteSentAt: string | null;
    latestInviteEmail: string | null;
    inviteState: string;
    inviteSentCount: number;
    canonicalHubUrl: string | null;
  } | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<ClientHubConfig | null>(null);
  const [isCopyingLink, setIsCopyingLink] = useState(false);
  const [isResendingInvite, setIsResendingInvite] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        setIsLoading(true);
        const orgRes = await getClientHubOrgConfig();
        if (orgRes.success) {
          setConfig(orgRes.config);
          setOrgDefaultConfig(orgRes.config);
          setLoadError(null);
        } else {
          setLoadError(orgRes.error);
          toast.error(orgRes.error);
          return;
        }

        const custRes = await getClientHubCustomers();
        if (custRes.success) {
          setCustomers(custRes.customers);
        }
      } catch (error) {
        console.error("Failed to load stored client hub config:", error);
        setLoadError("An unexpected error occurred while loading settings.");
        toast.error("Failed to load your stored customization defaults.");
      } finally {
        setIsLoading(false);
      }
    }
    loadConfig();
  }, []);

  const handleConfigChange = useCallback((next: ClientHubConfig) => {
    setConfig(next);
    setHasChanges(true);
  }, []);

  const applyAdminState = useCallback((payload: {
    readiness: ClientHubCustomerReadiness;
    latestInviteSentAt?: string | null;
    latestInviteEmail?: string | null;
    inviteState?: string;
    inviteSentCount?: number;
    canonicalHubUrl?: string | null;
  }) => {
    setLifecycleReadiness(payload.readiness);
    setAdminState({
      latestInviteSentAt: payload.latestInviteSentAt ?? null,
      latestInviteEmail: payload.latestInviteEmail ?? null,
      inviteState: payload.inviteState ?? "disabled",
      inviteSentCount: payload.inviteSentCount ?? 0,
      canonicalHubUrl: payload.canonicalHubUrl ?? null,
    });
  }, []);

  const handleModeChange = useCallback(async (customerId: string) => {
    setIsLoading(true);

    try {
      if (!customerId) {
        const orgRes = await getClientHubOrgConfig();
        if (orgRes.success) {
          setConfig(orgRes.config);
          setOrgDefaultConfig(orgRes.config);
          setOverrideConfig({});
          setSelectedCustomerId("");
          setHasChanges(false);
          setLifecycleReadiness(null);
          setAdminState(null);
        } else {
          toast.error(orgRes.error);
        }
      } else {
        const [overrideRes, lifecycleRes] = await Promise.all([
          getClientOverrideEditorState(customerId),
          getClientHubCustomerLifecycle(customerId),
        ]);

        if (overrideRes.success) {
          setConfig(overrideRes.effectiveConfig);
          setOrgDefaultConfig(overrideRes.orgDefault);
          setOverrideConfig(overrideRes.overrideConfig);
          setSelectedCustomerId(customerId);
          setHasChanges(false);

          if (lifecycleRes.success && "readiness" in lifecycleRes) {
            applyAdminState({
              readiness: lifecycleRes.readiness,
              // The legacy lifecycle response only includes readiness; admin detail fields
              // will be hydrated on first admin workflow interaction or next refresh.
            });
          } else {
            console.warn("Failed to load lifecycle state:", lifecycleRes.error);
            setLifecycleReadiness(null);
            setAdminState(null);
          }
        } else {
          toast.error(overrideRes.error || "Failed to load client override settings");
        }
      }
    } catch (error) {
      console.error("Error switching customization mode:", error);
      toast.error("Failed to switch context.");
    } finally {
      setIsLoading(false);
    }
  }, [applyAdminState]);

  const handleReset = useCallback(() => {
    if (confirm("Reset current customization values to their defaults?")) {
      if (!selectedCustomerId) {
        setConfig(DEFAULT_CLIENT_HUB_CONFIG);
      } else {
        setConfig(orgDefaultConfig);
      }
      setHasChanges(true);
    }
  }, [selectedCustomerId, orgDefaultConfig]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      if (!selectedCustomerId) {
        const result = await updateClientHubOrgConfig(config);
        if (result.success) {
          toast.success("Client Hub default configuration saved and published");
          setOrgDefaultConfig(config);
          setHasChanges(false);
        } else {
          toast.error(result.error || "Failed to save configuration");
        }
      } else {
        const result = await updateClientHubCustomerOverride(selectedCustomerId, config);
        if (result.success) {
          if (result.isCleared) {
            toast.success("Client hub overrides cleared; now inheriting from org defaults.");
            setOverrideConfig({});
          } else {
            toast.success("Client hub specific override saved successfully.");
          }
          setHasChanges(false);
          const reload = await getClientOverrideEditorState(selectedCustomerId);
          if (reload.success) {
            setConfig(reload.effectiveConfig);
            setOrgDefaultConfig(reload.orgDefault);
            setOverrideConfig(reload.overrideConfig);
          }
        } else {
          toast.error(result.error || "Failed to save client override configuration");
        }
      }
    } catch (error) {
      console.error("handleSave error:", error);
      toast.error("An unexpected error occurred while saving configuration");
    } finally {
      setIsSaving(false);
    }
  }, [config, selectedCustomerId]);

  const handleClearOverride = useCallback(async () => {
    if (!selectedCustomerId) return;
    if (confirm("Reset this client's customization completely and inherit from organization defaults?")) {
      setIsSaving(true);
      try {
        const result = await clearClientHubCustomerOverride(selectedCustomerId);
        if (result.success) {
          toast.success("Client configuration has been completely reset to org defaults.");
          setHasChanges(false);
          const reload = await getClientOverrideEditorState(selectedCustomerId);
          if (reload.success) {
            setConfig(reload.effectiveConfig);
            setOrgDefaultConfig(reload.orgDefault);
            setOverrideConfig({});
          }
        } else {
          toast.error(result.error || "Failed to reset overrides.");
        }
      } catch (error) {
        console.error("handleClearOverride error:", error);
        toast.error("An unexpected error occurred while resetting customization.");
      } finally {
        setIsSaving(false);
      }
    }
  }, [selectedCustomerId]);

  const refreshLifecycle = useCallback(async (customerId: string) => {
    const refresh = await getClientHubCustomerLifecycle(customerId);
    if (refresh.success && "readiness" in refresh) {
      applyAdminState({ readiness: refresh.readiness });
    }
  }, [applyAdminState]);

  const handleEnableClientHub = useCallback(async () => {
    if (!selectedCustomerId) return;
    setIsLoadingLifecycle(true);
    try {
      const result = await enableClientHubForCustomer(selectedCustomerId);
      if (result.success) {
        toast.success(result.inviteSent
          ? "Client Hub enabled and invite sent."
          : "Client Hub enabled for this customer.");
        if (result.inviteError) {
          toast.warning(result.inviteError);
        }
        await refreshLifecycle(selectedCustomerId);
      } else {
        toast.error(result.error || "Failed to enable Client Hub");
      }
    } catch (error) {
      console.error("handleEnableClientHub error:", error);
      toast.error("Failed to enable Client Hub");
    } finally {
      setIsLoadingLifecycle(false);
    }
  }, [selectedCustomerId, refreshLifecycle]);

  const handleDisableClientHub = useCallback(async () => {
    if (!selectedCustomerId) return;
    setIsLoadingLifecycle(true);
    try {
      const result = await disableClientHubForCustomer(selectedCustomerId);
      if (result.success) {
        toast.success("Client Hub disabled for this customer");
        await refreshLifecycle(selectedCustomerId);
      } else {
        toast.error(result.error || "Failed to disable Client Hub");
      }
    } catch (error) {
      console.error("handleDisableClientHub error:", error);
      toast.error("Failed to disable Client Hub");
    } finally {
      setIsLoadingLifecycle(false);
    }
  }, [selectedCustomerId, refreshLifecycle]);

  const handlePreviewClientHub = useCallback(async () => {
    if (!selectedCustomerId) return;
    setIsPreviewing(true);
    try {
      const result = await previewClientHubForCustomer(selectedCustomerId);
      if (result.success) {
        setPreviewConfig(result.effectiveConfig);
        setPreviewModalOpen(true);
      } else {
        toast.error(result.error || "Preview failed.");
      }
    } catch (error) {
      console.error("handlePreviewClientHub error:", error);
      toast.error("Failed to load preview.");
    } finally {
      setIsPreviewing(false);
    }
  }, [selectedCustomerId]);

  const handleCopyLink = useCallback(async () => {
    if (!selectedCustomerId) return;
    setIsCopyingLink(true);
    try {
      const result = await copyClientHubLink(selectedCustomerId);
      if (result.success) {
        await navigator.clipboard.writeText(result.url);
        toast.success("Hub link copied to clipboard.");
      } else {
        toast.error(result.error || "Failed to copy link.");
      }
    } catch (error) {
      console.error("handleCopyLink error:", error);
      toast.error("Failed to copy link.");
    } finally {
      setIsCopyingLink(false);
    }
  }, [selectedCustomerId]);

  const handleResendInvite = useCallback(async () => {
    if (!selectedCustomerId) return;
    setIsResendingInvite(true);
    try {
      const result = await resendClientHubInvite(selectedCustomerId);
      if (result.success) {
        toast.success("Invite resent successfully.");
        await refreshLifecycle(selectedCustomerId);
      } else {
        toast.error(result.error || "Failed to resend invite.");
      }
    } catch (error) {
      console.error("handleResendInvite error:", error);
      toast.error("Failed to resend invite.");
    } finally {
      setIsResendingInvite(false);
    }
  }, [selectedCustomerId, refreshLifecycle]);

  const isSectionOverridden = useCallback((sectionKey: keyof ClientHubConfig) => {
    if (!selectedCustomerId) return false;
    return JSON.stringify(orgDefaultConfig[sectionKey]) !== JSON.stringify(config[sectionKey]);
  }, [selectedCustomerId, orgDefaultConfig, config]);

  const isPreviewTab = activeTab === "preview";

  const handleTabChange = useCallback((nextTab: TabId) => {
    setActiveTab(nextTab);
    const tabPreviewPage = tabs.find((tab) => tab.id === nextTab)?.previewPage;
    if (tabPreviewPage) {
      setActivePreviewPage(tabPreviewPage);
    }
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-xl border border-[var(--border-soft)] bg-white p-10 shadow-[var(--shadow-card)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-cta)] border-t-transparent" />
          <p className="text-sm font-medium text-[var(--text-muted)]">Loading customization settings...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-[var(--border-soft)] bg-white p-10 text-center shadow-[var(--shadow-card)] max-w-lg mx-auto">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500">
          <Info className="h-6 w-6" />
        </div>
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Failed to Load Settings</h3>
        <p className="mt-2 text-xs text-[var(--text-muted)] max-w-sm mx-auto">{loadError}</p>
        <div className="mt-6">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setIsLoading(true);
              setLoadError(null);
              getClientHubOrgConfig().then((result) => {
                if (result.success) {
                  setConfig(result.config);
                } else {
                  setLoadError(result.error);
                }
                setIsLoading(false);
              });
            }}
          >
            Retry Loading
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-var(--topbar-height)-120px)] min-h-[600px] flex-col gap-6 lg:flex-row">
      {/* Left: Tab navigation + editor */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-[720px]">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {selectedCustomerId ? (
              <div className="flex items-center gap-2">
                <StatusBadge tone="amber">Client Specific Override</StatusBadge>
                {hasChanges && <StatusBadge tone="neutral">Unsaved Changes</StatusBadge>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <StatusBadge tone="success">Active Defaults</StatusBadge>
                {hasChanges && <StatusBadge tone="amber">Unsaved Changes</StatusBadge>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleReset} disabled={isSaving}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handleSave} disabled={isSaving || !hasChanges}>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {isSaving ? "Saving..." : "Save & Publish"}
            </Button>
          </div>
        </div>

        {/* Mode & Customer Picker dropdown */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
          <div className="space-y-1 w-full md:max-w-md">
            <label htmlFor="mode-picker" className="block text-xs font-semibold text-[var(--text-primary)]">
              Customization Target Scope
            </label>
            <select
              id="mode-picker"
              value={selectedCustomerId}
              onChange={(e) => handleModeChange(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-[var(--text-primary)] shadow-sm focus:border-[var(--brand-cta)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-cta)]"
            >
              <option value="">Global Defaults (Applies to all clients by default)</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  Client: {c.name} {c.email ? `(${c.email})` : ""}
                </option>
              ))}
            </select>
          </div>
          {selectedCustomerId && (
            <div className="mt-2 md:mt-4">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleClearOverride}
                disabled={isSaving}
                className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                Reset to Org Defaults
              </Button>
            </div>
          )}
        </div>

        {/* Sprint 3.4 — Per-Client Admin Workflow Panel */}
        {selectedCustomerId && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
            {/* Header row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[var(--text-primary)]">Client Hub Status:</span>
                {isLoadingLifecycle ? (
                  <span className="text-xs text-[var(--text-muted)]">Loading...</span>
                ) : lifecycleReadiness ? (
                  <StatusBadge
                    tone={
                      lifecycleReadiness.readinessStatus === "enabled_ready"
                        ? "success"
                        : lifecycleReadiness.readinessStatus === "enabled_not_ready"
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {lifecycleReadiness.readinessStatus === "enabled_ready"
                      ? "Enabled & Ready"
                      : lifecycleReadiness.readinessStatus === "enabled_not_ready"
                        ? "Enabled — Not Ready"
                        : "Disabled"}
                  </StatusBadge>
                ) : (
                  <StatusBadge tone="neutral">Unknown</StatusBadge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {lifecycleReadiness?.enabled ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleDisableClientHub}
                    disabled={isLoadingLifecycle}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                  >
                    Disable Client Hub
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleEnableClientHub}
                    disabled={isLoadingLifecycle}
                    className="text-xs"
                  >
                    Enable Client Hub
                  </Button>
                )}
              </div>
            </div>

            {/* Admin actions row */}
            {lifecycleReadiness?.enabled && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePreviewClientHub}
                  disabled={isPreviewing || !lifecycleReadiness.previewEligible}
                  className="text-xs"
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" />
                  {isPreviewing ? "Loading…" : "Preview as Client"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyLink}
                  disabled={isCopyingLink}
                  className="text-xs"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  {isCopyingLink ? "Copied" : "Copy Hub Link"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleResendInvite}
                  disabled={isResendingInvite || !lifecycleReadiness.inviteEligible}
                  className="text-xs"
                >
                  <Mail className="mr-1.5 h-3.5 w-3.5" />
                  {isResendingInvite ? "Sending…" : adminState?.inviteState === "never_sent" ? "Send Invite" : "Resend Invite"}
                </Button>
              </div>
            )}

            {/* Invite / access state */}
            {adminState && lifecycleReadiness?.enabled && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    {adminState.inviteState === "sent" || adminState.inviteState === "resent" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    ) : adminState.inviteState === "email_changed" ? (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full bg-slate-300" />
                    )}
                    <span className="font-medium text-[var(--text-primary)]">
                      Invite state:
                    </span>
                    <span className={cn(
                      adminState.inviteState === "sent" || adminState.inviteState === "resent"
                        ? "text-green-700"
                        : adminState.inviteState === "email_changed"
                          ? "text-amber-700"
                          : "text-slate-600"
                    )}>
                      {adminState.inviteState === "sent" && "Invite sent"}
                      {adminState.inviteState === "resent" && "Invite resent"}
                      {adminState.inviteState === "never_sent" && "Never sent"}
                      {adminState.inviteState === "email_changed" && "Email changed since last invite"}
                    </span>
                  </div>
                </div>
                {adminState.latestInviteSentAt && (
                  <div className="text-xs text-slate-600">
                    Last invite: {new Date(adminState.latestInviteSentAt).toLocaleString()}
                    {adminState.latestInviteEmail && (
                      <span className="ml-1">to {adminState.latestInviteEmail}</span>
                    )}
                  </div>
                )}
                {adminState.inviteSentCount > 0 && (
                  <div className="text-xs text-slate-600">
                    Total invites sent: {adminState.inviteSentCount}
                  </div>
                )}
                {adminState.canonicalHubUrl && (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <ExternalLink className="h-3 w-3" />
                    <span className="truncate">{adminState.canonicalHubUrl}</span>
                  </div>
                )}
              </div>
            )}

            {/* Readiness indicators */}
            {lifecycleReadiness && (
              <div className="flex flex-wrap gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", lifecycleReadiness.previewEligible ? "bg-green-500" : "bg-slate-300")} />
                  <span className={lifecycleReadiness.previewEligible ? "text-green-700" : "text-slate-500"}>
                    Preview {lifecycleReadiness.previewEligible ? "Eligible" : "Not Eligible"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", lifecycleReadiness.inviteEligible ? "bg-green-500" : "bg-slate-300")} />
                  <span className={lifecycleReadiness.inviteEligible ? "text-green-700" : "text-slate-500"}>
                    Invite {lifecycleReadiness.inviteEligible ? "Eligible" : "Not Eligible"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("h-2 w-2 rounded-full", lifecycleReadiness.portalReady ? "bg-green-500" : "bg-slate-300")} />
                  <span className={lifecycleReadiness.portalReady ? "text-green-700" : "text-slate-500"}>
                    Portal {lifecycleReadiness.portalReady ? "Ready" : "Not Ready"}
                  </span>
                </div>
              </div>
            )}

            {lifecycleReadiness && lifecycleReadiness.blockers.length > 0 && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-xs font-semibold text-red-800">Readiness Blockers</p>
                <ul className="mt-1 list-disc list-inside text-xs text-red-700">
                  {lifecycleReadiness.blockers.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Persistent settings notice */}
        {!selectedCustomerId ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <p className="font-medium">Organization Default Settings</p>
            <p className="mt-0.5 text-xs text-blue-700">
              These customizations define the default branding, visible sections, and content for all clients unless overridden at the individual client level.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Client-Specific override mode</p>
            <p className="mt-0.5 text-xs text-amber-700">
              Editing values here will apply custom overrides strictly to this client. Unmodified settings will continue inheriting organization defaults automatically.
            </p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--border-soft)] pb-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-[var(--surface-subtle)] text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Editor content */}
        <div className="flex-1 overflow-y-auto pr-1">
          {selectedCustomerId && activeTab !== "preview" && (
            <div className={cn(
              "flex items-center justify-between p-3 rounded-lg border mb-4 text-xs",
              isSectionOverridden(activeTab as any) 
                ? "bg-amber-50 border-amber-200 text-amber-800" 
                : "bg-green-50 border-green-200 text-green-800"
            )}>
              <div>
                <span className="font-semibold capitalize">{activeTab} Section Status: </span>
                {isSectionOverridden(activeTab as any) ? (
                  <span>This section has <strong>custom overrides</strong> for this client.</span>
                ) : (
                  <span>This section is currently <strong>inheriting all values</strong> from organization defaults.</span>
                )}
              </div>
              {isSectionOverridden(activeTab as any) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const next = { ...config };
                    next[activeTab as keyof ClientHubConfig] = orgDefaultConfig[activeTab as keyof ClientHubConfig] as any;
                    handleConfigChange(next);
                    toast.info(`Reverted ${activeTab} section to organization defaults`);
                  }}
                  className="text-[0.7rem] px-2 py-0.5 h-6 border-amber-300 hover:bg-amber-100 font-medium"
                >
                  Revert Section
                </Button>
              )}
            </div>
          )}

          {activeTab === "branding" && <BrandingSection config={config} onChange={handleConfigChange} />}
          {activeTab === "home" && <HomeDashboardSection config={config} onChange={handleConfigChange} />}
          {activeTab === "invoices" && <InvoicesSection config={config} onChange={handleConfigChange} />}
          {activeTab === "quotes" && <QuotesSection config={config} onChange={handleConfigChange} />}
          {activeTab === "payments" && <PaymentsSection config={config} onChange={handleConfigChange} />}
          {activeTab === "about" && <AboutSection config={config} onChange={handleConfigChange} />}
          {activeTab === "contact" && <ContactSection config={config} onChange={handleConfigChange} />}
          {activeTab === "products" && <ProductsSection config={config} onChange={handleConfigChange} />}
          {activeTab === "navigation" && <NavigationSection config={config} onChange={handleConfigChange} />}
          {activeTab === "preview" && (
            <div className="space-y-4">
              <SectionCard title="Preview Controls" description="Switch between client hub pages to preview your customizations.">
                <div className="flex flex-wrap gap-2">
                  {tabs
                    .filter((t) => t.previewPage)
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActivePreviewPage(t.previewPage!)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                          activePreviewPage === t.previewPage
                            ? "bg-[var(--brand-cta)] text-white"
                            : "border border-[var(--border-soft)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                </div>
              </SectionCard>
              <div className="h-[500px]">
                <PreviewPane config={config} previewPage={activePreviewPage} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Live preview (hidden on mobile when not preview tab) */}
      <div className={cn("hidden lg:block lg:w-[440px] xl:w-[520px]", isPreviewTab && "hidden")}>
        <div className="sticky top-0 flex h-full flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Preview</h3>
            <StatusBadge tone="amber">Preview only</StatusBadge>
          </div>
          <div className="flex-1">
            <PreviewPane config={config} previewPage={activePreviewPage} />
          </div>
        </div>
      </div>

      {/* Preview Modal for customer-scoped effective preview */}
      <Modal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Client Hub Preview"
        subtitle="Effective client-facing hub for the selected customer."
        size="xl"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {tabs
              .filter((t) => t.previewPage)
              .map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActivePreviewPage(t.previewPage!)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activePreviewPage === t.previewPage
                      ? "bg-[var(--brand-cta)] text-white"
                      : "border border-[var(--border-soft)] text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                  )}
                >
                  {t.label}
                </button>
              ))}
          </div>
          <div className="h-[60vh] rounded-xl border border-[var(--border-soft)] overflow-hidden">
            {previewConfig ? (
              <PreviewPane config={previewConfig} previewPage={activePreviewPage} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
                Loading preview...
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-soft)] bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
        {description && <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p>}
      </div>
      {children}
    </div>
  );
}
