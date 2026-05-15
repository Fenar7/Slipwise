/**
 * Phase 1 Sprint 1.4 — explicit static mock configuration for the Client Hub
 * admin customization shell. All fixtures are local to this shell and clearly
 * labeled as mock data. No persistence or backend coupling.
 */

export interface BrandingConfig {
  accentColor: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  fontFamily: string;
  removePoweredBy: boolean;
}

export interface HomeDashboardConfig {
  heroTitle: string;
  heroSubtitle: string;
  showOutstandingBalance: boolean;
  showPendingInvoices: boolean;
  showPendingQuotes: boolean;
  showQuickActions: boolean;
  welcomeMessage: string;
}

export interface InvoicesConfig {
  pageTitle: string;
  pageDescription: string;
  showDownloadAction: boolean;
  showPayAction: boolean;
  columns: string[];
}

export interface QuotesConfig {
  pageTitle: string;
  pageDescription: string;
  showAcceptReject: boolean;
  showDownloadAction: boolean;
}

export interface PaymentsConfig {
  pageTitle: string;
  pageDescription: string;
  showPaymentMethods: boolean;
  acceptedMethods: string[];
}

export interface AboutConfig {
  pageTitle: string;
  heading: string;
  body: string;
  showTeam: boolean;
  showFoundedYear: boolean;
  foundedYear: string;
}

export interface ContactConfig {
  pageTitle: string;
  heading: string;
  supportEmail: string;
  supportPhone: string;
  businessHours: string;
  showMapPlaceholder: boolean;
  additionalContacts: { label: string; value: string }[];
}

export interface ProductsConfig {
  pageTitle: string;
  heading: string;
  description: string;
  showPricing: boolean;
  showUnit: boolean;
}

export interface NavigationConfig {
  showDashboard: boolean;
  showInvoices: boolean;
  showQuotes: boolean;
  showPayments: boolean;
  showAbout: boolean;
  showContact: boolean;
  showProducts: boolean;
  footerText: string;
  footerLinks: { label: string; href: string }[];
}

export interface ClientHubConfig {
  branding: BrandingConfig;
  homeDashboard: HomeDashboardConfig;
  invoices: InvoicesConfig;
  quotes: QuotesConfig;
  payments: PaymentsConfig;
  about: AboutConfig;
  contact: ContactConfig;
  products: ProductsConfig;
  navigation: NavigationConfig;
}

export const DEFAULT_CLIENT_HUB_CONFIG: ClientHubConfig = {
  branding: {
    accentColor: "#2563eb",
    logoUrl: null,
    faviconUrl: null,
    fontFamily: "Inter",
    removePoweredBy: false,
  },
  homeDashboard: {
    heroTitle: "Welcome to your Client Hub",
    heroSubtitle: "Review invoices, respond to quotes, and stay on top of your account",
    showOutstandingBalance: true,
    showPendingInvoices: true,
    showPendingQuotes: true,
    showQuickActions: true,
    welcomeMessage: "",
  },
  invoices: {
    pageTitle: "Invoices",
    pageDescription: "View and manage your invoices",
    showDownloadAction: true,
    showPayAction: true,
    columns: ["invoiceNumber", "date", "amount", "status"],
  },
  quotes: {
    pageTitle: "Quotes",
    pageDescription: "Review and respond to your quotes",
    showAcceptReject: true,
    showDownloadAction: true,
  },
  payments: {
    pageTitle: "Payments",
    pageDescription: "View your payment history and make new payments",
    showPaymentMethods: true,
    acceptedMethods: ["Bank Transfer", "UPI", "Card"],
  },
  about: {
    pageTitle: "About",
    heading: "About Us",
    body: "We are a trusted partner dedicated to delivering excellence in every engagement. Our team brings deep expertise and a commitment to your success.",
    showTeam: false,
    showFoundedYear: false,
    foundedYear: "",
  },
  contact: {
    pageTitle: "Contact",
    heading: "Get in Touch",
    supportEmail: "support@company.com",
    supportPhone: "+91 98765 43210",
    businessHours: "Mon – Fri, 9:00 AM – 6:00 PM IST",
    showMapPlaceholder: true,
    additionalContacts: [],
  },
  products: {
    pageTitle: "Products & Services",
    heading: "Our Offerings",
    description: "Explore the products and services we offer to help your business grow.",
    showPricing: true,
    showUnit: true,
  },
  navigation: {
    showDashboard: true,
    showInvoices: true,
    showQuotes: true,
    showPayments: true,
    showAbout: true,
    showContact: true,
    showProducts: true,
    footerText: "All rights reserved.",
    footerLinks: [
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
};

export const PREVIEW_ORG = {
  name: "Acme Corporation",
  slug: "acme",
};
