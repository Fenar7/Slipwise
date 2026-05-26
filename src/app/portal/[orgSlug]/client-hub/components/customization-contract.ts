import { z } from "zod";

export interface BrandingConfig {
  accentColor: string;
  logoUrl: string | null;
  removePoweredBy: boolean;
}

export interface HomeDashboardConfig {
  heroTitle: string;
  heroSubtitle: string;
  welcomeMessage: string;
  showOutstandingBalance: boolean;
  showPendingInvoices: boolean;
  showPendingQuotes: boolean;
  showQuickActions: boolean;
}

export interface InvoicesConfig {
  pageTitle: string;
  pageDescription: string;
  showDownloadAction: boolean;
  showPayAction: boolean;
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

export const BrandingConfigSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a valid hex color"),
  logoUrl: z.string().nullable(),
  removePoweredBy: z.boolean(),
});

export const HomeDashboardConfigSchema = z.object({
  heroTitle: z.string().min(1, "Hero title is required").max(100, "Hero title too long"),
  heroSubtitle: z.string().max(500, "Hero subtitle too long"),
  welcomeMessage: z.string().max(50, "Welcome message too long"),
  showOutstandingBalance: z.boolean(),
  showPendingInvoices: z.boolean(),
  showPendingQuotes: z.boolean(),
  showQuickActions: z.boolean(),
});

export const InvoicesConfigSchema = z.object({
  pageTitle: z.string().min(1, "Page title is required").max(50, "Page title too long"),
  pageDescription: z.string().max(300, "Page description too long"),
  showDownloadAction: z.boolean(),
  showPayAction: z.boolean(),
});

export const QuotesConfigSchema = z.object({
  pageTitle: z.string().min(1, "Page title is required").max(50, "Page title too long"),
  pageDescription: z.string().max(300, "Page description too long"),
  showAcceptReject: z.boolean(),
  showDownloadAction: z.boolean(),
});

export const PaymentsConfigSchema = z.object({
  pageTitle: z.string().min(1, "Page title is required").max(50, "Page title too long"),
  pageDescription: z.string().max(300, "Page description too long"),
  showPaymentMethods: z.boolean(),
  acceptedMethods: z.array(z.string()),
});

export const AboutConfigSchema = z.object({
  pageTitle: z.string().min(1, "Page title is required").max(50, "Page title too long"),
  heading: z.string().max(200, "Heading too long"),
  body: z.string().max(1000, "Body content too long"),
  showFoundedYear: z.boolean(),
  foundedYear: z.string().max(10, "Founded year too long"),
});

export const ContactConfigSchema = z.object({
  pageTitle: z.string().min(1, "Page title is required").max(50, "Page title too long"),
  heading: z.string().max(200, "Heading too long"),
  supportEmail: z.string().email("Invalid support email address").or(z.literal("")),
  supportPhone: z.string().max(30, "Support phone too long"),
  businessHours: z.string().max(100, "Business hours too long"),
  showMapPlaceholder: z.boolean(),
});

export const ProductsConfigSchema = z.object({
  pageTitle: z.string().min(1, "Page title is required").max(50, "Page title too long"),
  heading: z.string().max(200, "Heading too long"),
  description: z.string().max(300, "Description too long"),
  showPricing: z.boolean(),
  showUnit: z.boolean(),
});

export const NavigationConfigSchema = z.object({
  showDashboard: z.boolean(),
  showInvoices: z.boolean(),
  showQuotes: z.boolean(),
  showPayments: z.boolean(),
  showAbout: z.boolean(),
  showContact: z.boolean(),
  showProducts: z.boolean(),
  footerText: z.string().max(150, "Footer text too long"),
});

export const ClientHubConfigSchema = z.object({
  branding: BrandingConfigSchema,
  homeDashboard: HomeDashboardConfigSchema,
  invoices: InvoicesConfigSchema,
  quotes: QuotesConfigSchema,
  payments: PaymentsConfigSchema,
  about: AboutConfigSchema,
  contact: ContactConfigSchema,
  products: ProductsConfigSchema,
  navigation: NavigationConfigSchema,
});
