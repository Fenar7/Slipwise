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

export interface JobsConfig {
  pageTitle: string;
  heading: string;
  description: string;
  emptyMessage: string;
}

export interface NavigationConfig {
  showDashboard: boolean;
  showInvoices: boolean;
  showQuotes: boolean;
  showPayments: boolean;
  showAbout: boolean;
  showContact: boolean;
  showProducts: boolean;
  showJobs: boolean;
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
  jobs: JobsConfig;
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

export const JobsConfigSchema = z.object({
  pageTitle: z.string().min(1, "Page title is required").max(50, "Page title too long"),
  heading: z.string().max(200, "Heading too long"),
  description: z.string().max(300, "Description too long"),
  emptyMessage: z.string().max(300, "Empty message too long"),
});

export const NavigationConfigSchema = z.object({
  showDashboard: z.boolean(),
  showInvoices: z.boolean(),
  showQuotes: z.boolean(),
  showPayments: z.boolean(),
  showAbout: z.boolean(),
  showContact: z.boolean(),
  showProducts: z.boolean(),
  showJobs: z.boolean(),
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
  jobs: JobsConfigSchema,
  navigation: NavigationConfigSchema,
});

export const ClientHubOverrideSchema = z.object({
  branding: BrandingConfigSchema.partial().optional(),
  homeDashboard: HomeDashboardConfigSchema.partial().optional(),
  invoices: InvoicesConfigSchema.partial().optional(),
  quotes: QuotesConfigSchema.partial().optional(),
  payments: PaymentsConfigSchema.partial().optional(),
  about: AboutConfigSchema.partial().optional(),
  contact: ContactConfigSchema.partial().optional(),
  products: ProductsConfigSchema.partial().optional(),
  jobs: JobsConfigSchema.partial().optional(),
  navigation: NavigationConfigSchema.partial().optional(),
}).partial();

export type ClientHubOverride = z.infer<typeof ClientHubOverrideSchema>;

/**
 * Deterministically merges partial overrides into a target configuration.
 * Treated recursively, preserving nested structures. Arrays are replaced directly.
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: any): T {
  if (!source || typeof source !== "object") {
    return target;
  }
  const result = { ...target } as any;
  for (const key of Object.keys(target)) {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (sourceValue !== undefined) {
      if (
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue) &&
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }
  }
  return result;
}

/**
 * Computes a minimal sparse override diff representing values changed from org defaults.
 * Empty sections or identical properties are omitted.
 */
export function computeOverrideDiff(orgDefault: ClientHubConfig, edited: ClientHubConfig): ClientHubOverride {
  const diff: any = {};

  for (const sectionKey of Object.keys(orgDefault) as Array<keyof ClientHubConfig>) {
    const defaultSection = orgDefault[sectionKey];
    const editedSection = edited[sectionKey];

    if (typeof defaultSection === "object" && defaultSection !== null && !Array.isArray(defaultSection)) {
      const sectionDiff: any = {};
      let hasSectionDiff = false;

      for (const fieldKey of Object.keys(defaultSection)) {
        const defaultValue = (defaultSection as any)[fieldKey];
        const editedValue = (editedSection as any)[fieldKey];

        if (Array.isArray(defaultValue) && Array.isArray(editedValue)) {
          if (JSON.stringify(defaultValue) !== JSON.stringify(editedValue)) {
            sectionDiff[fieldKey] = editedValue;
            hasSectionDiff = true;
          }
        } else if (defaultValue !== editedValue) {
          sectionDiff[fieldKey] = editedValue;
          hasSectionDiff = true;
        }
      }

      if (hasSectionDiff) {
        diff[sectionKey] = sectionDiff;
      }
    }
  }

  return diff;
}

