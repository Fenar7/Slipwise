import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { getClientDetail, createCustomer, updateCustomer } from "../../data/actions";
import { ClientDetailSections } from "../components/client-detail-sections";
import { ClientForm } from "../components/client-form";

// Mock Next.js routing and link
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  notFound: () => {
    throw new Error("NotFound");
  },
}));

vi.mock("@/features/tags/components/tag-picker", () => ({
  TagPicker: ({ selectedIds, onChange }: any) => (
    <div data-testid="tag-picker" data-selected-ids={JSON.stringify(selectedIds)}>
      <button onClick={() => onChange([...selectedIds, "new-tag-id"])}>Add Tag</button>
    </div>
  ),
}));

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  customerFindFirst: vi.fn(),
  customerCreate: vi.fn(),
  customerUpdate: vi.fn(),
  invoiceFindMany: vi.fn(),
  quoteFindMany: vi.fn(),
  crmNoteFindMany: vi.fn(),
  customerPortalAccessLogFindMany: vi.fn(),
  profileFindUnique: vi.fn(),
  setCustomerDefaultTags: vi.fn(),
  getCustomerDefaultTags: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/db", () => ({
  db: {
    customer: {
      findFirst: mocks.customerFindFirst,
      create: mocks.customerCreate,
      update: mocks.customerUpdate,
    },
    invoice: {
      findMany: mocks.invoiceFindMany,
    },
    quote: {
      findMany: mocks.quoteFindMany,
    },
    crmNote: {
      findMany: mocks.crmNoteFindMany,
    },
    customerPortalAccessLog: {
      findMany: mocks.customerPortalAccessLogFindMany,
    },
    profile: {
      findUnique: mocks.profileFindUnique,
    },
  },
}));

vi.mock("@/lib/tags/assignment-service", () => ({
  setCustomerDefaultTags: mocks.setCustomerDefaultTags,
  setVendorDefaultTags: vi.fn(),
  getCustomerDefaultTags: mocks.getCustomerDefaultTags,
}));

