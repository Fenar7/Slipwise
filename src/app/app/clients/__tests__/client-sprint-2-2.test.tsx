import { describe, it, expect, vi, beforeEach } from "vitest";
import { getClientDetail } from "../../data/actions";
import ClientDetailPage from "../[id]/page";

// Standard Next.js route mock
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound called");
  }),
}));

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  customerFindFirst: vi.fn(),
  invoiceFindMany: vi.fn(),
  quoteFindMany: vi.fn(),
  crmNoteFindMany: vi.fn(),
  customerPortalAccessLogFindMany: vi.fn(),
  profileFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    customer: {
      findFirst: mocks.customerFindFirst,
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

// Mock React subcomponents to avoid render issues in page tests
vi.mock("../components/client-detail-shell", () => ({
  ClientDetailShell: ({ clientId, client }: any) => (
    <div data-testid="detail-shell" data-client-id={clientId} data-client-name={client?.name} />
  ),
}));

describe("Sprint 2.2 — Canonical client detail server-side query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgContext.mockResolvedValue({ orgId: "org-123" });
  });

  it("returns null if customer does not exist in org", async () => {
    mocks.customerFindFirst.mockResolvedValue(null);
    const result = await getClientDetail("cust-999");
    expect(result).toBeNull();
    expect(mocks.customerFindFirst).toHaveBeenCalledWith({
      where: { id: "cust-999", organizationId: "org-123" },
      include: expect.any(Object),
    });
  });

  it("returns derived fields correctly for sparse data customer", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "cust-1",
      organizationId: "org-123",
      name: "Sparse Client",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      gstin: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      totalInvoiced: 0,
      totalPaid: 0,
      lifetimeValue: 0,
      lastInteractionAt: null,
      portalTokens: [],
      defaultTagAssignments: [],
      _count: {
        invoices: 0,
        quotes: 0,
        portalAccessLogs: 0,
      },
    });

    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.quoteFindMany.mockResolvedValue([]);
    mocks.crmNoteFindMany.mockResolvedValue([]);
    mocks.customerPortalAccessLogFindMany.mockResolvedValue([]);

    const result = await getClientDetail("cust-1");
    expect(result).not.toBeNull();
    expect(result!.outstandingBalance).toBe(0);
    expect(result!.portalStatus).toBe("ineligible");
    expect(result!.panNumber).toBe("");
    expect(result!.contacts).toEqual([]);
    expect(result!.recentActivity).toEqual([]);
  });

  it("derives portal status to invited if email is present but no active token", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "cust-2",
      organizationId: "org-123",
      name: "Invited Client",
      email: "invited@client.com",
      phone: "+91 99999 88888",
      address: "123 Street",
      taxId: "TAX-123",
      gstin: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      totalInvoiced: 1000,
      totalPaid: 400,
      lifetimeValue: 1000,
      lastInteractionAt: null,
      portalTokens: [
        { id: "tok-1", isRevoked: true, expiresAt: new Date("2027-01-01T00:00:00Z") },
      ],
      defaultTagAssignments: [],
      _count: {
        invoices: 0,
        quotes: 0,
        portalAccessLogs: 0,
      },
    });

    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.quoteFindMany.mockResolvedValue([]);
    mocks.crmNoteFindMany.mockResolvedValue([]);
    mocks.customerPortalAccessLogFindMany.mockResolvedValue([]);

    const result = await getClientDetail("cust-2");
    expect(result!.portalStatus).toBe("invited");
    expect(result!.outstandingBalance).toBe(600);
  });

  it("derives portal status to enabled if valid token exists", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "cust-3",
      organizationId: "org-123",
      name: "Enabled Client",
      email: "enabled@client.com",
      phone: null,
      address: null,
      taxId: null,
      gstin: "27AABCU9603R1ZM",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      totalInvoiced: 5000,
      totalPaid: 5000,
      lifetimeValue: 5000,
      lastInteractionAt: null,
      portalTokens: [
        { id: "tok-2", isRevoked: false, expiresAt: new Date(Date.now() + 100000) },
      ],
      defaultTagAssignments: [],
      _count: {
        invoices: 0,
        quotes: 0,
        portalAccessLogs: 1,
      },
    });

    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.quoteFindMany.mockResolvedValue([]);
    mocks.crmNoteFindMany.mockResolvedValue([]);
    mocks.customerPortalAccessLogFindMany.mockResolvedValue([
      { id: "log-1", accessedAt: new Date("2026-05-20T10:00:00Z"), ip: "192.168.1.1" },
    ]);

    const result = await getClientDetail("cust-3");
    expect(result!.portalStatus).toBe("enabled");
    expect(result!.panNumber).toBe("AABCU9603R");
    expect(result!.portalLastAccessedAt).toBe(new Date("2026-05-20T10:00:00Z").toISOString());
  });

  it("compiles and orders recent activities correctly", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "cust-4",
      organizationId: "org-123",
      name: "Active Client",
      email: "active@client.com",
      phone: null,
      address: null,
      taxId: null,
      gstin: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
      totalInvoiced: 0,
      totalPaid: 0,
      lifetimeValue: 0,
      lastInteractionAt: null,
      portalTokens: [],
      defaultTagAssignments: [],
      _count: {
        invoices: 1,
        quotes: 1,
        portalAccessLogs: 1,
      },
    });

    mocks.invoiceFindMany.mockResolvedValue([
      {
        id: "inv-1",
        invoiceNumber: "INV-001",
        status: "ISSUED",
        totalAmount: 1000,
        invoiceDate: new Date("2026-05-10T00:00:00Z"),
        createdAt: new Date("2026-05-09T00:00:00Z"),
        issuedAt: new Date("2026-05-10T12:00:00Z"),
        paidAt: null,
      },
    ]);
    mocks.quoteFindMany.mockResolvedValue([
      {
        id: "q-1",
        quoteNumber: "QTE-001",
        status: "ACCEPTED",
        totalAmount: 1000,
        issueDate: new Date("2026-05-08T00:00:00Z"),
        createdAt: new Date("2026-05-07T00:00:00Z"),
        acceptedAt: new Date("2026-05-08T15:00:00Z"),
        declinedAt: null,
      },
    ]);
    mocks.crmNoteFindMany.mockResolvedValue([
      { id: "note-1", content: "Client note description", createdAt: new Date("2026-05-11T09:00:00Z") },
    ]);
    mocks.customerPortalAccessLogFindMany.mockResolvedValue([
      { id: "log-1", accessedAt: new Date("2026-05-12T10:00:00Z"), ip: null },
    ]);

    const result = await getClientDetail("cust-4");
    expect(result!.recentActivity.length).toBeGreaterThan(0);
    // Verify sorting desc
    const dates = result!.recentActivity.map((a) => new Date(a.date).getTime());
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });
});

