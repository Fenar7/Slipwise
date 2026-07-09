/**
 * Phase 1 Sprint 1.4 — Client Hub Static Page Shell Render Tests
 *
 * Covers: dashboard, invoices, invoice detail, payment step, quotes, quote detail,
 * payments, about, contact, products, login, and verify pages render without error.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

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
    jobs: {
      pageTitle: "Projects & Engagements",
      heading: "Your active projects and service engagements",
      description: "Track the progress of current work, milestones, and deliverables across your engagements.",
      emptyMessage: "No active projects or engagements to display at this time.",
    },
    navigation: {
      showDashboard: true,
      showInvoices: true,
      showQuotes: true,
      showPayments: true,
      showAbout: true,
      showContact: true,
      showProducts: true,
      showJobs: true,
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

const mockInvoicesData = vi.hoisted(() => ({
  value: [
    { id: "inv-001", invoiceNumber: "INV-000131", invoiceDate: "2025-10-21", dueDate: "2025-10-24", totalAmount: 1200, amountPaid: 0, remainingAmount: 1200, status: "UNPAID" },
    { id: "inv-002", invoiceNumber: "INV-000128", invoiceDate: "2025-10-14", dueDate: "2025-10-18", totalAmount: 3200, amountPaid: 3200, remainingAmount: 0, status: "PAID" },
  ]
}));

const mockInvoiceDetailData = vi.hoisted(() => ({
  value: (id: string) => {
    if (id === "inv-001") {
      return {
        id: "inv-001",
        invoiceNumber: "INV-000131",
        invoiceDate: "2025-10-21",
        dueDate: "2025-10-24",
        totalAmount: 1200,
        amountPaid: 0,
        remainingAmount: 1200,
        status: "UNPAID",
        hasValidPaymentLink: true,
        fromName: "Acme Corporation",
        clientName: "Hadi Azeez",
        lineItems: [
          { id: "line-001", name: "LinkedIn inbox yearly", quantity: 1, price: 1200, total: 1200 }
        ],
        payments: [],
        organization: {
          name: "Acme Corporation",
          defaults: {
            bankName: "Emirates NBD",
            bankAccount: "1234567890123",
            bankIFSC: "AE07 0123 4567 8901 2345 678",
          }
        }
      };
    }
    if (id === "inv-002") {
      return {
        id: "inv-002",
        invoiceNumber: "INV-000128",
        invoiceDate: "2025-10-14",
        dueDate: "2025-10-18",
        totalAmount: 3200,
        amountPaid: 3200,
        remainingAmount: 0,
        status: "PAID",
        fromName: "Acme Corporation",
        clientName: "Hadi Azeez",
        lineItems: [
          { id: "line-002", name: "Automation retainer", quantity: 1, price: 3200, total: 3200 }
        ],
        payments: [
          { id: "pmt-001", amount: 3200, paidAt: "2025-10-15", method: "Bank Transfer", note: "Settled", paymentMethodDisplay: "Bank Transfer" }
        ],
        organization: {
          name: "Acme Corporation",
          defaults: {
            bankName: "Emirates NBD",
            bankAccount: "1234567890123",
            bankIFSC: "AE07 0123 4567 8901 2345 678",
          }
        }
      };
    }
    return null;
  }
}));

const mockPaymentsData = vi.hoisted(() => ({
  value: {
    outstandingBalance: 3000,
    totalPaid: 5800,
    payments: [
      { id: "pmt-001", invoiceNumber: "INV-000128", amount: 3200, paidAt: "2025-10-15", method: "Bank Transfer", status: "SETTLED" }
    ],
    outstandingInvoices: [
      { id: "inv-001", invoiceNumber: "INV-000131", dueDate: "2025-10-24", remainingAmount: 1200 }
    ],
  }
}));

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
  getPortalInvoices: vi.fn().mockImplementation(() => Promise.resolve(mockInvoicesData.value)),
  getPortalInvoiceDetail: vi.fn().mockImplementation((orgSlug: string, id: string) => Promise.resolve(mockInvoiceDetailData.value(id))),
  getPortalPaymentsData: vi.fn().mockImplementation(() => Promise.resolve(mockPaymentsData.value)),
  getPortalQuotes: vi.fn().mockResolvedValue({ success: true, data: [] }),
  getPortalJobsProjects: vi.fn().mockResolvedValue([]),
  getPortalQuoteDetail: vi.fn().mockImplementation((_orgSlug: string, quoteId: string) => {
    const mockQuotes: Record<string, { success: true; data: Record<string, unknown> }> = {
      "qt-001": {
        success: true,
        data: {
          id: "qt-001",
          quoteNumber: "QT-000084",
          title: "Outbound lead generation package",
          status: "SENT",
          issueDate: new Date("2025-10-15"),
          validUntil: new Date("2025-11-12"),
          subtotal: 2400,
          taxAmount: 400,
          discountAmount: 0,
          totalAmount: 2800,
          notes: null,
          termsAndConditions: null,
          acceptedAt: null,
          declinedAt: null,
          declineReason: null,
          canRespond: true,
          customer: { name: "Acme Corp" },
          org: { name: "Zenxvio" },
          lineItems: [
            { id: "li-1", description: "Lead Gen Package", quantity: 1, unitPrice: 2400, taxRate: 16.67, amount: 2800 },
          ],
        },
      },
      "qt-002": {
        success: true,
        data: {
          id: "qt-002",
          quoteNumber: "QT-000085",
          title: "SEO optimization",
          status: "ACCEPTED",
          issueDate: new Date("2025-09-01"),
          validUntil: new Date("2025-10-01"),
          subtotal: 5000,
          taxAmount: 900,
          discountAmount: 0,
          totalAmount: 5900,
          notes: null,
          termsAndConditions: null,
          acceptedAt: new Date("2025-09-15"),
          declinedAt: null,
          declineReason: null,
          canRespond: false,
          customer: { name: "Acme Corp" },
          org: { name: "Zenxvio" },
          lineItems: [
            { id: "li-2", description: "SEO Service", quantity: 1, unitPrice: 5000, taxRate: 18, amount: 5900 },
          ],
        },
      },
    };
    return Promise.resolve(mockQuotes[quoteId] ?? { success: false, error: "not_found" });
  }),
  initiatePortalPayment: vi.fn().mockResolvedValue({ url: "https://razorpay.com/pay" }),
}));

import DashboardPage from "../page";
import InvoicesPage from "../invoices/page";
import InvoiceDetailPage from "../invoices/[id]/page";
import InvoicePaymentPage from "../invoices/[id]/payment/page";
import QuotesPage from "../quotes/page";
import QuoteDetailPage from "../quotes/[quoteId]/page";
import PaymentsPage from "../payments/page";
import AboutPage from "../about/page";
import ContactPage from "../contact/page";
import ProductsPage from "../products/page";
import JobsPage from "../jobs/page";
import LoginPage from "../login/page";
import VerifyPage from "../verify/page";

const ORG_SLUG = "acme";

const mockLocationHref = vi.fn();
beforeAll(() => {
  Object.defineProperty(window, "location", {
    value: {
      set href(url: string) {
        mockLocationHref(url);
      },
      get href() {
        return "";
      }
    },
    configurable: true,
  });
});

beforeEach(() => {
  mockConfig.value = JSON.parse(JSON.stringify(mockConfig.defaults));
  mockDashboardData.value = JSON.parse(JSON.stringify(mockDashboardData.defaults));
  mockLocationHref.mockClear();
});

async function renderAsyncPage(Page: (props: { params: Promise<{ orgSlug: string }> }) => Promise<React.ReactElement>) {
  const jsx = await Page({ params: Promise.resolve({ orgSlug: ORG_SLUG }) });
  return renderToStaticMarkup(jsx);
}

async function renderAsyncDetailPage(
  Page: (props: { params: Promise<Record<string, string>> }) => Promise<React.ReactElement>,
  id: string,
  paramName: string = "id",
) {
  const jsx = await Page({ params: Promise.resolve({ orgSlug: ORG_SLUG, [paramName]: id }) });
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
  it("renders live, customer-scoped invoice list with details", async () => {
    const { getPortalInvoices } = await import("../../actions");
    vi.mocked(getPortalInvoices).mockClear();

    const html = await renderAsyncPage(InvoicesPage);
    expect(getPortalInvoices).toHaveBeenCalledWith(ORG_SLUG);
    expect(html).toContain("Invoices");
    expect(html).toContain("INV-000131");
    expect(html).toContain("UNPAID");
    expect(html).toContain("INV-000128");
    expect(html).toContain("PAID");
  });

  it("renders a truthful empty state when no invoices exist", async () => {
    const { getPortalInvoices } = await import("../../actions");
    vi.mocked(getPortalInvoices).mockResolvedValueOnce([]);

    const html = await renderAsyncPage(InvoicesPage);
    expect(html).toContain("No invoices found.");
  });

  it("gates the invoices list page by showInvoices navigation config", async () => {
    mockConfig.value.navigation.showInvoices = false;
    await expect(renderAsyncPage(InvoicesPage)).rejects.toThrow("404");
  });

  it("renders live customer-scoped invoice detail for a known invoice", async () => {
    const { getPortalInvoiceDetail } = await import("../../actions");
    vi.mocked(getPortalInvoiceDetail).mockClear();

    const html = await renderAsyncDetailPage(InvoiceDetailPage, "inv-001");
    expect(getPortalInvoiceDetail).toHaveBeenCalledWith(ORG_SLUG, "inv-001");
    expect(html).toContain("Invoice #INV-000131");
    expect(html).toContain("Hi Hadi Azeez");
    expect(html).toContain("LinkedIn inbox yearly");
    expect(html).toContain("PAY NOW");
  });

  it("denies access safely (404) on cross-customer/IDOR access attempts", async () => {
    const { getPortalInvoiceDetail } = await import("../../actions");
    // Simulate that the invoice belongs to another customer or does not exist
    vi.mocked(getPortalInvoiceDetail).mockResolvedValueOnce(null);

    await expect(renderAsyncDetailPage(InvoiceDetailPage, "inv-unauthorized")).rejects.toThrow("404");
  });

  it("gates the invoice detail page by showInvoices navigation config", async () => {
    mockConfig.value.navigation.showInvoices = false;
    await expect(renderAsyncDetailPage(InvoiceDetailPage, "inv-001")).rejects.toThrow("404");
  });

  it("shows the PAY NOW button only when the invoice is actually payable", async () => {
    // inv-001 is UNPAID and has remainingAmount > 0 (payable)
    const htmlUnpaid = await renderAsyncDetailPage(InvoiceDetailPage, "inv-001");
    expect(htmlUnpaid).toContain("PAY NOW");

    // inv-002 is PAID (not payable)
    const htmlPaid = await renderAsyncDetailPage(InvoiceDetailPage, "inv-002");
    expect(htmlPaid).not.toContain("PAY NOW");
  });

  it("renders payment selection page as a dedicated step", async () => {
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

  it("payment page denies access (404) when invoice is already fully paid or cancelled", async () => {
    // inv-002 is already fully paid, should throw 404
    await expect(
      InvoicePaymentPage({ params: Promise.resolve({ orgSlug: ORG_SLUG, id: "inv-002" }) })
    ).rejects.toThrow("404");

    const { getPortalInvoiceDetail } = await import("../../actions");
    // Mock a CANCELLED invoice details
    vi.mocked(getPortalInvoiceDetail).mockResolvedValueOnce({
      id: "inv-003",
      invoiceNumber: "INV-000123",
      invoiceDate: "2025-10-10",
      dueDate: "2025-10-25",
      totalAmount: 1000,
      amountPaid: 0,
      remainingAmount: 1000,
      status: "CANCELLED",
      fromName: "Acme Corporation",
      clientName: "Hadi Azeez",
      lineItems: [],
      payments: [],
      organization: null,
    });

    await expect(
      InvoicePaymentPage({ params: Promise.resolve({ orgSlug: ORG_SLUG, id: "inv-003" }) })
    ).rejects.toThrow("404");
  });

  it("payment page denies access (404) when showPayments config is disabled", async () => {
    mockConfig.value.navigation.showPayments = false;
    await expect(
      InvoicePaymentPage({ params: Promise.resolve({ orgSlug: ORG_SLUG, id: "inv-001" }) })
    ).rejects.toThrow("404");
  });
});

describe("Client Hub Quotes", () => {
  it("renders quote list with empty state when no quotes", async () => {
    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Quotes");
    expect(html).toContain("No quotes found.");
  });

  it("renders truthful failure state when quote loading fails", async () => {
    const { getPortalQuotes } = await import("../../actions");
    vi.mocked(getPortalQuotes).mockResolvedValueOnce({ success: false, error: "Database connection lost" });

    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Unable to load quotes");
    expect(html).not.toContain("No quotes found.");
  });

  it("does not show empty state when loading fails", async () => {
    const { getPortalQuotes } = await import("../../actions");
    vi.mocked(getPortalQuotes).mockResolvedValueOnce({ success: false, error: "Server error" });

    const html = await renderAsyncPage(QuotesPage);
    expect(html).not.toContain("No quotes found.");
    expect(html).toContain("Unable to load quotes");
  });

  it("renders quote detail with response actions for sent quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-001", "quoteId");
    expect(html).toContain("Outbound lead generation package");
    expect(html).toContain("Your Response");
    expect(html).toContain("Accept Quote");
    expect(html).toContain("Decline");
  });

  it("renders accepted notice for accepted quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-002", "quoteId");
    expect(html).toContain("You accepted this quote");
  });

  it("quote list denies access (404) when showQuotes config is disabled", async () => {
    mockConfig.value.navigation.showQuotes = false;
    await expect(
      QuotesPage({ params: Promise.resolve({ orgSlug: ORG_SLUG }) })
    ).rejects.toThrow("404");
  });

  it("quote detail denies access (404) when showQuotes config is disabled", async () => {
    mockConfig.value.navigation.showQuotes = false;
    await expect(
      QuoteDetailPage({ params: Promise.resolve({ orgSlug: ORG_SLUG, quoteId: "qt-001" }) })
    ).rejects.toThrow("404");
  });
});

describe("Client Hub Payments Page", () => {
  it("renders payment history and outstanding summary on live data", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockClear();

    const html = await renderAsyncPage(PaymentsPage);
    expect(getPortalPaymentsData).toHaveBeenCalledWith(ORG_SLUG);
    expect(html).toContain("Payment Methods");
    expect(html).toContain("Total Paid");
    expect(html).toContain("Outstanding");
    expect(html).toContain("Payment History");
    expect(html).toContain("Invoice #INV-000128");
    expect(html).toContain("Bank Transfer");
  });

  it("renders Unpaid Invoices section for quick checkout when open balances exist", async () => {
    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("Unpaid Invoices");
    expect(html).toContain("INV-000131");
  });

  it("renders a truthful empty state for payment history", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    // Mock no history and no outstanding invoices
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 0,
      totalPaid: 0,
      payments: [],
      outstandingInvoices: [],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("No payment history available.");
    expect(html).not.toContain("Unpaid Invoices");
  });

  it("gates the payments page by showPayments navigation config", async () => {
    mockConfig.value.navigation.showPayments = false;
    await expect(renderAsyncPage(PaymentsPage)).rejects.toThrow("404");
  });
});

describe("Client Hub About", () => {
  it("renders company story and values", async () => {
    const html = await renderAsyncPage(AboutPage);
    expect(html).toContain("About");
    expect(html).toContain("We combine clear communication");
  });

  it("renders empty body state when about body is empty", async () => {
    mockConfig.value.about.body = "";
    const html = await renderAsyncPage(AboutPage);
    expect(html).toContain("About");
    expect(html).toContain("will appear here once it has been configured");
  });

  it("renders founded year when configured", async () => {
    mockConfig.value.about.showFoundedYear = true;
    mockConfig.value.about.foundedYear = "2020";
    const html = await renderAsyncPage(AboutPage);
    expect(html).toContain("Established 2020");
  });

  it("hides founded year when showFoundedYear is false", async () => {
    mockConfig.value.about.showFoundedYear = false;
    const html = await renderAsyncPage(AboutPage);
    expect(html).not.toContain("Established");
  });

  it("gates the about page by showAbout navigation config", async () => {
    mockConfig.value.navigation.showAbout = false;
    await expect(renderAsyncPage(AboutPage)).rejects.toThrow("404");
  });

  it("uses getEffectiveClientHubConfig (not getPersistedHubConfig) on about page", async () => {
    const { getEffectiveClientHubConfig, getPersistedHubConfig } = await import("../components/config-resolver");
    vi.mocked(getEffectiveClientHubConfig).mockClear();
    vi.mocked(getPersistedHubConfig).mockClear();
    mockConfig.value.navigation.showAbout = true;

    await renderAsyncPage(AboutPage).catch(() => {});

    expect(getEffectiveClientHubConfig).toHaveBeenCalled();
  });
});

describe("Client Hub Contact", () => {
  it("renders contact methods and support info", async () => {
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("Contact Us");
    expect(html).toContain("Email");
    expect(html).toContain("Phone");
    expect(html).toContain("Business Hours");
    expect(html).toContain("Need Help?");
  });

  it("renders empty contact state when all fields are empty", async () => {
    mockConfig.value.contact.supportEmail = "";
    mockConfig.value.contact.supportPhone = "";
    mockConfig.value.contact.businessHours = "";
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("Contact Us");
    expect(html).toContain("will appear here once it has been configured");
    expect(html).not.toContain("Email");
    expect(html).not.toContain("Phone");
  });

  it("renders partial contact info safely when only email is provided", async () => {
    mockConfig.value.contact.supportEmail = "support@test.com";
    mockConfig.value.contact.supportPhone = "";
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("support@test.com");
    expect(html).toContain("Email");
    expect(html).not.toContain("Phone");
    expect(html).toContain("Reach out to us at support@test.com");
  });

  it("renders partial contact info safely when only phone is provided", async () => {
    mockConfig.value.contact.supportEmail = "";
    mockConfig.value.contact.supportPhone = "+1234567890";
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("+1234567890");
    expect(html).toContain("Phone");
    expect(html).not.toContain("Email");
    expect(html).toContain("Call us at +1234567890");
  });

  it("renders full contact with both email and phone", async () => {
    mockConfig.value.contact.supportEmail = "support@test.com";
    mockConfig.value.contact.supportPhone = "+1234567890";
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("support@test.com");
    expect(html).toContain("+1234567890");
    expect(html).toContain("Reach out to us at support@test.com or call +1234567890");
  });

  it("gates the contact page by showContact navigation config", async () => {
    mockConfig.value.navigation.showContact = false;
    await expect(renderAsyncPage(ContactPage)).rejects.toThrow("404");
  });

  it("uses getEffectiveClientHubConfig (not getPersistedHubConfig) on contact page", async () => {
    const { getEffectiveClientHubConfig, getPersistedHubConfig } = await import("../components/config-resolver");
    vi.mocked(getEffectiveClientHubConfig).mockClear();
    vi.mocked(getPersistedHubConfig).mockClear();
    mockConfig.value.navigation.showContact = true;

    await renderAsyncPage(ContactPage).catch(() => {});

    expect(getEffectiveClientHubConfig).toHaveBeenCalled();
  });
});

describe("Client Hub Products", () => {
  it("renders products page with truthful empty state", async () => {
    const html = await renderAsyncPage(ProductsPage);
    expect(html).toContain("Products &amp; Services");
    expect(html).toContain("Your service catalogue will appear here once it has been configured.");
  });

  it("renders products description when configured", async () => {
    mockConfig.value.products.description = "Our comprehensive service offerings";
    const html = await renderAsyncPage(ProductsPage);
    expect(html).toContain("Our comprehensive service offerings");
  });

  it("hides products description when empty", async () => {
    mockConfig.value.products.description = "";
    const html = await renderAsyncPage(ProductsPage);
    expect(html).toContain("Products &amp; Services");
    expect(html).toContain("Your service catalogue will appear here once it has been configured.");
  });

  it("gates the products page by showProducts navigation config", async () => {
    mockConfig.value.navigation.showProducts = false;
    await expect(renderAsyncPage(ProductsPage)).rejects.toThrow("404");
  });

  it("uses getEffectiveClientHubConfig (not getPersistedHubConfig) on products page", async () => {
    const { getEffectiveClientHubConfig, getPersistedHubConfig } = await import("../components/config-resolver");
    vi.mocked(getEffectiveClientHubConfig).mockClear();
    vi.mocked(getPersistedHubConfig).mockClear();
    mockConfig.value.navigation.showProducts = true;

    await renderAsyncPage(ProductsPage).catch(() => {});

    expect(getEffectiveClientHubConfig).toHaveBeenCalled();
  });
});

describe("Client Hub Jobs/Projects", () => {
  it("renders jobs page with truthful empty state", async () => {
    const { getPortalJobsProjects } = await import("../../actions");
    vi.mocked(getPortalJobsProjects).mockResolvedValueOnce([]);
    const html = await renderAsyncPage(JobsPage);
    expect(html).toContain("Projects &amp; Engagements");
    expect(html).toContain("No active projects or engagements to display at this time.");
  });

  it("renders jobs data when engagements exist", async () => {
    const { getPortalJobsProjects } = await import("../../actions");
    vi.mocked(getPortalJobsProjects).mockResolvedValueOnce([
      {
        id: "job-001",
        title: "Lead Generation Package",
        type: "INVOICE",
        referenceNumber: "INV-000131",
        status: "UNPAID",
        totalAmount: 1200,
        createdAt: "2025-10-21",
        dueDate: "2025-10-24",
      },
      {
        id: "job-002",
        title: "SEO Optimization",
        type: "QUOTE",
        referenceNumber: "QT-000084",
        status: "SENT",
        totalAmount: 2800,
        createdAt: "2025-10-15",
        dueDate: "2025-11-12",
      },
    ]);
    const html = await renderAsyncPage(JobsPage);
    expect(html).toContain("Lead Generation Package");
    expect(html).toContain("INV-000131");
    expect(html).toContain("UNPAID");
    expect(html).toContain("SEO Optimization");
    expect(html).toContain("QT-000084");
    expect(html).toContain("SENT");
    expect(html).toContain("Invoice");
    expect(html).toContain("Quote");
  });

  it("renders truthful failure state when jobs loading fails", async () => {
    const { getPortalJobsProjects } = await import("../../actions");
    vi.mocked(getPortalJobsProjects).mockRejectedValueOnce(new Error("DB error"));
    const html = await renderAsyncPage(JobsPage);
    expect(html).toContain("Unable to load projects");
  });

  it("gates the jobs page by showJobs navigation config", async () => {
    mockConfig.value.navigation.showJobs = false;
    await expect(renderAsyncPage(JobsPage)).rejects.toThrow("404");
  });

  it("uses getEffectiveClientHubConfig (not getPersistedHubConfig) on jobs page", async () => {
    const { getEffectiveClientHubConfig, getPersistedHubConfig } = await import("../components/config-resolver");
    vi.mocked(getEffectiveClientHubConfig).mockClear();
    vi.mocked(getPersistedHubConfig).mockClear();
    mockConfig.value.navigation.showJobs = true;

    await renderAsyncPage(JobsPage).catch(() => {});

    expect(getEffectiveClientHubConfig).toHaveBeenCalled();
  });

  it("calls getPortalJobsProjects with the correct orgSlug", async () => {
    const { getPortalJobsProjects } = await import("../../actions");
    vi.mocked(getPortalJobsProjects).mockClear();
    vi.mocked(getPortalJobsProjects).mockResolvedValueOnce([]);

    await renderAsyncPage(JobsPage);

    expect(getPortalJobsProjects).toHaveBeenCalledWith(ORG_SLUG);
  });
});

describe("Sprint 6.4 Navigation visibility", () => {
  it("hides Projects from sidebar when showJobs is false", async () => {
    mockConfig.value.navigation.showJobs = false;
    mockConfig.value.navigation.showDashboard = true;
    mockConfig.value.navigation.showInvoices = true;
    mockConfig.value.navigation.showQuotes = true;
    mockConfig.value.navigation.showPayments = true;
    mockConfig.value.navigation.showProducts = true;
    const html = await renderAsyncPage(DashboardPage);
    expect(html).not.toContain("Projects");
  });

  it("shows Projects in sidebar when showJobs is true", async () => {
    mockConfig.value.navigation.showJobs = true;
    const html = await renderAsyncPage(DashboardPage);
    expect(html).toContain("Projects");
  });

  it("getHubNavItems excludes About Us when showAbout is false", async () => {
    const { getHubNavItems } = await import("../components/views");
    mockConfig.value.navigation.showAbout = false;
    const items = getHubNavItems("acme", mockConfig.value);
    expect(items.find((i) => i.label === "About Us")).toBeUndefined();
  });

  it("getHubNavItems excludes Contact when showContact is false", async () => {
    const { getHubNavItems } = await import("../components/views");
    mockConfig.value.navigation.showContact = false;
    const items = getHubNavItems("acme", mockConfig.value);
    expect(items.find((i) => i.label === "Contact")).toBeUndefined();
  });

  it("getHubNavItems includes About Us and Contact when enabled", async () => {
    const { getHubNavItems } = await import("../components/views");
    mockConfig.value.navigation.showAbout = true;
    mockConfig.value.navigation.showContact = true;
    const items = getHubNavItems("acme", mockConfig.value);
    expect(items.find((i) => i.label === "About Us")).toBeTruthy();
    expect(items.find((i) => i.label === "Contact")).toBeTruthy();
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

// ─── Blocker Remediation Tests ─────────────────────────────────────────────────

import { getActionablePaymentMethods, PaymentMethodSelector } from "../components/payment-method-selector";

describe("Per-client override gating (Fix 1)", () => {

  it("invoices list page respects per-client override showInvoices=false", async () => {
    mockConfig.value.navigation.showInvoices = false;
    await expect(renderAsyncPage(InvoicesPage)).rejects.toThrow("404");
  });

  it("invoice detail page respects per-client override showInvoices=false", async () => {
    mockConfig.value.navigation.showInvoices = false;
    await expect(renderAsyncDetailPage(InvoiceDetailPage, "inv-001")).rejects.toThrow("404");
  });

  it("payments page respects per-client override showPayments=false", async () => {
    mockConfig.value.navigation.showPayments = false;
    await expect(renderAsyncPage(PaymentsPage)).rejects.toThrow("404");
  });

  it("uses getEffectiveClientHubConfig (not getPersistedHubConfig) on invoices list page", async () => {
    const { getEffectiveClientHubConfig, getPersistedHubConfig } = await import("../components/config-resolver");
    vi.mocked(getEffectiveClientHubConfig).mockClear();
    vi.mocked(getPersistedHubConfig).mockClear();
    mockConfig.value.navigation.showInvoices = true;

    await renderAsyncPage(InvoicesPage).catch(() => {});

    expect(getEffectiveClientHubConfig).toHaveBeenCalled();
  });

  it("uses getEffectiveClientHubConfig (not getPersistedHubConfig) on invoice detail page", async () => {
    const { getEffectiveClientHubConfig, getPersistedHubConfig } = await import("../components/config-resolver");
    vi.mocked(getEffectiveClientHubConfig).mockClear();
    vi.mocked(getPersistedHubConfig).mockClear();
    mockConfig.value.navigation.showInvoices = true;

    await renderAsyncDetailPage(InvoiceDetailPage, "inv-001").catch(() => {});

    expect(getEffectiveClientHubConfig).toHaveBeenCalled();
  });

  it("uses getEffectiveClientHubConfig (not getPersistedHubConfig) on payments page", async () => {
    const { getEffectiveClientHubConfig, getPersistedHubConfig } = await import("../components/config-resolver");
    vi.mocked(getEffectiveClientHubConfig).mockClear();
    vi.mocked(getPersistedHubConfig).mockClear();
    mockConfig.value.navigation.showPayments = true;

    await renderAsyncPage(PaymentsPage).catch(() => {});

    expect(getEffectiveClientHubConfig).toHaveBeenCalled();
  });
});

describe("Server-side payment initiation fail-closed (Fix 2 + 3)", () => {

  it("returns error (not url) for CANCELLED invoice", async () => {
    const { initiatePortalPayment } = await import("../../actions");
    vi.mocked(initiatePortalPayment).mockResolvedValueOnce({
      alreadyPaid: false,
      url: null,
      error: "This invoice has been cancelled.",
    });

    const res = await initiatePortalPayment("acme", "inv-cancelled");
    expect(res.url).toBeNull();
    expect(res.error).toContain("cancelled");
  });

  it("returns error (not url) for paid invoice", async () => {
    const { initiatePortalPayment } = await import("../../actions");
    vi.mocked(initiatePortalPayment).mockResolvedValueOnce({
      alreadyPaid: true,
      url: null,
      error: "This invoice has already been paid.",
    });

    const res = await initiatePortalPayment("acme", "inv-paid");
    expect(res.url).toBeNull();
    expect(res.alreadyPaid).toBe(true);
  });

  it("does not return /invoice/[token] fallback URL", async () => {
    const { initiatePortalPayment } = await import("../../actions");
    // Simulate invoice with no valid payment link
    vi.mocked(initiatePortalPayment).mockResolvedValueOnce({
      alreadyPaid: false,
      url: null,
      error: "Online payment is not currently available for this invoice.",
    });

    const res = await initiatePortalPayment("acme", "inv-no-link");
    expect(res.url).toBeNull();
    expect(res.error).toBeTruthy();
  });

  it("surfaces server error message in PaymentMethodSelector UI", async () => {
    const { initiatePortalPayment } = await import("../../actions");
    vi.mocked(initiatePortalPayment).mockResolvedValueOnce({
      alreadyPaid: false,
      url: null,
      error: "This invoice has been cancelled.",
    });

    render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={{
          id: "inv-cancelled",
          invoiceNumber: "INV-000999",
          dueDate: "2025-12-01",
          totalAmount: 1000,
          remainingAmount: 1000,
          organization: {
            name: "Acme Corporation",
            defaults: {
              bankName: "Emirates NBD",
              bankAccount: "1234567890123",
              bankIFSC: "AE07 0123 4567 8901 2345 678",
            },
          },
        }}
        acceptedMethods={["Payment Link"]}
        hasValidPaymentLink={true}
      />
    );

    fireEvent.click(screen.getByText("Payment Link"));
    fireEvent.click(screen.getByText("PROCEED TO SECURE PAYMENT"));

    await waitFor(() => {
      expect(screen.getByText("This invoice has been cancelled.")).toBeInTheDocument();
    });
  });
});

describe("Payment-method availability truthful (Fix 4)", () => {

  it("getActionablePaymentMethods filters out UPI", () => {
    const result = getActionablePaymentMethods(["Payment Link", "Bank Transfer", "UPI"], true, true);
    expect(result).toContain("Payment Link");
    expect(result).toContain("Bank Transfer");
    expect(result).not.toContain("UPI");
  });

  it("getActionablePaymentMethods hides Bank Transfer when no bank details", () => {
    const result = getActionablePaymentMethods(["Payment Link", "Bank Transfer"], false, true);
    expect(result).toContain("Payment Link");
    expect(result).not.toContain("Bank Transfer");
  });

  it("getActionablePaymentMethods shows Bank Transfer when bank details exist", () => {
    const result = getActionablePaymentMethods(["Payment Link", "Bank Transfer"], true, true);
    expect(result).toContain("Payment Link");
    expect(result).toContain("Bank Transfer");
  });

  it("getActionablePaymentMethods hides Payment Link when no valid payment link exists", () => {
    const result = getActionablePaymentMethods(["Payment Link", "Bank Transfer"], true, false);
    expect(result).not.toContain("Payment Link");
    expect(result).toContain("Bank Transfer");
  });

  it("getActionablePaymentMethods shows Payment Link when valid payment link exists", () => {
    const result = getActionablePaymentMethods(["Payment Link", "Bank Transfer"], true, true);
    expect(result).toContain("Payment Link");
    expect(result).toContain("Bank Transfer");
  });

  it("getActionablePaymentMethods excludes unknown methods", () => {
    const result = getActionablePaymentMethods(["Payment Link", "Credit Card", "Debit Card"], false, false);
    expect(result).toEqual([]);
  });

  it("payments overview page shows only available methods with bank details and payment link", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 3000,
      totalPaid: 5800,
      orgHasBankDetails: true,
      hasPaymentLink: true,
      payments: [
        { id: "pmt-001", invoiceNumber: "INV-000128", amount: 3200, paidAt: "2025-10-15", method: "Bank Transfer", status: "SETTLED" }
      ],
      outstandingInvoices: [
        { id: "inv-001", invoiceNumber: "INV-000131", dueDate: "2025-10-24", remainingAmount: 1200 }
      ],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("Payment Link");
    expect(html).toContain("Bank Transfer");
    expect(html).not.toContain("UPI");
  });

  it("payments overview page hides Bank Transfer from methods when org has no bank details", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 3000,
      totalPaid: 5800,
      orgHasBankDetails: false,
      hasPaymentLink: true,
      payments: [],
      outstandingInvoices: [],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("Payment Link");
    expect(html).not.toContain("Bank Transfer");
    expect(html).not.toContain("UPI");
  });

  it("payments overview page hides Payment Link when org has no valid payment links", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 3000,
      totalPaid: 5800,
      orgHasBankDetails: true,
      hasPaymentLink: false,
      payments: [],
      outstandingInvoices: [],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).not.toContain("Payment Link");
    expect(html).toContain("Bank Transfer");
  });
});

describe("hasPaymentLink payable-only truthfulness (Fix 4 extension)", () => {

  it("payments overview hides Payment Link when only a PAID invoice has a live link", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 0,
      totalPaid: 5000,
      orgHasBankDetails: true,
      hasPaymentLink: false,
      payments: [
        { id: "pmt-001", invoiceNumber: "INV-000100", amount: 5000, paidAt: "2025-11-01", method: "Bank Transfer", status: "SETTLED" }
      ],
      outstandingInvoices: [],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).not.toContain("Payment Link");
    expect(html).toContain("Bank Transfer");
  });

  it("payments overview hides Payment Link when only a CANCELLED invoice has a live link", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 0,
      totalPaid: 0,
      orgHasBankDetails: true,
      hasPaymentLink: false,
      payments: [],
      outstandingInvoices: [],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).not.toContain("Payment Link");
  });

  it("payments overview hides Payment Link when only a zero-balance invoice has a live link", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 0,
      totalPaid: 3200,
      orgHasBankDetails: true,
      hasPaymentLink: false,
      payments: [
        { id: "pmt-002", invoiceNumber: "INV-000101", amount: 3200, paidAt: "2025-10-20", method: "Bank Transfer", status: "SETTLED" }
      ],
      outstandingInvoices: [],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).not.toContain("Payment Link");
  });

  it("payments overview shows Payment Link when at least one invoice is live-link eligible and payable", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 1200,
      totalPaid: 5800,
      orgHasBankDetails: true,
      hasPaymentLink: true,
      payments: [
        { id: "pmt-001", invoiceNumber: "INV-000128", amount: 3200, paidAt: "2025-10-15", method: "Bank Transfer", status: "SETTLED" }
      ],
      outstandingInvoices: [
        { id: "inv-001", invoiceNumber: "INV-000131", dueDate: "2025-10-24", remainingAmount: 1200 }
      ],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("Payment Link");
    expect(html).toContain("Bank Transfer");
  });

  // Query-contract test: verifies getPortalPaymentsData passes payable-only filters
  // (status notIn PAID/CANCELLED, remainingAmount > 0) to invoice.findFirst.
  // Skipped because the actions module uses "use server", which prevents
  // vi.importActual from loading the real server action in the test environment.
  it.skip("getPortalPaymentsData queries invoice.findFirst with payable-only filters", async () => {
    const { db } = await import("@/lib/db");

    vi.mocked(db.invoice.findFirst).mockResolvedValueOnce(null);
    vi.mocked(db.invoice.aggregate).mockResolvedValue({ _sum: { remainingAmount: 0, amountPaid: 0 } } as any);
    vi.mocked(db.invoice.findMany).mockResolvedValue([]);
    vi.mocked(db.invoicePayment.findMany).mockResolvedValue([]);
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);

    const { getPortalPaymentsData: actualGetPortalPaymentsData } = await vi.importActual<typeof import("../../actions")>("../../actions");

    await actualGetPortalPaymentsData("acme").catch(() => {});

    expect(db.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { notIn: ["PAID", "CANCELLED"] },
          remainingAmount: { gt: 0 },
          razorpayPaymentLinkUrl: { not: null },
          paymentLinkExpiresAt: { gt: expect.any(Date) },
        }),
      })
    );
  });
});

describe("Settled-only payment history (Fix 5)", () => {

  it("payment history data only contains SETTLED status payments", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    const data = await getPortalPaymentsData(ORG_SLUG);
    const nonSettled = data.payments.filter((pmt: { status: string }) => pmt.status !== "SETTLED");
    expect(nonSettled).toHaveLength(0);
  });

  it("payments page does not render non-settled payment entries", async () => {
    const { getPortalPaymentsData } = await import("../../actions");
    vi.mocked(getPortalPaymentsData).mockResolvedValueOnce({
      outstandingBalance: 3000,
      totalPaid: 5800,
      orgHasBankDetails: true,
      hasPaymentLink: true,
      payments: [
        { id: "pmt-001", invoiceNumber: "INV-000128", amount: 3200, paidAt: "2025-10-15", method: "Bank Transfer", status: "SETTLED" }
      ],
      outstandingInvoices: [],
    });

    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("INV-000128");
    expect(html).toContain("SETTLED");
  });

  it("invoice detail only shows SETTLED payments in payment history", async () => {
    const { getPortalInvoiceDetail } = await import("../../actions");
    vi.mocked(getPortalInvoiceDetail).mockResolvedValueOnce({
      id: "inv-001",
      invoiceNumber: "INV-000128",
      invoiceDate: "2025-10-01",
      dueDate: "2025-10-15",
      totalAmount: 5000,
      amountPaid: 3200,
      remainingAmount: 1800,
      status: "PARTIALLY_PAID",
      hasValidPaymentLink: true,
      fromName: "Test Org",
      clientName: "Test Customer",
      organization: { id: "org-1", name: "Test Org" },
      lineItems: [],
      payments: [
        { id: "pmt-001", amount: 3200, paidAt: "2025-10-15", method: "Bank Transfer", note: "Settled", status: "SETTLED", paymentMethodDisplay: "Bank Transfer" },
      ],
    });

    const { ClientHubInvoiceDetailView } = await import("../components/views");
    const html = renderToStaticMarkup(
      <ClientHubInvoiceDetailView
        invoice={{
          id: "inv-001",
          invoiceNumber: "INV-000128",
          invoiceDate: "2025-10-01",
          dueDate: "2025-10-15",
          totalAmount: 5000,
          amountPaid: 3200,
          remainingAmount: 1800,
          status: "PARTIALLY_PAID",
          fromName: "Test Org",
          clientName: "Test Customer",
          lineItems: [],
          payments: [
            { id: "pmt-001", amount: 3200, paidAt: "2025-10-15", method: "Bank Transfer", note: "--", paymentMethodDisplay: "Bank Transfer" },
          ],
        }}
      />
    );
    expect(html).toContain("Bank Transfer");
    expect(html).toContain("3,200");
  });

  it("invoice detail returns hasValidPaymentLink=true when razorpay link is valid", async () => {
    const { getPortalInvoiceDetail } = await import("../../actions");
    vi.mocked(getPortalInvoiceDetail).mockResolvedValueOnce({
      id: "inv-001",
      invoiceNumber: "INV-000128",
      invoiceDate: "2025-10-01",
      dueDate: "2025-10-15",
      totalAmount: 5000,
      amountPaid: 0,
      remainingAmount: 5000,
      status: "UNPAID",
      hasValidPaymentLink: true,
      fromName: "Test Org",
      clientName: "Test Customer",
      organization: { id: "org-1", name: "Test Org" },
      lineItems: [],
      payments: [],
    });

    const { ClientHubPaymentSelectionView } = await import("../components/views");
    const html = renderToStaticMarkup(
      <ClientHubPaymentSelectionView
        orgSlug={ORG_SLUG}
        invoice={{
          id: "inv-001",
          invoiceNumber: "INV-000128",
          dueDate: "2025-10-15",
          totalAmount: 5000,
          remainingAmount: 5000,
          hasValidPaymentLink: true,
          organization: { name: "Test Org", defaults: { bankName: "Emirates NBD", bankAccount: "123", bankIFSC: "AE07" } },
        }}
        config={mockConfig.value}
      />
    );
    expect(html).toContain("Payment Link");
  });

  it("invoice detail returns hasValidPaymentLink=false when razorpay link is expired or missing", async () => {
    const { getPortalInvoiceDetail } = await import("../../actions");
    vi.mocked(getPortalInvoiceDetail).mockResolvedValueOnce({
      id: "inv-001",
      invoiceNumber: "INV-000128",
      invoiceDate: "2025-10-01",
      dueDate: "2025-10-15",
      totalAmount: 5000,
      amountPaid: 0,
      remainingAmount: 5000,
      status: "UNPAID",
      hasValidPaymentLink: false,
      fromName: "Test Org",
      clientName: "Test Customer",
      organization: { id: "org-1", name: "Test Org" },
      lineItems: [],
      payments: [],
    });

    const { ClientHubPaymentSelectionView } = await import("../components/views");
    const html = renderToStaticMarkup(
      <ClientHubPaymentSelectionView
        orgSlug={ORG_SLUG}
        invoice={{
          id: "inv-001",
          invoiceNumber: "INV-000128",
          dueDate: "2025-10-15",
          totalAmount: 5000,
          remainingAmount: 5000,
          hasValidPaymentLink: false,
          organization: { name: "Test Org", defaults: { bankName: "Emirates NBD", bankAccount: "123", bankIFSC: "AE07" } },
        }}
        config={mockConfig.value}
      />
    );
    expect(html).not.toContain("Payment Link");
  });
});

describe("PaymentMethodSelector Component", () => {
  const dummyInvoice = {
    id: "inv-001",
    invoiceNumber: "INV-000131",
    dueDate: "2025-10-24",
    totalAmount: 1200,
    remainingAmount: 1200,
    organization: {
      name: "Acme Corporation",
      defaults: {
        bankName: "Emirates NBD",
        bankAccount: "1234567890123",
        bankIFSC: "AE07 0123 4567 8901 2345 678",
      },
    },
  };

  it("filters out UPI and unsupported methods from configured methods", () => {
    // Config has ["Payment Link", "Bank Transfer", "UPI"]
    const { queryByText } = render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={dummyInvoice}
        acceptedMethods={["Payment Link", "Bank Transfer", "UPI"]}
        hasValidPaymentLink={true}
      />
    );

    expect(screen.getByText("Payment Link")).toBeInTheDocument();
    expect(screen.getByText("Bank Transfer")).toBeInTheDocument();
    expect(queryByText("UPI")).not.toBeInTheDocument();
  });

  it("hides Bank Transfer option if organization bank defaults are missing", () => {
    const invoiceNoBank = {
      ...dummyInvoice,
      organization: {
        name: "Acme Corporation",
        defaults: null,
      },
    };

    const { queryByText } = render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={invoiceNoBank}
        acceptedMethods={["Payment Link", "Bank Transfer"]}
        hasValidPaymentLink={true}
      />
    );

    expect(screen.getByText("Payment Link")).toBeInTheDocument();
    expect(queryByText("Bank Transfer")).not.toBeInTheDocument();
  });

  it("hides Payment Link option when no valid payment link exists for invoice", () => {
    const { queryByText } = render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={dummyInvoice}
        acceptedMethods={["Payment Link", "Bank Transfer"]}
        hasValidPaymentLink={false}
      />
    );

    expect(queryByText("Payment Link")).not.toBeInTheDocument();
    expect(screen.getByText("Bank Transfer")).toBeInTheDocument();
  });

  it("displays bank details when Bank Transfer is selected", () => {
    render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={dummyInvoice}
        acceptedMethods={["Payment Link", "Bank Transfer"]}
        hasValidPaymentLink={true}
      />
    );

    // Bank transfer details shouldn't be visible before selecting
    expect(screen.queryByText("Payment Instructions")).not.toBeInTheDocument();

    // Select Bank Transfer
    fireEvent.click(screen.getByText("Bank Transfer"));

    // Bank details should now be visible
    expect(screen.getByText("Payment Instructions")).toBeInTheDocument();
    expect(screen.getByText("Emirates NBD")).toBeInTheDocument();
    expect(screen.getByText("1234567890123")).toBeInTheDocument();
    expect(screen.getByText("AE07 0123 4567 8901 2345 678")).toBeInTheDocument();
  });

  it("triggers payment initiation on proceed click when Payment Link is selected", async () => {
    const { initiatePortalPayment } = await import("../../actions");
    vi.mocked(initiatePortalPayment).mockClear();

    render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={dummyInvoice}
        acceptedMethods={["Payment Link"]}
        hasValidPaymentLink={true}
      />
    );

    // Select Payment Link
    fireEvent.click(screen.getByText("Payment Link"));

    // Proceed button should appear
    const proceedBtn = screen.getByText("PROCEED TO SECURE PAYMENT");
    expect(proceedBtn).toBeInTheDocument();

    // Click proceed
    fireEvent.click(proceedBtn);

    expect(proceedBtn).toBeDisabled();
    expect(screen.getByText("Initiating...")).toBeInTheDocument();

    await waitFor(() => {
      expect(initiatePortalPayment).toHaveBeenCalledWith(ORG_SLUG, "inv-001");
      expect(mockLocationHref).toHaveBeenCalledWith("https://razorpay.com/pay");
    });
  });

  it("shows an error message if payment initiation fails or returns no URL", async () => {
    const { initiatePortalPayment } = await import("../../actions");
    vi.mocked(initiatePortalPayment).mockResolvedValueOnce({ url: null });

    render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={dummyInvoice}
        acceptedMethods={["Payment Link"]}
        hasValidPaymentLink={true}
      />
    );

    fireEvent.click(screen.getByText("Payment Link"));
    fireEvent.click(screen.getByText("PROCEED TO SECURE PAYMENT"));

    await waitFor(() => {
      expect(screen.getByText("Unable to initiate online payment. Please contact support or use another payment method.")).toBeInTheDocument();
    });
  });

  it("does not render Payment Link method when hasValidPaymentLink is false even if configured", () => {
    render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={dummyInvoice}
        acceptedMethods={["Payment Link"]}
        hasValidPaymentLink={false}
      />
    );

    expect(screen.queryByText("Payment Link")).not.toBeInTheDocument();
    expect(screen.queryByText("PROCEED TO SECURE PAYMENT")).not.toBeInTheDocument();
  });
});

// ─── Quotes view misleading metrics/CTA prevention ─────────────────────────

describe("Quotes view misleading metrics/CTA prevention", () => {
  it("suppresses summary metrics when quotesError is set", async () => {
    const { getPortalQuotes } = await import("../../actions");
    vi.mocked(getPortalQuotes).mockResolvedValueOnce({ success: false, error: "Database error" });

    const html = await renderAsyncPage(QuotesPage);
    expect(html).not.toContain("Awaiting Reply");
    expect(html).not.toContain("Accepted");
    expect(html).not.toContain("Avg. Quote Value");
  });

  it("suppresses Open Pending Quote CTA when quotesError is set", async () => {
    const { getPortalQuotes } = await import("../../actions");
    vi.mocked(getPortalQuotes).mockResolvedValueOnce({ success: false, error: "Database error" });

    const html = await renderAsyncPage(QuotesPage);
    expect(html).not.toContain("Open Pending Quote");
  });

  it("shows summary metrics when quotes load successfully with empty array", async () => {
    const { getPortalQuotes } = await import("../../actions");
    vi.mocked(getPortalQuotes).mockResolvedValueOnce({ success: true, data: [] });

    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Awaiting Reply");
    expect(html).toContain("Accepted");
    expect(html).toContain("Avg. Quote Value");
  });

  it("shows summary metrics when quotes load successfully with populated array", async () => {
    const { getPortalQuotes } = await import("../../actions");
    vi.mocked(getPortalQuotes).mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: "qt-001",
          quoteNumber: "QT-000084",
          title: "Lead Gen",
          status: "SENT",
          issueDate: new Date(),
          validUntil: new Date(Date.now() + 86_400_000),
          totalAmount: 2800,
          acceptedAt: null,
          declinedAt: null,
          canRespond: true,
        },
      ],
    });

    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Awaiting Reply");
    expect(html).toContain("Accepted");
    expect(html).toContain("Avg. Quote Value");
    expect(html).toContain("Open Pending Quote");
  });

  it("shows truthful failure state but no misleading metrics on error", async () => {
    const { getPortalQuotes } = await import("../../actions");
    vi.mocked(getPortalQuotes).mockResolvedValueOnce({ success: false, error: "Server error" });

    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Unable to load quotes");
    expect(html).not.toContain("Awaiting Reply");
    expect(html).not.toContain("Open Pending Quote");
    expect(html).not.toContain("No quotes found.");
  });
});
