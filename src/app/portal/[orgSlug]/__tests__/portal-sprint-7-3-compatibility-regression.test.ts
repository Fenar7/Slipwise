import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Hoisted mocks for DB and redirect
const mockDb = vi.hoisted(() => ({
  customer: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  organization: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  clientHubCustomerLifecycle: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  customerPortalToken: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  customerPortalSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  orgDefaults: {
    findUnique: vi.fn(),
  },
  customerPortalAccessLog: {
    create: vi.fn(),
  },
  invoicePayment: {
    findMany: vi.fn(),
  },
  invoice: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  },
  quote: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  invoiceTicket: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockReturnValue(Promise.resolve()) }));

const mockRedirect = vi.hoisted(() => vi.fn().mockImplementation(() => {
  throw new Error("Redirected");
}));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  notFound: vi.fn(),
}));

const mockCookies = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue(mockCookies),
}));

// Mock checkPortalEligibility
const mockCheckPortalEligibility = vi.hoisted(() => vi.fn());
vi.mock("@/lib/portal-eligibility", () => ({
  checkPortalEligibility: mockCheckPortalEligibility,
  checkLegacyRouteRedirect: async (orgSlug: string, targetPath: string) => {
    const eligibility = await mockCheckPortalEligibility(orgSlug);
    if (eligibility.state === "ENABLED_AND_READY" || eligibility.state === "ENABLED_BUT_NOT_READY") {
      mockRedirect(`/portal/${orgSlug}/client-hub${targetPath}`);
    }
  },
}));

// Mock portal auth functions
const mockGetPortalSession = vi.hoisted(() => vi.fn());
const mockRequirePortalSession = vi.hoisted(() => vi.fn());
const mockVerifyMagicLink = vi.hoisted(() => vi.fn());
vi.mock("@/lib/portal-auth", () => ({
  getPortalSession: mockGetPortalSession,
  requirePortalSession: mockRequirePortalSession,
  verifyMagicLink: mockVerifyMagicLink,
  requestPortalOtp: vi.fn(),
  requestMagicLink: vi.fn(),
  logPortalAccess: vi.fn(),
}));

import { checkLegacyRouteRedirect } from "@/lib/portal-eligibility";
import PortalDashboardPage from "../dashboard/page";
import PortalInvoicesPage from "../invoices/page";
import PortalInvoiceDetailPage from "../invoices/[id]/page";
import PortalQuotesPage from "../quotes/page";
import PortalQuoteDetailPage from "../quotes/[id]/page";
import PortalPaymentsPage from "../payments/page";
import PortalVerifyPage from "../auth/verify/page";