describe("ClientDetailPage Server Component Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireOrgContext.mockResolvedValue({ orgId: "org-123" });
  });

  it("renders page when client exists", async () => {
    mocks.customerFindFirst.mockResolvedValue({
      id: "cust-ok",
      organizationId: "org-123",
      name: "Render Client",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      gstin: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      totalInvoiced: 0,
      totalPaid: 0,
      lifetimeValue: 0,
      lastInteractionAt: null,
      portalTokens: [],
      defaultTagAssignments: [],
      _count: {
        invoices: 0,
        quotes: 0,
        portalAccessLogs: 0,
      },
    });

    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.quoteFindMany.mockResolvedValue([]);
    mocks.crmNoteFindMany.mockResolvedValue([]);
    mocks.customerPortalAccessLogFindMany.mockResolvedValue([]);

    const jsx = await ClientDetailPage({ params: Promise.resolve({ id: "cust-ok" }) });
    expect(jsx).toBeDefined();
    expect(jsx.props.client.name).toBe("Render Client");
  });

  it("throws notFound when client does not exist", async () => {
    mocks.customerFindFirst.mockResolvedValue(null);
    await expect(ClientDetailPage({ params: Promise.resolve({ id: "cust-none" }) })).rejects.toThrow("notFound called");
  });
});