describe("Sprint 2.4 — Client Hub Readiness and Operational Panels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgContext.mockResolvedValue({ orgId: "org-123" });
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.quoteFindMany.mockResolvedValue([]);
    mocks.crmNoteFindMany.mockResolvedValue([]);
    mocks.customerPortalAccessLogFindMany.mockResolvedValue([]);
  });

  describe("Server-Side Readiness Calculation (getClientDetail)", () => {
    it("assigns 100% score and isReady true for a perfect completed profile", async () => {
      mocks.customerFindFirst.mockResolvedValue({
        id: "cust-perfect",
        organizationId: "org-123",
        name: "Acme Corporate",
        email: "finance@acme.com",
        phone: "+91-9876543210",
        address: "123 Technology Park, Bangalore",
        gstin: "29ABCDE1234F1Z5",
        taxId: "ABCDE1234F",
        lifecycleStage: "ACTIVE",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        totalInvoiced: 1000,
        totalPaid: 1000,
        portalTokens: [
          {
            id: "token-1",
            isRevoked: false,
            expiresAt: new Date(Date.now() + 86400000),
            lastUsedAt: null,
          },
        ],
        defaultTagAssignments: [],
        _count: { invoices: 1, quotes: 1, portalAccessLogs: 1 },
      });

      const detail = await getClientDetail("cust-perfect");
      expect(detail).not.toBeNull();
      expect(detail?.readiness.isReady).toBe(true);
      expect(detail?.readiness.score).toBe(100);
      expect(detail?.readiness.blockers).toHaveLength(0);
      expect(detail?.readiness.warnings).toHaveLength(0);
    });

    it("applies deductions and lists blockers for a sparse profile with missing email and address", async () => {
      mocks.customerFindFirst.mockResolvedValue({
        id: "cust-sparse",
        organizationId: "org-123",
        name: "Minimalist Inc",
        email: null,
        phone: null,
        address: null,
        gstin: null,
        taxId: null,
        lifecycleStage: "PROSPECT",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        totalInvoiced: 0,
        totalPaid: 0,
        portalTokens: [],
        defaultTagAssignments: [],
        _count: { invoices: 0, quotes: 0, portalAccessLogs: 0 },
      });

      const detail = await getClientDetail("cust-sparse");
      expect(detail).not.toBeNull();
      expect(detail?.readiness.isReady).toBe(false);
      // Deduction calculations:
      // 2 blockers (missing email: -30, missing address: -30) -> -60
      // 3 warnings (missing phone: -10, missing tax identifiers: -10, preliminary stage 'PROSPECT': -10) -> -30
      // Expected Score: 100 - 60 - 30 = 10%
      expect(detail?.readiness.score).toBe(10);
      expect(detail?.readiness.blockers).toContain("Primary email address is required for Client Hub token provisioning.");
      expect(detail?.readiness.blockers).toContain("Billing address is required to generate compliant invoices.");
      expect(detail?.readiness.warnings).toContain("Primary phone number is not configured on the client profile.");
      expect(detail?.readiness.warnings).toContain("Tax ID / PAN / GSTIN is missing. Compliance requirements for B2B reporting are incomplete.");
    });

    it("prohibits active portal access and adds churned blocker if lifecycle is CHURNED", async () => {
      mocks.customerFindFirst.mockResolvedValue({
        id: "cust-churned",
        organizationId: "org-123",
        name: "Legacy Client",
        email: "legacy@client.com",
        phone: "+91-9999999999",
        address: "Old Town Road",
        gstin: "29ABCDE1234F1Z5",
        taxId: "ABCDE1234F",
        lifecycleStage: "CHURNED",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        totalInvoiced: 500,
        totalPaid: 500,
        portalTokens: [],
        defaultTagAssignments: [],
        _count: { invoices: 0, quotes: 0, portalAccessLogs: 0 },
      });

      const detail = await getClientDetail("cust-churned");
      expect(detail).not.toBeNull();
      expect(detail?.readiness.isReady).toBe(false);
      // Deduction calculations:
      // 1 blocker (churned: -30) -> -30
      // 1 warning (churned is not in ['ACTIVE', 'WON']: -10) -> -10
      // Expected Score: 100 - 30 - 10 = 60%
      expect(detail?.readiness.score).toBe(60);
      expect(detail?.readiness.blockers).toContain("Client profile is in CHURNED status. Active portal access is prohibited.");
    });
  });

  describe("Operational Warning Panels (ClientDetailSections)", () => {
    const mockClientData = (customFields = {}) => ({
      id: "cust-test",
      name: "Acme Labs",
      email: "labs@acme.com",
      phone: "+91-9876543211",
      lifecycleStage: "ACTIVE" as const,
      address: "Industrial Area Phase II",
      gstin: "29ABCDE1234F1Z5",
      panNumber: "ABCDE1234F",
      taxId: "ABCDE1234F",
      preferredLanguage: "en",
      outstandingBalance: 0,
      invoiceCount: 0,
      quoteCount: 0,
      createdAt: "2026-05-21T00:00:00Z",
      portalStatus: "disabled" as const,
      portalEnabled: false,
      portalAccessCount: 0,
      contacts: [
        {
          id: "cust-test-primary",
          name: "Acme Labs",
          email: "labs@acme.com",
          phone: "+91-9876543211",
          role: "Primary Contact",
          isPrimary: true,
        },
      ],
      recentInvoices: [],
      recentQuotes: [],
      recentActivity: [],
      billingAddress: "Industrial Area Phase II",
      readiness: {
        isReady: true,
        score: 100,
        blockers: [],
        warnings: [],
      },
      ...customFields,
    });

    it("renders flawless perfect-health overview panel when no blockers or warnings exist", () => {
      const client = mockClientData();
      render(<ClientDetailSections client={client} activeTab="overview" />);

      expect(screen.getByText("Perfect Health & Compatibility")).toBeDefined();
      expect(screen.getByText(/100%/)).toBeDefined();
    });

    it("renders active warnings and scores in Overview tab when warnings exist", () => {
      const client = mockClientData({
        phone: null,
        readiness: {
          isReady: true,
          score: 90,
          blockers: [],
          warnings: ["Primary phone number is not configured on the client profile."],
        },
      });

      render(<ClientDetailSections client={client} activeTab="overview" />);

      expect(screen.getByText(/90%/)).toBeDefined();
      expect(screen.getByText("Operational Warnings (1)")).toBeDefined();
      expect(screen.getByText("Primary phone number is not configured on the client profile.")).toBeDefined();
    });

    it("renders alert warnings on Contacts tab when contact email is missing", () => {
      const client = mockClientData({
        email: null,
        contacts: [],
        readiness: {
          isReady: false,
          score: 60,
          blockers: ["Primary email address is required for Client Hub token provisioning."],
          warnings: [],
        },
      });

      render(<ClientDetailSections client={client} activeTab="contacts" />);

      expect(screen.getByText("Operational Profile Incomplete")).toBeDefined();
      expect(screen.getByText(/Email Missing/)).toBeDefined();
      expect(screen.getByRole("link", { name: "Configure Contact Details" })).toBeDefined();
    });

    it("renders blocker information on Billing tab when address is missing", () => {
      const client = mockClientData({
        address: null,
        billingAddress: "",
        readiness: {
          isReady: false,
          score: 70,
          blockers: ["Billing address is required to generate compliant invoices."],
          warnings: [],
        },
      });

      render(<ClientDetailSections client={client} activeTab="billing" />);

      expect(screen.getByText("Billing & Tax Information Incomplete")).toBeDefined();
      expect(screen.getByText(/Billing Address Missing/)).toBeDefined();
      expect(screen.getByRole("link", { name: "Configure Billing & Tax Settings" })).toBeDefined();
    });
  });

  describe("Lifecycle Stage Editing and Default Tag Integrity (ClientForm)", () => {
    it("renders relationship lifecycle stage dropdown with selected hydrated option", () => {
      const client = {
        id: "cust-lifecycle-test",
        name: "Lifecycle Corp",
        email: "lifecycle@corp.com",
        phone: null,
        address: null,
        taxId: null,
        gstin: null,
        lifecycleStage: "WON" as const,
        defaultTagAssignments: [],
      };

      render(<ClientForm client={client} />);

      const selectNode = screen.getByLabelText("Relationship Lifecycle Stage") as HTMLSelectElement;
      expect(selectNode).toBeDefined();
      expect(selectNode.value).toBe("WON");
    });

    it("updateCustomer persists lifecycleStage and preserves default tags assignment", async () => {
      mocks.customerFindFirst.mockResolvedValue({ id: "cust-update-test", organizationId: "org-123" });
      mocks.customerUpdate.mockResolvedValue({ id: "cust-update-test" });

      const result = await updateCustomer("cust-update-test", {
        name: "Updated Name",
        lifecycleStage: "ACTIVE",
        tagIds: ["tag-vip-id", "tag-enterprise-id"],
      });

      expect(result.success).toBe(true);
      expect(mocks.customerUpdate).toHaveBeenCalledWith({
        where: { id: "cust-update-test" },
        data: {
          name: "Updated Name",
          lifecycleStage: "ACTIVE",
        },
      });
      expect(mocks.setCustomerDefaultTags).toHaveBeenCalledWith("cust-update-test", [
        "tag-vip-id",
        "tag-enterprise-id",
      ]);
    });
  });
});
