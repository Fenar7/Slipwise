"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
} from "@/app/app/actions/client-hub-actions";
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

function StatusBadge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "amber" | "success" }) {
  const toneClasses = {
    neutral: "bg-slate-100 text-slate-600",
    amber: "bg-amber-50 text-amber-700",
    success: "bg-green-50 text-green-700",
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

  // New Per-Client Override State
  const [customers, setCustomers] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [orgDefaultConfig, setOrgDefaultConfig] = useState<ClientHubConfig>(DEFAULT_CLIENT_HUB_CONFIG);
  const [overrideConfig, setOverrideConfig] = useState<any>({});

  useEffect(() => {
    async function loadConfig() {
      try {
        setIsLoading(true);
        // Load org default config
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

        // Load list of customers for picker
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

  const handleModeChange = useCallback(async (customerId: string) => {
    setIsLoading(true);
    setHasChanges(false);
    setSelectedCustomerId(customerId);

    try {
      if (!customerId) {
        // Switch to Org Defaults Mode
        const orgRes = await getClientHubOrgConfig();
        if (orgRes.success) {
          setConfig(orgRes.config);
          setOrgDefaultConfig(orgRes.config);
          setOverrideConfig({});
        } else {
          toast.error(orgRes.error);
        }
      } else {
        // Switch to Client Override Mode
        const res = await getClientOverrideEditorState(customerId);
        if (res.success) {
          setConfig(res.effectiveConfig);
          setOrgDefaultConfig(res.orgDefault);
          setOverrideConfig(res.overrideConfig);
        } else {
          toast.error(res.error || "Failed to load client override settings");
          setSelectedCustomerId(""); // Revert to org defaults mode on failure
        }
      }
    } catch (error) {
      console.error("Error switching customization mode:", error);
      toast.error("Failed to switch context.");
      setSelectedCustomerId("");
    } finally {
      setIsLoading(false);
    }
  }, []);

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
          // Reload fresh effective configuration state
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
          // Reload
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
