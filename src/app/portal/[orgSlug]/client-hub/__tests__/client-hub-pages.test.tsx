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
  initiatePortalPayment: vi.fn().mockResolvedValue({ url: "https://razorpay.com/pay" }),
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

import { PaymentMethodSelector } from "../components/payment-method-selector";

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
      />
    );

    expect(screen.getByText("Payment Link")).toBeInTheDocument();
    expect(queryByText("Bank Transfer")).not.toBeInTheDocument();
  });

  it("displays bank details when Bank Transfer is selected", () => {
    render(
      <PaymentMethodSelector
        orgSlug={ORG_SLUG}
        invoice={dummyInvoice}
        acceptedMethods={["Payment Link", "Bank Transfer"]}
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
      />
    );

    fireEvent.click(screen.getByText("Payment Link"));
    fireEvent.click(screen.getByText("PROCEED TO SECURE PAYMENT"));

    await waitFor(() => {
      expect(screen.getByText("Unable to initiate online payment. Please contact support or use another payment method.")).toBeInTheDocument();
    });
  });
});
