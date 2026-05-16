"use client";

import { useState, useCallback } from "react";
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
import type { ClientHubConfig } from "./mock-config";
import { DEFAULT_CLIENT_HUB_CONFIG } from "./mock-config";
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

  const handleConfigChange = useCallback((next: ClientHubConfig) => {
    setConfig(next);
    setHasChanges(true);
  }, []);

  const handleReset = useCallback(() => {
    if (confirm("Reset all customization values to their defaults?")) {
      setConfig(DEFAULT_CLIENT_HUB_CONFIG);
      setHasChanges(false);
    }
  }, []);
  const isPreviewTab = activeTab === "preview";

  const handleTabChange = useCallback((nextTab: TabId) => {
    setActiveTab(nextTab);
    const tabPreviewPage = tabs.find((tab) => tab.id === nextTab)?.previewPage;
    if (tabPreviewPage) {
      setActivePreviewPage(tabPreviewPage);
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-var(--topbar-height)-120px)] min-h-[600px] flex-col gap-6 lg:flex-row">
      {/* Left: Tab navigation + editor */}
      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:max-w-[720px]">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StatusBadge tone="amber">Draft shell</StatusBadge>
            {hasChanges && <StatusBadge tone="neutral">Unsaved changes</StatusBadge>}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save draft
            </Button>
            <Button type="button" variant="primary" size="sm" disabled>
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Publish
            </Button>
          </div>
        </div>

        {/* Static-only notice */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">Phase 1 — Preview Only</p>
          <p className="mt-0.5 text-xs text-amber-700">
            Customizations are local to this session. Real persistence, publishing, and per-client overrides will be enabled in Phase 3.
          </p>
        </div>

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
