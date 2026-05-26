/**
 * Phase 3 Sprint 3.1 — Admin Customization Shell Persisted UI Tests
 *
 * Covers: customization shell renders with all major sections,
 * preview pane renders, loading state resolves, persistence notice is active,
 * tab switching works, and save action is wired up.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ClientHubCustomizationPage from "../page";

const mockUseActiveOrg = vi.hoisted(() => vi.fn(() => ({ activeOrg: { id: "org_001", name: "Acme", slug: "acme" } })));
const mockUsePermissions = vi.hoisted(() => vi.fn(() => ({ role: "admin" })));

const mockDefaultConfig = vi.hoisted(() => ({
  branding: { accentColor: "#e8401e", logoUrl: null, removePoweredBy: false },
  homeDashboard: {
    heroTitle: "Your Business Hub",
    heroSubtitle: "Welcome to your personalized client portal. Access your projects, invoices, and communicate with our team all in one place.",
    welcomeMessage: "Client Portal",
    showOutstandingBalance: true,
    showPendingInvoices: true,
    showPendingQuotes: true,
    showQuickActions: true,
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
    supportPhone: "+91 98765 43210",
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
}));

vi.mock("@/hooks/use-active-org", () => ({ useActiveOrg: mockUseActiveOrg }));
vi.mock("@/hooks/use-permissions", () => ({ usePermissions: mockUsePermissions }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/settings/portal/client-hub" }));

vi.mock("@/app/app/actions/client-hub-actions", () => ({
  getClientHubOrgConfig: vi.fn().mockResolvedValue(mockDefaultConfig),
  updateClientHubOrgConfig: vi.fn().mockResolvedValue({ success: true }),
}));

describe("ClientHubCustomizationPage", () => {
  it("renders the customization shell with header and tabs after loading resolves", async () => {
    render(<ClientHubCustomizationPage />);

    // Wait for async loading to resolve
    await screen.findByRole("tab", { name: /branding/i });

    expect(screen.getByText("Client Hub Customization")).toBeInTheDocument();
    expect(screen.getByText(/customize branding, content, and experience/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /branding/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /home \/ dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /invoices/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /quotes/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /payments/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /contact/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /products \/ services/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /navigation \/ footer/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /preview/i })).toBeInTheDocument();
  });

  it("shows organization defaults notice and disabled save action when unchanged", async () => {
    render(<ClientHubCustomizationPage />);

    await screen.findByRole("tab", { name: /branding/i });

    expect(screen.getByText(/organization default settings/i)).toBeInTheDocument();
    expect(screen.getByText(/these customizations define the default branding/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save & publish/i })).toBeDisabled();
  });

  it("switches tabs and renders corresponding section content", async () => {
    render(<ClientHubCustomizationPage />);

    await screen.findByRole("tab", { name: /branding/i });

    // Default: Branding tab
    expect(screen.getByText("Brand Colors")).toBeInTheDocument();

    // Switch to Home/Dashboard
    fireEvent.click(screen.getByRole("tab", { name: "Home / Dashboard" }));
    expect(screen.getByText("Hero Messaging")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Cards")).toBeInTheDocument();

    // Switch to Invoices
    fireEvent.click(screen.getByRole("tab", { name: "Invoices" }));
    expect(screen.getByLabelText("Page Title")).toBeInTheDocument();
    expect(screen.getByText("Show download button")).toBeInTheDocument();

    // Switch to Quotes
    fireEvent.click(screen.getByRole("tab", { name: "Quotes" }));
    expect(screen.getByText(/enable accept \/ decline/i)).toBeInTheDocument();

    // Switch to Payments
    fireEvent.click(screen.getByRole("tab", { name: "Payments" }));
    expect(screen.getByText("Show payment methods list")).toBeInTheDocument();

    // Switch to About
    fireEvent.click(screen.getByRole("tab", { name: "About" }));
    expect(screen.getByLabelText("Body")).toBeInTheDocument();

    // Switch to Contact
    fireEvent.click(screen.getByRole("tab", { name: "Contact" }));
    expect(screen.getByLabelText("Support Email")).toBeInTheDocument();

    // Switch to Products
    fireEvent.click(screen.getByRole("tab", { name: "Products / Services" }));
    expect(screen.getByText("Show pricing")).toBeInTheDocument();

    // Switch to Navigation
    fireEvent.click(screen.getByRole("tab", { name: "Navigation / Footer" }));
    expect(screen.getByLabelText("Footer Text")).toBeInTheDocument();
  });

  it("renders preview pane with preview-only marker", async () => {
    render(<ClientHubCustomizationPage />);

    await screen.findByRole("tab", { name: /branding/i });

    expect(screen.getByText("Live Preview")).toBeInTheDocument();
    expect(screen.getAllByText("Preview only").length).toBeGreaterThanOrEqual(1);
  });

  it("switches preview pages without leaving preview mode", async () => {
    render(<ClientHubCustomizationPage />);

    await screen.findByRole("tab", { name: /branding/i });

    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(screen.getByText("Preview Controls")).toBeInTheDocument();
    expect(screen.getAllByText("Your Business Hub").length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole("button", { name: "Contact" }));
    expect(screen.getByText("Preview Controls")).toBeInTheDocument();
    expect(screen.getAllByText("Get in touch with our team - we're here to help").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty-org message when no active org", () => {
    mockUseActiveOrg.mockReturnValueOnce({ activeOrg: null });
    render(<ClientHubCustomizationPage />);
    expect(screen.getByText(/no active organization/i)).toBeInTheDocument();
  });

  it("denies access for non-admin users", () => {
    mockUsePermissions.mockReturnValueOnce({ role: "member" });
    render(<ClientHubCustomizationPage />);
    expect(screen.getByText(/you need admin or owner access/i)).toBeInTheDocument();
  });
});
