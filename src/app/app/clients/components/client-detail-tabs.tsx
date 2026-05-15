import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  Users,
  CreditCard,
  Globe,
  Activity,
} from "lucide-react";

type DetailTab = "overview" | "documents" | "contacts" | "billing" | "portal" | "activity";

const TABS: { key: DetailTab; label: string; icon: React.ElementType }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "documents", label: "Documents", icon: FileText },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "billing", label: "Billing & Tax", icon: CreditCard },
  { key: "portal", label: "Portal", icon: Globe },
  { key: "activity", label: "Activity", icon: Activity },
];

interface ClientDetailTabsProps {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}

export function ClientDetailTabs({ activeTab, onTabChange }: ClientDetailTabsProps) {
  return (
    <nav
      className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border-soft)] pb-0"
      aria-label="Client detail sections"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] rounded-t-lg",
              isActive
                ? "border-b-2 border-[var(--brand-primary)] text-[var(--brand-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
