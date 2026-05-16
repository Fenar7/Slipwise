/**
 * Phase 1 Sprint 1.4 — explicit static mock configuration for the Client Hub
 * admin customization shell. All fixtures are local to this shell and clearly
 * labeled as mock data. No persistence or backend coupling.
 */

import type { ClientHubConfig } from "@/app/portal/[orgSlug]/client-hub/components/customization-contract";

export const DEFAULT_CLIENT_HUB_CONFIG: ClientHubConfig = {
  branding: {
    accentColor: "#6ed5ab",
    logoUrl: null,
    removePoweredBy: false,
  },
  homeDashboard: {
    heroTitle: "Your business hub, beautifully organized",
    heroSubtitle: "Track invoices, review quotes, and stay close to your team from one polished workspace.",
    showOutstandingBalance: true,
    showPendingInvoices: true,
    showPendingQuotes: true,
    showQuickActions: true,
    welcomeMessage: "Client Portal",
  },
  invoices: {
    pageTitle: "Invoices",
    pageDescription: "Review balances, due dates, and payment options in one place.",
    showDownloadAction: true,
    showPayAction: true,
  },
  quotes: {
    pageTitle: "Quotes",
    pageDescription: "Review proposals, timelines, and next steps before you respond.",
    showAcceptReject: true,
    showDownloadAction: true,
  },
  payments: {
    pageTitle: "Payments",
    pageDescription: "See completed payments and choose how you want to settle open balances.",
    showPaymentMethods: true,
    acceptedMethods: ["Payment Link", "Bank Transfer", "UPI"],
  },
  about: {
    pageTitle: "About",
    heading: "Built to make client collaboration feel effortless",
    body: "We combine clear communication, dependable delivery, and thoughtful design so every invoice, quote, and client interaction feels simple and trustworthy.",
    showFoundedYear: false,
    foundedYear: "",
  },
  contact: {
    pageTitle: "Contact",
    heading: "Get in touch with the team behind your account",
    supportEmail: "support@acme.com",
    supportPhone: "+91 98765 43210",
    businessHours: "Mon – Fri, 9:00 AM – 6:00 PM IST",
    showMapPlaceholder: true,
  },
  products: {
    pageTitle: "Products & Services",
    heading: "Products and services tailored to your growth",
    description: "Explore the retained services, implementation packages, and strategic support we offer.",
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
    footerText: "A calmer, clearer place to work with us.",
  },
};

export const PREVIEW_ORG = {
  name: "Acme Corporation",
  slug: "acme",
};
