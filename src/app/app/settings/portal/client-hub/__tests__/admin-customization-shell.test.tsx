/**
 * Phase 3 Sprint 3.1 — Admin Customization Shell Persisted UI Tests
 *
 * Covers: customization shell renders with all major sections,
 * preview pane renders, loading state resolves, persistence notice is active,
 * tab switching works, and save action is wired up.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import ClientHubCustomizationPage from "../page";
import { getClientHubOrgConfig, getClientOverrideEditorState, getClientHubCustomers, getClientHubCustomerLifecycle } from "@/app/app/actions/client-hub-actions";

beforeEach(() => {
  cleanup();
  vi.mocked(getClientHubOrgConfig).mockReset();
  vi.mocked(getClientHubOrgConfig).mockResolvedValue({
    success: true,
    config: mockDefaultConfig,
    isNew: false,
  });
  vi.mocked(getClientHubCustomers).mockReset();
  vi.mocked(getClientHubCustomers).mockResolvedValue({
    success: true,
    customers: [
      { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
    ],
  });
  vi.mocked(getClientOverrideEditorState).mockReset();
  vi.mocked(getClientOverrideEditorState).mockResolvedValue({
    success: true,
    customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
    orgDefault: mockDefaultConfig,
    overrideConfig: {},
    effectiveConfig: mockDefaultConfig,
  });
  vi.mocked(getClientHubCustomerLifecycle).mockReset();
  vi.mocked(getClientHubCustomerLifecycle).mockResolvedValue({
    success: true,
    customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
    lifecycle: null,
    readiness: {
      enabled: false,
      readinessStatus: "disabled",
      previewEligible: false,
      inviteEligible: false,
      portalReady: false,
      blockers: ["Client Hub is not enabled for this customer"],
    },
  });
});

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
  getClientHubOrgConfig: vi.fn().mockResolvedValue({
    success: true,
    config: mockDefaultConfig,
    isNew: false,
  }),
  updateClientHubOrgConfig: vi.fn().mockResolvedValue({ success: true }),
  getClientHubCustomers: vi.fn().mockResolvedValue({
    success: true,
    customers: [
      { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
    ],
  }),
  getClientOverrideEditorState: vi.fn().mockResolvedValue({
    success: true,
    customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
    orgDefault: mockDefaultConfig,
    overrideConfig: {},
    effectiveConfig: mockDefaultConfig,
  }),
  updateClientHubCustomerOverride: vi.fn().mockResolvedValue({ success: true, isCleared: false }),
  clearClientHubCustomerOverride: vi.fn().mockResolvedValue({ success: true }),
  getClientHubCustomerLifecycle: vi.fn().mockResolvedValue({
    success: true,
    customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
    lifecycle: null,
    readiness: {
      enabled: false,
      readinessStatus: "disabled",
      previewEligible: false,
      inviteEligible: false,
      portalReady: false,
      blockers: ["Client Hub is not enabled for this customer"],
    },
  }),
  enableClientHubForCustomer: vi.fn().mockResolvedValue({ success: true }),
  disableClientHubForCustomer: vi.fn().mockResolvedValue({ success: true }),
  previewClientHubForCustomer: vi.fn().mockResolvedValue({
    success: true,
    customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
    effectiveConfig: mockDefaultConfig,
    readiness: {
      enabled: true,
      readinessStatus: "enabled_ready",
      previewEligible: true,
      inviteEligible: true,
      portalReady: true,
      blockers: [],
    },
  }),
  copyClientHubLink: vi.fn().mockResolvedValue({ success: true, url: "https://app.slipwise.app/portal/acme/client-hub" }),
  resendClientHubInvite: vi.fn().mockResolvedValue({ success: true }),
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

  it("renders a professional load-error state with a retry option if getClientHubOrgConfig fails", async () => {
    vi.mocked(getClientHubOrgConfig).mockResolvedValueOnce({
      success: false,
      error: "Failed to retrieve Client Hub configuration due to an internal server or database error.",
    });

    render(<ClientHubCustomizationPage />);

    // Wait for the load failure state to render
    const errorHeading = await screen.findByText("Failed to Load Settings");
    expect(errorHeading).toBeInTheDocument();
    expect(screen.getByText("Failed to retrieve Client Hub configuration due to an internal server or database error.")).toBeInTheDocument();
    
    // A retry button is rendered
    const retryBtn = screen.getByRole("button", { name: /retry loading/i });
    expect(retryBtn).toBeInTheDocument();
  });

  it("successfully retries loading configuration when user clicks the retry button", async () => {
    // 1. First load fails
    vi.mocked(getClientHubOrgConfig).mockResolvedValueOnce({
      success: false,
      error: "Failed to retrieve Client Hub configuration due to an internal server or database error.",
    });

    render(<ClientHubCustomizationPage />);

    const retryBtn = await screen.findByRole("button", { name: /retry loading/i });

    // 2. Mock a successful subsequent load when retry is pressed
    vi.mocked(getClientHubOrgConfig).mockResolvedValueOnce({
      success: true,
      config: mockDefaultConfig,
      isNew: false,
    });

    fireEvent.click(retryBtn);

    // 3. The page renders normally now
    await screen.findByRole("tab", { name: /branding/i });
    expect(screen.queryByText("Failed to Load Settings")).not.toBeInTheDocument();
    expect(screen.getByText("Client Hub Customization")).toBeInTheDocument();
  });

  it("renders customization shell successfully when validated fallback config is resolved", async () => {
    const partialConfig = {
      ...mockDefaultConfig,
      branding: {
        ...mockDefaultConfig.branding,
        accentColor: "#aabbcc",
      },
      homeDashboard: {
        ...mockDefaultConfig.homeDashboard,
        heroTitle: "Partial Shell Title",
      },
    };

    vi.mocked(getClientHubOrgConfig).mockResolvedValueOnce({
      success: true,
      config: partialConfig,
      isNew: false,
    });

    render(<ClientHubCustomizationPage />);

    // Renders the page normally with the partial/fallback values loaded
    await screen.findByRole("tab", { name: /branding/i });
    expect(screen.queryByText("Failed to Load Settings")).not.toBeInTheDocument();
    expect(screen.getByText("Client Hub Customization")).toBeInTheDocument();
  });

  it("stays in org-default mode when switching to a client fails to load", async () => {
    render(<ClientHubCustomizationPage />);

    await screen.findByRole("tab", { name: /branding/i });
    expect(screen.getByText(/organization default settings/i)).toBeInTheDocument();

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: false,
      error: "Failed to load client override settings",
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    // Wait for the async handleModeChange to fully resolve by waiting for
    // the select to reappear after the loading spinner unmounts.
    await screen.findByLabelText(/customization target scope/i);

    // Re-query select after loading spinner unmounts and shell remounts
    const selectAfter = screen.getByLabelText(/customization target scope/i);
    expect(screen.queryByText(/client-specific override mode/i)).not.toBeInTheDocument();
    expect(selectAfter).toHaveValue("");
  });

  it("remains on the current client when switching to another client fails to load", async () => {
    render(<ClientHubCustomizationPage />);

    await screen.findByRole("tab", { name: /branding/i });

    // Successfully switch to first client
    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: { branding: { accentColor: "#ff0000" } },
      effectiveConfig: {
        ...mockDefaultConfig,
        branding: { ...mockDefaultConfig.branding, accentColor: "#ff0000" },
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);
    expect(select).toHaveValue("cust_123");

    // Attempt to switch to a second client that fails
    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: false,
      error: "Failed to load client override settings",
    });

    fireEvent.change(select, { target: { value: "cust_456" } });

    // Should remain on the first client after load failure
    await screen.findByText(/client-specific override mode/i);
    const selectAfter = screen.getByLabelText(/customization target scope/i);
    expect(selectAfter).toHaveValue("cust_123");
    expect(screen.getByText(/client-specific override mode/i)).toBeInTheDocument();
  });

  it("retains org-default config values when a client switch fails", async () => {
    render(<ClientHubCustomizationPage />);

    await screen.findByRole("tab", { name: /branding/i });
    expect(screen.getByText(/organization default settings/i)).toBeInTheDocument();

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: false,
      error: "Failed to load client override settings",
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    // Wait for the async handleModeChange to fully resolve by waiting for
    // the select to reappear after the loading spinner unmounts.
    await screen.findByLabelText(/customization target scope/i);

    // Should still be in org defaults mode with no stale client values
    const selectAfter = screen.getByLabelText(/customization target scope/i);
    expect(screen.getByText(/organization default settings/i)).toBeInTheDocument();
    expect(selectAfter).toHaveValue("");
    expect(screen.queryByText(/client-specific override mode/i)).not.toBeInTheDocument();
  });

  it("renders lifecycle status as disabled when switching to a client with no lifecycle record", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    // Explicitly reset mocks to default success behavior to avoid test-isolation drift
    vi.mocked(getClientOverrideEditorState).mockResolvedValue({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValue({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: null,
      readiness: {
        enabled: false,
        readinessStatus: "disabled",
        previewEligible: false,
        inviteEligible: false,
        portalReady: false,
        blockers: ["Client Hub is not enabled for this customer"],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);

    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enable client hub/i })).toBeInTheDocument();
    expect(screen.getByText(/preview not eligible/i)).toBeInTheDocument();
    expect(screen.getByText(/invite not eligible/i)).toBeInTheDocument();
    expect(screen.getByText(/portal not ready/i)).toBeInTheDocument();
    expect(screen.getByText(/readiness blockers/i)).toBeInTheDocument();
  });

  it("renders lifecycle status as enabled and ready when customer is enabled", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });

    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_ready",
        previewEligible: true,
        inviteEligible: true,
        portalReady: true,
        blockers: [],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);

    expect(screen.getByText(/enabled & ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable client hub/i })).toBeInTheDocument();
    expect(screen.getByText(/preview eligible/i)).toBeInTheDocument();
    expect(screen.getByText(/invite eligible/i)).toBeInTheDocument();
    expect(screen.getByText(/portal ready/i)).toBeInTheDocument();
    expect(screen.queryByText(/readiness blockers/i)).not.toBeInTheDocument();
  });

  it("renders lifecycle status as enabled not ready when customer lacks email", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: null },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });

    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: null },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_not_ready",
        previewEligible: true,
        inviteEligible: false,
        portalReady: false,
        blockers: ["Customer email is required for portal invite"],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);

    expect(screen.getByText(/enabled — not ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disable client hub/i })).toBeInTheDocument();
    expect(screen.getByText(/preview eligible/i)).toBeInTheDocument();
    expect(screen.getByText(/invite not eligible/i)).toBeInTheDocument();
    expect(screen.getByText(/portal not ready/i)).toBeInTheDocument();
    expect(screen.getByText(/readiness blockers/i)).toBeInTheDocument();
  });

  it("preserves prior client lifecycle when switching to another client fails", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    // 1. Successfully switch to first client (cust_123) — enabled & ready
    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_ready",
        previewEligible: true,
        inviteEligible: true,
        portalReady: true,
        blockers: [],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);
    expect(screen.getByText(/enabled & ready/i)).toBeInTheDocument();

    // 2. Attempt to switch to second client (cust_456) — override fails, lifecycle succeeds
    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: false,
      error: "Failed to load client override settings",
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_456", name: "Beta Corp", email: "beta@corp.com" },
      lifecycle: { enabled: false, enabledAt: null, disabledAt: new Date(), enabledByUserId: null },
      readiness: {
        enabled: false,
        readinessStatus: "disabled",
        previewEligible: false,
        inviteEligible: false,
        portalReady: false,
        blockers: ["Client Hub is not enabled for this customer"],
      },
    });

    fireEvent.change(select, { target: { value: "cust_456" } });

    // Wait for loading to finish
    await screen.findByText(/client-specific override mode/i);

    // Should still show cust_123's lifecycle (enabled & ready), not cust_456's disabled state
    const selectAfter = screen.getByLabelText(/customization target scope/i);
    expect(selectAfter).toHaveValue("cust_123");
    expect(screen.getByText(/enabled & ready/i)).toBeInTheDocument();
    expect(screen.queryByText(/disabled/i)).not.toBeInTheDocument();
  });

  it("does not show lifecycle from a failed org-to-client switch", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    // Confirm org-default mode with no lifecycle panel
    expect(screen.getByText(/organization default settings/i)).toBeInTheDocument();
    expect(screen.queryByText(/client hub status/i)).not.toBeInTheDocument();

    // Attempt to switch to client where override fails but lifecycle succeeds
    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: false,
      error: "Failed to load client override settings",
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_ready",
        previewEligible: true,
        inviteEligible: true,
        portalReady: true,
        blockers: [],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    // Wait for loading spinner to disappear and shell to reappear
    await screen.findByLabelText(/customization target scope/i);

    // Should remain in org-default mode without a lifecycle panel
    const selectAfter = screen.getByLabelText(/customization target scope/i);
    expect(selectAfter).toHaveValue("");
    expect(screen.getByText(/organization default settings/i)).toBeInTheDocument();
    expect(screen.queryByText(/client hub status/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/enabled & ready/i)).not.toBeInTheDocument();
  });

  // ─── Sprint 3.4 — Admin Workflow UI Tests ─────────────────────────────────

  it("renders preview, copy link, and resend invite buttons for enabled ready customer", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_ready",
        previewEligible: true,
        inviteEligible: true,
        portalReady: true,
        blockers: [],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);
    expect(screen.getByText(/enabled & ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preview as client/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy hub link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend invite/i })).toBeInTheDocument();
  });

  it("hides action buttons for disabled customer", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: null,
      readiness: {
        enabled: false,
        readinessStatus: "disabled",
        previewEligible: false,
        inviteEligible: false,
        portalReady: false,
        blockers: ["Client Hub is not enabled for this customer"],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);
    expect(screen.getByText(/disabled/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview as client/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy hub link/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resend invite/i })).not.toBeInTheDocument();
  });

  it("disables resend invite when customer is not invite eligible", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: null },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: null },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_not_ready",
        previewEligible: true,
        inviteEligible: false,
        portalReady: false,
        blockers: ["Customer email is required for portal invite"],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);
    expect(screen.getByText(/enabled — not ready/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preview as client/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy hub link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send invite/i })).toBeDisabled();
  });

  it("opens preview modal when preview button is clicked for enabled customer", async () => {
    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_ready",
        previewEligible: true,
        inviteEligible: true,
        portalReady: true,
        blockers: [],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);

    const previewBtn = screen.getByRole("button", { name: /preview as client/i });
    fireEvent.click(previewBtn);

    await screen.findByRole("dialog");
    expect(screen.getByText("Client Hub Preview")).toBeInTheDocument();
  });

  it("copies hub link to clipboard when copy link button is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<ClientHubCustomizationPage />);
    await screen.findByRole("tab", { name: /branding/i });

    vi.mocked(getClientOverrideEditorState).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      orgDefault: mockDefaultConfig,
      overrideConfig: {},
      effectiveConfig: mockDefaultConfig,
    });
    vi.mocked(getClientHubCustomerLifecycle).mockResolvedValueOnce({
      success: true,
      customer: { id: "cust_123", name: "Acme Client", email: "client@acme.com" },
      lifecycle: { enabled: true, enabledAt: new Date(), disabledAt: null, enabledByUserId: "user-1" },
      readiness: {
        enabled: true,
        readinessStatus: "enabled_ready",
        previewEligible: true,
        inviteEligible: true,
        portalReady: true,
        blockers: [],
      },
    });

    const select = screen.getByLabelText(/customization target scope/i);
    fireEvent.change(select, { target: { value: "cust_123" } });

    await screen.findByText(/client-specific override mode/i);

    const copyBtn = screen.getByRole("button", { name: /copy hub link/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://app.slipwise.app/portal/acme/client-hub");
    });
  });
});
