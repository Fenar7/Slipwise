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
    heroTitle: "Your Business Hub",
    heroSubtitle: "Welcome to your personalized client portal. Access your projects, invoices, and communicate with our team all in one place.",
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
    pageTitle: "Contact Us",
    heading: "Get in touch with our team - we're here to help",
    supportEmail: "support@company.com",
    supportPhone: "+971 XX XXX XXXX",
    businessHours: "Monday - Friday: 9:00 AM - 6:00 PM GST",
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