describe("Client Hub Phase 7 Sprint 7.3 Compatibility & Regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("A. Legacy route and entrypoint compatibility closeout (Redirects)", () => {
    it("should redirect legacy dashboard to Client Hub if enabled and ready", async () => {
      mockCheckPortalEligibility.mockResolvedValue({
        state: "ENABLED_AND_READY",
        org: { id: "org1", name: "Org 1" },
        config: {},
      });
      mockGetPortalSession.mockResolvedValue({ customerId: "c1", orgId: "org1" });

      await expect(
        PortalDashboardPage({ params: Promise.resolve({ orgSlug: "org-slug" }) })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/client-hub");
    });

    it("should redirect legacy invoices page to Client Hub if enabled", async () => {
      mockCheckPortalEligibility.mockResolvedValue({
        state: "ENABLED_AND_READY",
        org: { id: "org1", name: "Org 1" },
        config: {},
      });
      mockGetPortalSession.mockResolvedValue({ customerId: "c1", orgId: "org1" });

      await expect(
        PortalInvoicesPage({ params: Promise.resolve({ orgSlug: "org-slug" }) })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/client-hub/invoices");
    });

    it("should redirect legacy invoice detail page to Client Hub if enabled", async () => {
      mockCheckPortalEligibility.mockResolvedValue({
        state: "ENABLED_AND_READY",
        org: { id: "org1", name: "Org 1" },
        config: {},
      });
      mockGetPortalSession.mockResolvedValue({ customerId: "c1", orgId: "org1" });

      await expect(
        PortalInvoiceDetailPage({ params: Promise.resolve({ orgSlug: "org-slug", id: "inv-1" }) })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/client-hub/invoices/inv-1");
    });

    it("should redirect legacy quotes page to Client Hub if enabled", async () => {
      mockCheckPortalEligibility.mockResolvedValue({
        state: "ENABLED_AND_READY",
        org: { id: "org1", name: "Org 1" },
        config: {},
      });
      mockGetPortalSession.mockResolvedValue({ customerId: "c1", orgId: "org1" });

      await expect(
        PortalQuotesPage({ params: Promise.resolve({ orgSlug: "org-slug" }) })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/client-hub/quotes");
    });

    it("should redirect legacy quote detail page to Client Hub if enabled", async () => {
      mockCheckPortalEligibility.mockResolvedValue({
        state: "ENABLED_AND_READY",
        org: { id: "org1", name: "Org 1" },
        config: {},
      });
      mockGetPortalSession.mockResolvedValue({ customerId: "c1", orgId: "org1" });

      await expect(
        PortalQuoteDetailPage({ params: Promise.resolve({ orgSlug: "org-slug", id: "quote-1" }) })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/client-hub/quotes/quote-1");
    });

    it("should redirect legacy payments page to Client Hub if enabled", async () => {
      mockCheckPortalEligibility.mockResolvedValue({
        state: "ENABLED_AND_READY",
        org: { id: "org1", name: "Org 1" },
        config: {},
      });
      mockGetPortalSession.mockResolvedValue({ customerId: "c1", orgId: "org1" });

      await expect(
        PortalPaymentsPage({ params: Promise.resolve({ orgSlug: "org-slug" }) })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/client-hub/payments");
    });

    it("should NOT redirect legacy pages if Client Hub is disabled", async () => {
      mockCheckPortalEligibility.mockResolvedValue({
        state: "DISABLED",
        org: { id: "org1", name: "Org 1", defaults: { portalEnabled: true } },
      });
      mockGetPortalSession.mockResolvedValue({ customerId: "c1", orgId: "org1" });
      mockDb.customer.findUnique.mockResolvedValue({ name: "C1", email: "c1@test.com" });
      mockDb.orgDefaults.findUnique.mockResolvedValue({ portalQuoteAcceptanceEnabled: true });
      mockDb.invoice.findMany.mockResolvedValue([]);
      mockDb.invoice.aggregate.mockResolvedValue({ _sum: { remainingAmount: 0 } });
      mockDb.invoice.count.mockResolvedValue(0);
      mockDb.invoiceTicket.count.mockResolvedValue(0);
      mockDb.quote.count.mockResolvedValue(0);

      // Should not redirect but attempt to render
      const res = await PortalDashboardPage({ params: Promise.resolve({ orgSlug: "org-slug" }) });
      expect(mockRedirect).not.toHaveBeenCalled();
      expect(res).toBeDefined();
    });
  });

  describe("B. Verify route redirection on login/magic link verification", () => {
    it("should verify link and redirect to Client Hub if enabled", async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true, customerId: "c1", orgId: "org1" });
      mockCheckPortalEligibility.mockResolvedValue({
        state: "ENABLED_AND_READY",
        org: { id: "org1", name: "Org 1" },
        config: {},
      });

      await expect(
        PortalVerifyPage({
          params: Promise.resolve({ orgSlug: "org-slug" }),
          searchParams: Promise.resolve({ token: "t1", cid: "c1" }),
        })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/client-hub");
    });

    it("should verify link and redirect to legacy dashboard if Client Hub is disabled", async () => {
      mockVerifyMagicLink.mockResolvedValue({ success: true, customerId: "c1", orgId: "org1" });
      mockCheckPortalEligibility.mockResolvedValue({
        state: "DISABLED",
        org: { id: "org1", name: "Org 1" },
      });

      await expect(
        PortalVerifyPage({
          params: Promise.resolve({ orgSlug: "org-slug" }),
          searchParams: Promise.resolve({ token: "t1", cid: "c1" }),
        })
      ).rejects.toThrow("Redirected");

      expect(mockRedirect).toHaveBeenCalledWith("/portal/org-slug/dashboard");
    });
  });
});
