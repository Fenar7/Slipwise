import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  BellRing,
  Building2,
  CreditCard,
  DoorOpen,
  Eye,
  FileDigit,
  FileStack,
  Globe2,
  HandCoins,
  History,
  KeyRound,
  Landmark,
  Languages,
  LayoutGrid,
  Link2,
  Palette,
  Plug,
  Receipt,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  Star,
  User,
  UserCog,
  Users,
  Wallet,
  Webhook,
  LayoutTemplate,
} from "lucide-react";

export type SettingsNavVisibility = "primary" | "secondary" | "contextual";

export interface SettingsGroupDefinition {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface SettingsRouteEntry {
  id: string;
  groupId: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  keywords: string[];
  navVisibility: SettingsNavVisibility;
  parentId?: string;
  statusBadge?: string;
}

export const settingsGroups: SettingsGroupDefinition[] = [
  {
    id: "account-security",
    label: "Account & Security",
    description: "Your profile, access controls, authentication, and sign-in protection.",
    icon: Shield,
  },
  {
    id: "organization-team",
    label: "Organization & Team",
    description: "Organization identity, member access, roles, entities, and approvals.",
    icon: Building2,
  },
  {
    id: "templates-documents",
    label: "Templates & Documents",
    description: "Template governance, default assignments, and numbering workflows.",
    icon: FileStack,
  },
  {
    id: "regional-operations",
    label: "Regional & Operations",
    description: "Regional defaults, payroll operations, and statutory document preferences.",
    icon: Globe2,
  },
  {
    id: "integrations-platform",
    label: "Integrations & Developer Platform",
    description: "App connections, API access, tokens, OAuth apps, and webhook delivery.",
    icon: Plug,
  },
  {
    id: "payments-billing",
    label: "Payments & Billing",
    description: "Payment methods, subscriptions, invoices, and account usage.",
    icon: CreditCard,
  },
  {
    id: "portal-external",
    label: "Portal & External Access",
    description: "Customer portal, partner access, policies, and external-facing readiness.",
    icon: DoorOpen,
  },
  {
    id: "advanced-admin",
    label: "Advanced & Admin",
    description: "Proxy access, audit trails, enterprise controls, and privileged admin tools.",
    icon: Settings2,
  },
];

export const settingsRouteEntries: SettingsRouteEntry[] = [
  {
    id: "profile",
    groupId: "account-security",
    label: "Profile",
    description: "Update your display name, account identity, and personal workspace details.",
    href: "/app/settings/profile",
    icon: User,
    keywords: ["name", "email", "account", "personal"],
    navVisibility: "primary",
  },
  {
    id: "security",
    groupId: "account-security",
    label: "Security",
    description: "Manage password, passkeys, MFA, and session hygiene.",
    href: "/app/settings/security",
    icon: ShieldCheck,
    keywords: ["password", "mfa", "passkeys", "sessions"],
    navVisibility: "primary",
  },
  {
    id: "sso-saml",
    groupId: "account-security",
    label: "SSO / SAML",
    description: "Configure sign-in providers and enterprise authentication rules.",
    href: "/app/settings/security/sso",
    icon: KeyRound,
    keywords: ["single sign-on", "identity provider", "saml"],
    navVisibility: "primary",
  },
  {
    id: "organization",
    groupId: "organization-team",
    label: "Organization",
    description: "Set business identity, branding, and financial defaults for your org.",
    href: "/app/settings/organization",
    icon: Palette,
    keywords: ["branding", "company", "org", "business profile"],
    navVisibility: "primary",
  },
  {
    id: "users",
    groupId: "organization-team",
    label: "Team Members",
    description: "Invite members, manage active users, and review pending invitations.",
    href: "/app/settings/users",
    icon: Users,
    keywords: ["members", "team", "invite", "people"],
    navVisibility: "primary",
  },
  {
    id: "roles",
    groupId: "organization-team",
    label: "Roles & Permissions",
    description: "Control role-based permissions and operational access boundaries.",
    href: "/app/settings/roles",
    icon: UserCog,
    keywords: ["permissions", "roles", "authorization"],
    navVisibility: "primary",
  },
  {
    id: "custom-roles",
    groupId: "organization-team",
    label: "Custom Roles",
    description: "Define and review custom role templates for your organization.",
    href: "/app/settings/users/roles",
    icon: BadgeCheck,
    keywords: ["custom", "role templates", "member roles"],
    navVisibility: "secondary",
    parentId: "roles",
  },
  {
    id: "entities",
    groupId: "organization-team",
    label: "Entity Groups",
    description: "Organize legal entities and reporting structures for consolidated work.",
    href: "/app/settings/entities",
    icon: LayoutGrid,
    keywords: ["entities", "companies", "grouping"],
    navVisibility: "primary",
  },
  {
    id: "approvals-delegations",
    groupId: "organization-team",
    label: "Approval Delegations",
    description: "Define temporary approver handoffs and delegation windows.",
    href: "/app/settings/approvals/delegations",
    icon: ArrowLeftRight,
    keywords: ["delegation", "approvals", "backup approver"],
    navVisibility: "secondary",
  },
  {
    id: "templates",
    groupId: "templates-documents",
    label: "Template Library",
    description: "Browse, manage, and compare available document templates by type.",
    href: "/app/settings/templates",
    icon: FileStack,
    keywords: ["templates", "document templates", "library"],
    navVisibility: "primary",
  },
  {
    id: "tag-management",
    groupId: "templates-documents",
    label: "Tag Management",
    description: "Manage your organisation's document tag vocabulary, usage, and governance.",
    href: "/app/settings/tags",
    icon: FileStack,
    keywords: ["tags", "tag management", "catalog", "rename", "archive"],
    navVisibility: "primary",
  },
  {
    id: "template-defaults",
    groupId: "templates-documents",
    label: "Default Templates",
    description: "Choose the default template used for each supported document workflow.",
    href: "/app/settings/templates/defaults",
    icon: Star,
    keywords: ["defaults", "template assignment", "governance"],
    navVisibility: "primary",
  },
  {
    id: "sequences",
    groupId: "templates-documents",
    label: "Document Numbering",
    description: "Control numbering sequences and prefixes for generated records.",
    href: "/app/settings/sequences",
    icon: FileDigit,
    keywords: ["sequence", "numbering", "prefixes"],
    navVisibility: "primary",
  },
  {
    id: "sequence-history",
    groupId: "templates-documents",
    label: "Sequence History",
    description: "Audit historical sequence changes and numbering activity over time.",
    href: "/app/settings/sequences/history",
    icon: History,
    keywords: ["history", "audit", "numbering log"],
    navVisibility: "secondary",
    parentId: "sequences",
  },
  {
    id: "i18n",
    groupId: "regional-operations",
    label: "Language & Currency",
    description: "Set language, locale, currency, and formatting defaults for your workspace.",
    href: "/app/settings/i18n",
    icon: Languages,
    keywords: ["locale", "currency", "language", "formatting"],
    navVisibility: "primary",
  },
  {
    id: "payroll",
    groupId: "regional-operations",
    label: "Payroll",
    description: "Manage salary-slip defaults, payroll preferences, and payroll operations.",
    href: "/app/settings/payroll",
    icon: Wallet,
    keywords: ["salary", "payroll", "employees"],
    navVisibility: "primary",
  },
  {
    id: "einvoice",
    groupId: "regional-operations",
    label: "E-Invoice Configuration",
    description: "Configure statutory e-invoicing settings and compliance-specific values.",
    href: "/app/settings/compliance/einvoice",
    icon: Receipt,
    keywords: ["gst", "compliance", "einvoice", "invoice config"],
    navVisibility: "secondary",
  },
  {
    id: "integrations",
    groupId: "integrations-platform",
    label: "Integrations",
    description: "Connect external systems and manage operational data handoffs.",
    href: "/app/settings/integrations",
    icon: Link2,
    keywords: ["apps", "connections", "integrations"],
    navVisibility: "primary",
  },
  {
    id: "tally",
    groupId: "integrations-platform",
    label: "Tally ERP",
    description: "Configure imports and exports for Tally ERP accounting workflows.",
    href: "/app/settings/integrations/tally",
    icon: Landmark,
    keywords: ["tally", "erp", "accounting integration"],
    navVisibility: "secondary",
    parentId: "integrations",
  },
  {
    id: "api",
    groupId: "integrations-platform",
    label: "Developer Overview",
    description: "Review API access, integration entry points, and developer controls.",
    href: "/app/settings/api",
    icon: AppWindow,
    keywords: ["api", "developer", "platform"],
    navVisibility: "primary",
  },
  {
    id: "api-tokens",
    groupId: "integrations-platform",
    label: "API Tokens",
    description: "Generate and revoke personal API tokens for authenticated automation.",
    href: "/app/settings/developer/tokens",
    icon: KeyRound,
    keywords: ["tokens", "developer tokens", "secret"],
    navVisibility: "secondary",
    parentId: "api",
  },
  {
    id: "oauth-apps",
    groupId: "integrations-platform",
    label: "OAuth Apps",
    description: "Create and manage OAuth client credentials for connected applications.",
    href: "/app/settings/developer/oauth-apps",
    icon: BellRing,
    keywords: ["oauth", "apps", "client credentials"],
    navVisibility: "secondary",
    parentId: "api",
  },
  {
    id: "webhooks-v2",
    groupId: "integrations-platform",
    label: "Webhooks v2",
    description: "Configure outbound event delivery endpoints and signing secrets.",
    href: "/app/settings/developer/webhooks/v2",
    icon: Webhook,
    keywords: ["webhooks", "events", "delivery"],
    navVisibility: "primary",
  },
  {
    id: "webhooks-legacy",
    groupId: "integrations-platform",
    label: "Legacy Webhooks",
    description: "Access the older webhook configuration surface where still needed.",
    href: "/app/settings/webhooks",
    icon: Webhook,
    keywords: ["webhooks", "legacy", "old webhooks"],
    navVisibility: "secondary",
    statusBadge: "Legacy",
  },
  {
    id: "webhook-deliveries",
    groupId: "integrations-platform",
    label: "Webhook Deliveries",
    description: "Inspect delivery attempts and payload logs for a webhook endpoint.",
    href: "/app/settings/developer/webhooks",
    icon: ScrollText,
    keywords: ["deliveries", "delivery log", "webhook logs"],
    navVisibility: "contextual",
    parentId: "webhooks-v2",
  },
  {
    id: "payments",
    groupId: "payments-billing",
    label: "Payment Gateway",
    description: "Configure payment providers, settlement settings, and gateway status.",
    href: "/app/settings/payments",
    icon: HandCoins,
    keywords: ["payments", "gateway", "settlement"],
    navVisibility: "primary",
  },
  {
    id: "billing",
    groupId: "payments-billing",
    label: "Billing & Subscription",
    description: "Manage plan details, billing history, and subscription lifecycle changes.",
    href: "/app/settings/billing",
    icon: CreditCard,
    keywords: ["billing", "subscription", "plans", "invoices"],
    navVisibility: "primary",
  },
  {
    id: "billing-usage",
    groupId: "payments-billing",
    label: "Usage & Limits",
    description: "Track workspace usage, limits, and account consumption over time.",
    href: "/app/settings/billing/usage",
    icon: BarChart3,
    keywords: ["usage", "limits", "consumption"],
    navVisibility: "secondary",
    parentId: "billing",
  },
  {
    id: "portal",
    groupId: "portal-external",
    label: "Customer Portal",
    description: "Manage portal availability, experience settings, and entry controls.",
    href: "/app/settings/portal",
    icon: DoorOpen,
    keywords: ["portal", "customer portal"],
    navVisibility: "primary",
  },
  {
    id: "portal-access",
    groupId: "portal-external",
    label: "Portal Access",
    description: "Review active customer sessions and access-level conditions.",
    href: "/app/settings/portal/access",
    icon: Eye,
    keywords: ["sessions", "portal access"],
    navVisibility: "secondary",
    parentId: "portal",
  },
  {
    id: "portal-activity",
    groupId: "portal-external",
    label: "Portal Activity",
    description: "Audit customer portal events and recent external interactions.",
    href: "/app/settings/portal/activity",
    icon: ScrollText,
    keywords: ["activity", "portal log"],
    navVisibility: "secondary",
    parentId: "portal",
  },
  {
    id: "portal-analytics",
    groupId: "portal-external",
    label: "Portal Analytics",
    description: "Monitor portal usage trends, engagement, and adoption.",
    href: "/app/settings/portal/analytics",
    icon: BarChart3,
    keywords: ["analytics", "portal metrics"],
    navVisibility: "secondary",
    parentId: "portal",
  },
  {
    id: "portal-policies",
    groupId: "portal-external",
    label: "Portal Policies",
    description: "Set session behavior, capabilities, and customer-facing access rules.",
    href: "/app/settings/portal/policies",
    icon: Shield,
    keywords: ["policies", "portal rules"],
    navVisibility: "secondary",
    parentId: "portal",
  },
  {
    id: "portal-readiness",
    groupId: "portal-external",
    label: "Portal Readiness",
    description: "Review launch readiness and configuration completeness for the portal.",
    href: "/app/settings/portal/readiness",
    icon: BadgeCheck,
    keywords: ["readiness", "checklist", "launch"],
    navVisibility: "secondary",
    parentId: "portal",
  },
  {
    id: "client-hub-customization",
    groupId: "portal-external",
    label: "Client Hub Customization",
    description: "Customize branding, content, and experience for your client-facing hub.",
    href: "/app/settings/portal/client-hub",
    icon: LayoutTemplate,
    keywords: ["client hub", "customization", "branding", "portal theme", "client experience"],
    navVisibility: "primary",
    statusBadge: "Beta",
  },
  {
    id: "partners",
    groupId: "portal-external",
    label: "Partner Access",
    description: "Manage partner-facing entry points and external collaboration access.",
    href: "/app/settings/partners",
    icon: Users,
    keywords: ["partners", "external access"],
    navVisibility: "secondary",
  },
  {
    id: "proxy-access",
    groupId: "advanced-admin",
    label: "Proxy Access",
    description: "Grant or revoke delegated account access for support and admin workflows.",
    href: "/app/settings/access",
    icon: Eye,
    keywords: ["proxy", "support access", "delegate"],
    navVisibility: "primary",
  },
  {
    id: "audit-log",
    groupId: "advanced-admin",
    label: "Audit Log",
    description: "Inspect security-sensitive changes and operational activity across the org.",
    href: "/app/settings/audit",
    icon: ScrollText,
    keywords: ["audit", "log", "activity"],
    navVisibility: "primary",
  },
  {
    id: "enterprise",
    groupId: "advanced-admin",
    label: "Enterprise",
    description: "Manage enterprise-grade controls, governance, and rollout constraints.",
    href: "/app/settings/enterprise",
    icon: Building2,
    keywords: ["enterprise", "governance", "advanced"],
    navVisibility: "primary",
  },
];

function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isSettingsHrefActive(pathname: string, href: string) {
  const normalizedPath = normalizePath(pathname);
  const normalizedHref = normalizePath(href);
  return (
    normalizedPath === normalizedHref ||
    normalizedPath.startsWith(`${normalizedHref}/`)
  );
}

export function getSettingsGroup(groupId: string) {
  return settingsGroups.find((group) => group.id === groupId) ?? null;
}

export function getSettingsGroupEntries(groupId: string, includeContextual = false) {
  return settingsRouteEntries.filter(
    (entry) =>
      entry.groupId === groupId &&
      (includeContextual || entry.navVisibility !== "contextual")
  );
}

export function getSettingsPrimaryEntries(groupId: string) {
  return settingsRouteEntries.filter(
    (entry) => entry.groupId === groupId && entry.navVisibility === "primary"
  );
}

export function getSettingsVisibleEntries(groupId: string) {
  return settingsRouteEntries.filter(
    (entry) =>
      entry.groupId === groupId &&
      (entry.navVisibility === "primary" || entry.navVisibility === "secondary")
  );
}

export function getSettingsEntryByPath(pathname: string) {
  const activeEntries = settingsRouteEntries
    .filter((entry) => isSettingsHrefActive(pathname, entry.href))
    .sort((left, right) => right.href.length - left.href.length);
  return activeEntries[0] ?? null;
}

export function getSettingsContext(pathname: string) {
  const entry = getSettingsEntryByPath(pathname);
  const group = entry ? getSettingsGroup(entry.groupId) : null;
  const visibleEntries = entry ? getSettingsVisibleEntries(entry.groupId) : [];
  const siblings = entry
    ? visibleEntries.filter((item) => item.id !== entry.id).slice(0, 5)
    : [];

  return {
    entry,
    group,
    siblings,
  };
}

export function searchSettingsEntries(query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return settingsRouteEntries.filter((entry) => entry.navVisibility !== "contextual");

  return settingsRouteEntries.filter((entry) => {
    if (entry.navVisibility === "contextual") return false;
    return (
      entry.label.toLowerCase().includes(normalizedQuery) ||
      entry.description.toLowerCase().includes(normalizedQuery) ||
      entry.keywords.some((keyword) =>
        keyword.toLowerCase().includes(normalizedQuery)
      ) ||
      getSettingsGroup(entry.groupId)?.label.toLowerCase().includes(normalizedQuery)
    );
  });
}

export const settingsPopularTaskIds = [
  "profile",
  "security",
  "organization",
  "users",
  "templates",
  "billing",
] as const;

export function getSettingsPopularTasks() {
  return settingsPopularTaskIds
    .map((id) => settingsRouteEntries.find((entry) => entry.id === id))
    .filter((entry): entry is SettingsRouteEntry => Boolean(entry));
}
