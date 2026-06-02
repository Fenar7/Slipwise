/**
 * Phase 1 Sprint 1.4 — Client Hub Static Page Shell Render Tests
 *
 * Covers: dashboard, invoices, invoice detail, payment step, quotes, quote detail,
 * payments, about, contact, products, login, and verify pages render without error.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mockUseParams = vi.hoisted(() => vi.fn(() => ({ orgSlug: "acme" })));
const mockUseSearchParams = vi.hoisted(() => vi.fn(() => ({ get: () => "test@example.com" })));
const mockUseRouter = vi.hoisted(() => vi.fn(() => ({ push: vi.fn() })));

const mockConfig = vi.hoisted(() => {
  const defaultMockConfig = {
    branding: {
      accentColor: "#e8401e",
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
  return {
    value: JSON.parse(JSON.stringify(defaultMockConfig)),
    defaults: defaultMockConfig,
  };
});

const mockDashboardData = vi.hoisted(() => {
  const defaultMockDashboardData = {
    customer: { id: "cust_test_001", name: "Hadi Azeez", email: "hadi@example.com", phone: null },
    outstandingBalance: 3000,
    totalPaid: 5800,
    pendingInvoicesCount: 2,
    pendingQuotesCount: 1,
    pendingInvoices: [
      { id: "inv-001", invoiceNumber: "INV-000131", dueDate: "2025-10-24", remainingAmount: 1200, totalAmount: 1200, status: "UNPAID" },
      { id: "inv-003", invoiceNumber: "INV-000124", dueDate: "2025-10-20", remainingAmount: 1800, totalAmount: 4400, status: "PARTIALLY_PAID" }
    ],
    pendingQuotes: [
      { id: "qt-001", quoteNumber: "QT-000084", title: "Outbound lead generation package", validUntil: "2025-11-12", totalAmount: 2800, status: "SENT" }
    ],
  };
  return {
    value: JSON.parse(JSON.stringify(defaultMockDashboardData)),
    defaults: defaultMockDashboardData,
  };
});

vi.mock("next/navigation", () => ({
  useParams: mockUseParams,
  useSearchParams: mockUseSearchParams,
  useRouter: mockUseRouter,
  redirect: vi.fn(),
  notFound: () => {
    throw new Error("404");
  },
}));

vi.mock("@/lib/portal-auth", () => ({
  requirePortalSession: vi.fn().mockResolvedValue({ customerId: "cust_test_001", orgId: "org_001" }),
  getPortalSession: vi.fn().mockResolvedValue({ customerId: "cust_test_001", orgId: "org_001" }),
}));

vi.mock("../components/config-resolver", () => ({
  getEffectiveClientHubConfig: vi.fn().mockImplementation(() => Promise.resolve(mockConfig.value)),
  getPersistedHubConfig: vi.fn().mockImplementation(() => Promise.resolve(mockConfig.value)),
}));

vi.mock("../../actions", () => ({
  getPortalDashboardData: vi.fn().mockImplementation(() => Promise.resolve(mockDashboardData.value)),
}));

import DashboardPage from "../page";
import InvoicesPage from "../invoices/page";
import InvoiceDetailPage from "../invoices/[id]/page";
import InvoicePaymentPage from "../invoices/[id]/payment/page";
import QuotesPage from "../quotes/page";
import QuoteDetailPage from "../quotes/[id]/page";
import PaymentsPage from "../payments/page";
import AboutPage from "../about/page";
import ContactPage from "../contact/page";
import ProductsPage from "../products/page";
import LoginPage from "../login/page";
import VerifyPage from "../verify/page";

const ORG_SLUG = "acme";

beforeEach(() => {
  mockConfig.value = JSON.parse(JSON.stringify(mockConfig.defaults));
  mockDashboardData.value = JSON.parse(JSON.stringify(mockDashboardData.defaults));
});

async function renderAsyncPage(Page: (props: { params: Promise<{ orgSlug: string }> }) => Promise<React.ReactElement>) {
  const jsx = await Page({ params: Promise.resolve({ orgSlug: ORG_SLUG }) });
  return renderToStaticMarkup(jsx);
}

async function renderAsyncDetailPage(
  Page: (props: { params: Promise<{ orgSlug: string; id: string }> }) => Promise<React.ReactElement>,
  id: string
) {
  const jsx = await Page({ params: Promise.resolve({ orgSlug: ORG_SLUG, id }) });
  return renderToStaticMarkup(jsx);
}

describe("Client Hub Dashboard", () => {

  it("renders with summary cards and recent invoices", async () => {
    const html = await renderAsyncPage(DashboardPage);
    expect(html).toContain("Your Business Hub");
    expect(html).toContain("Client Portal");
    expect(html).toContain("Take Actions");
    expect(html).toContain("Pending Invoices");
    expect(html).toContain("Pending Quotes");
    expect(html).toContain("Browse Services");
  });

  it("hides quick actions completely when showQuickActions is false", async () => {
    mockConfig.value.homeDashboard.showQuickActions = false;
    const html = await renderAsyncPage(DashboardPage);
    expect(html).not.toContain("View Invoices");
    expect(html).not.toContain("Review Quotes");
    expect(html).not.toContain("Make a Payment");
    expect(html).not.toContain("Browse Services");
    expect(html).not.toContain("Contact Support");
  });

  it("only renders Make a Payment quick action when outstandingBalance > 0", async () => {
    // Case 1: outstandingBalance > 0
    mockConfig.value.homeDashboard.showQuickActions = true;
    mockDashboardData.value.outstandingBalance = 1500;
    let html = await renderAsyncPage(DashboardPage);
    expect(html).toContain("Make a Payment");

    // Case 2: outstandingBalance == 0
    mockDashboardData.value.outstandingBalance = 0;
    html = await renderAsyncPage(DashboardPage);
    expect(html).not.toContain("Make a Payment");
  });

  it("renders Contact Support quick action only when showContact navigation route is enabled and support details exist", async () => {
    mockConfig.value.homeDashboard.showQuickActions = true;

    // Case 1: Enabled and both support details exist
    mockConfig.value.navigation.showContact = true;
    mockConfig.value.contact.supportEmail = "support@company.com";
    mockConfig.value.contact.supportPhone = "+971 XX XXX XXXX";
    let html = await renderAsyncPage(DashboardPage);
    expect(html).toContain("Contact Support");

    // Case 2: Enabled but both support details are empty strings
    mockConfig.value.contact.supportEmail = "";
    mockConfig.value.contact.supportPhone = "";
    html = await renderAsyncPage(DashboardPage);
    expect(html).not.toContain("Contact Support");

    // Case 3: Only supportEmail exists
    mockConfig.value.contact.supportEmail = "support@company.com";
    html = await renderAsyncPage(DashboardPage);
    expect(html).toContain("Contact Support");

    // Case 4: Only supportPhone exists
    mockConfig.value.contact.supportEmail = "";
    mockConfig.value.contact.supportPhone = "+971 XX XXX XXXX";
    html = await renderAsyncPage(DashboardPage);
    expect(html).toContain("Contact Support");

    // Case 5: Support details exist, but navigation showContact is false
    mockConfig.value.navigation.showContact = false;
    mockConfig.value.contact.supportEmail = "support@company.com";
    html = await renderAsyncPage(DashboardPage);
    expect(html).not.toContain("Contact Support");
  });
});

describe("Client Hub Invoices", () => {
  it("renders invoice list with mock data", async () => {
    const html = await renderAsyncPage(InvoicesPage);
    expect(html).toContain("Invoices");
    expect(html).toContain("INV-000131");
    expect(html).toContain("UNPAID");
    expect(html).toContain("PAID");
  });

  it("renders invoice detail for known invoice", async () => {
    const html = await renderAsyncDetailPage(InvoiceDetailPage, "inv-001");
    expect(html).toContain("Invoice #INV-000131");
    expect(html).toContain("Hi Hadi Azeez");
    expect(html).toContain("LinkedIn inbox yearly");
  });

  it("renders paid notice for paid invoice", async () => {
    const html = await renderAsyncDetailPage(InvoiceDetailPage, "inv-002");
    expect(html).toContain("Invoice #INV-000128");
  });

  it("renders payment selection as a dedicated step", async () => {
    const jsx = await InvoicePaymentPage({ params: Promise.resolve({ orgSlug: ORG_SLUG, id: "inv-001" }) });
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("How would you like to pay?");
    expect(html).toContain("Payment Link");
    expect(html).toContain("Bank Transfer");
    expect(html).toContain("Amount Due");
  });

  it("payment page requires a valid portal session and redirects unauthenticated access", async () => {
    const { requirePortalSession } = await import("@/lib/portal-auth");
    vi.mocked(requirePortalSession).mockClear();

    await InvoicePaymentPage({ params: Promise.resolve({ orgSlug: ORG_SLUG, id: "inv-001" }) });

    expect(requirePortalSession).toHaveBeenCalledWith(
      ORG_SLUG,
      `/portal/${ORG_SLUG}/client-hub/login`
    );
  });
});

describe("Client Hub Quotes", () => {
  it("renders quote list with mock data", async () => {
    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Quotes");
    expect(html).toContain("Outbound lead generation package");
    expect(html).toContain("SENT");
    expect(html).toContain("ACCEPTED");
  });

  it("renders quote detail with response actions for sent quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-001");
    expect(html).toContain("Outbound lead generation package");
    expect(html).toContain("Your Response");
    expect(html).toContain("Accept Quote");
    expect(html).toContain("Decline");
  });

  it("renders accepted notice for accepted quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-002");
    expect(html).toContain("You accepted this quote");
  });
});

describe("Client Hub Payments", () => {
  it("renders payment history and outstanding summary", async () => {
    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("Payment Methods");
    expect(html).toContain("Total Paid");
    expect(html).toContain("Outstanding");
    expect(html).toContain("Payment History");
    expect(html).toContain("Bank Transfer");
  });
});

describe("Client Hub About", () => {
  it("renders company story and values", async () => {
    const html = await renderAsyncPage(AboutPage);
    expect(html).toContain("About");
    expect(html).toContain("We combine clear communication");
  });
});

describe("Client Hub Contact", () => {
  it("renders contact methods and support info", async () => {
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("Contact Us");
    expect(html).toContain("Email");
    expect(html).toContain("Phone");
    expect(html).toContain("Business Hours");
    expect(html).toContain("Emergency Support");
  });
});

describe("Client Hub Products", () => {
  it("renders product catalog with mock data", async () => {
    const html = await renderAsyncPage(ProductsPage);
    expect(html).toContain("LinkedIn Inbox Yearly");
    expect(html).toContain("Lead Generation Sprint");
    expect(html).toContain("Quarterly Advisory");
  });
});

describe("Client Hub Login", () => {
  it("renders the login shell with brand mark and email form", () => {
    const html = renderToStaticMarkup(<LoginPage />);
    expect(html).toContain("Passwordless sign in");
    expect(html).toContain("Sign in to your client hub");
    expect(html).toContain("Send verification code");
    expect(html).toContain("No password needed");
    expect(html).toContain("Code expires in 15 min");
    // Assert absence of static copy
    expect(html).not.toContain("Static Phase 1 shell");
    expect(html).not.toContain("simulates delivery only");
  });
});

describe("Client Hub Verify", () => {
  it("renders the verify shell with OTP input", () => {
    const html = renderToStaticMarkup(<VerifyPage />);
    expect(html).toContain("Step 2 of 2");
    expect(html).toContain("Enter your verification code");
    expect(html).toContain("Verify code");
    expect(html).toContain("Code expires in 15 minutes");
    expect(html).toContain("Resend code");
    // Assert presence of truthful copy and absence of static copy
    expect(html).toContain("access your client hub");
    expect(html).not.toContain("complete the static sign-in preview");
    expect(html).not.toContain("In the live product");
  });
});
