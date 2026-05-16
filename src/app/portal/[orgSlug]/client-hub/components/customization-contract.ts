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
