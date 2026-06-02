import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
  customer: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  invoice: {
    findMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  },
  quote: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("server-only", () => ({}));

const { mockGetPortalSession, mockLogPortalAccess } = vi.hoisted(() => ({
  mockGetPortalSession: vi.fn(),
  mockLogPortalAccess: vi.fn(),
}));

vi.mock("@/lib/portal-auth", () => ({
  getPortalSession: mockGetPortalSession,
  requirePortalSession: vi.fn(),
  logPortalAccess: mockLogPortalAccess,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

import { getPortalDashboardData } from "../actions";

describe("Client Hub Dashboard - getPortalDashboardData server action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("strictly scopes database queries to the authenticated customer and organization (security & isolation)", async () => {
    mockGetPortalSession.mockResolvedValue({
      customerId: "cust_123",
      orgId: "org_123",
      orgSlug: "test-org",
    });

    mockDb.organization.findUnique.mockResolvedValue({ id: "org_123" });
    mockDb.customer.findFirst.mockResolvedValue({
      id: "cust_123",
      name: "Hadi Azeez",
      email: "hadi@example.com",
      phone: null,
    });
    mockDb.invoice.count.mockResolvedValue(0);
    mockDb.invoice.aggregate.mockResolvedValue({ _sum: { remainingAmount: null, amountPaid: null } });
    mockDb.invoice.findMany.mockResolvedValue([]);
    mockDb.quote.count.mockResolvedValue(0);
    mockDb.quote.findMany.mockResolvedValue([]);

    const result = await getPortalDashboardData("test-org");

    expect(mockDb.organization.findUnique).toHaveBeenCalledWith({
      where: { slug: "test-org" },
      select: { id: true },
    });

    expect(mockDb.customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: "cust_123",
        organizationId: "org_123",
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
      },
    });

    expect(mockDb.invoice.count).toHaveBeenCalledWith({
      where: {
        organizationId: "org_123",
        customerId: "cust_123",
        status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
      },
    });

    expect(mockDb.invoice.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_123",
        customerId: "cust_123",
        status: { notIn: ["DRAFT", "CANCELLED", "PAID"] },
      },
      orderBy: [
        { invoiceDate: "desc" },
        { createdAt: "desc" },
      ],
      take: 5,
      select: expect.any(Object),
    });

    expect(mockDb.quote.count).toHaveBeenCalledWith({
      where: {
        orgId: "org_123",
        customerId: "cust_123",
        status: "SENT",
        validUntil: { gte: expect.any(Date) },
      },
    });

    expect(mockDb.quote.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_123",
        customerId: "cust_123",
        status: "SENT",
        validUntil: { gte: expect.any(Date) },
      },
      orderBy: [
        { validUntil: "asc" },
        { createdAt: "desc" },
      ],
      take: 5,
      select: expect.any(Object),
    });

    expect(result.customer.name).toBe("Hadi Azeez");
    expect(mockLogPortalAccess).toHaveBeenCalledWith({
      orgId: "org_123",
      customerId: "cust_123",
      path: "/portal/test-org/client-hub",
      action: "view_dashboard",
    });
  });

  it("truthfully computes outstanding balance and total paid using aggregate count/sum calls", async () => {
    mockGetPortalSession.mockResolvedValue({
      customerId: "cust_123",
      orgId: "org_123",
      orgSlug: "test-org",
    });
    mockDb.organization.findUnique.mockResolvedValue({ id: "org_123" });
    mockDb.customer.findFirst.mockResolvedValue({ id: "cust_123", name: "Hadi" });

    // Mock aggregates
    mockDb.invoice.count.mockResolvedValue(2);
    mockDb.invoice.aggregate.mockImplementation(async (args: any) => {
      // Outstanding balance query filters out PAID/CANCELLED
      if (args.where.status.notIn.includes("PAID")) {
        return { _sum: { remainingAmount: 3800 } };
      }
      // Total paid query filters out CANCELLED but keeps PAID
      return { _sum: { amountPaid: 2200 } };
    });

    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_2",
        invoiceNumber: "INV-002",
        invoiceDate: new Date("2025-10-05"),
        dueDate: new Date("2025-10-20"),
        totalAmount: 2000,
        amountPaid: 0,
        remainingAmount: 2000,
        status: "DUE",
      },
      {
        id: "inv_3",
        invoiceNumber: "INV-003",
        invoiceDate: new Date("2025-10-10"),
        dueDate: new Date("2025-10-25"),
        totalAmount: 3000,
        amountPaid: 1200,
        remainingAmount: 1800,
        status: "PARTIALLY_PAID",
      },
    ]);

    mockDb.quote.count.mockResolvedValue(0);
    mockDb.quote.findMany.mockResolvedValue([]);

    const result = await getPortalDashboardData("test-org");

    expect(result.outstandingBalance).toBe(3800);
    expect(result.totalPaid).toBe(2200);
    expect(result.pendingInvoicesCount).toBe(2);
    expect(result.pendingInvoices.length).toBe(2);
  });

  it("limits dashboard pending display lists to exactly 5 items (bounded dashboard slice)", async () => {
    mockGetPortalSession.mockResolvedValue({
      customerId: "cust_123",
      orgId: "org_123",
      orgSlug: "test-org",
    });
    mockDb.organization.findUnique.mockResolvedValue({ id: "org_123" });
    mockDb.customer.findFirst.mockResolvedValue({ id: "cust_123", name: "Hadi" });

    // Mock count is 10, but DB findMany will only return 5 due to take: 5 constraint
    mockDb.invoice.count.mockResolvedValue(10);
    mockDb.invoice.aggregate.mockResolvedValue({ _sum: { remainingAmount: 15000, amountPaid: 5000 } });
    
    const fiveMockInvoices = Array.from({ length: 5 }, (_, i) => ({
      id: `inv_${i}`,
      invoiceNumber: `INV-00${i}`,
      invoiceDate: new Date(),
      dueDate: new Date(),
      totalAmount: 3000,
      amountPaid: 1000,
      remainingAmount: 2000,
      status: "DUE",
    }));
    mockDb.invoice.findMany.mockResolvedValue(fiveMockInvoices);

    mockDb.quote.count.mockResolvedValue(12);
    const fiveMockQuotes = Array.from({ length: 5 }, (_, i) => ({
      id: `q_${i}`,
      quoteNumber: `QT-00${i}`,
      title: `Quote ${i}`,
      status: "SENT",
      issueDate: new Date(),
      validUntil: new Date(),
      totalAmount: 1000,
    }));
    mockDb.quote.findMany.mockResolvedValue(fiveMockQuotes);

    const result = await getPortalDashboardData("test-org");

    // The display slices must contain exactly 5 elements (bounded/take: 5)
    expect(result.pendingInvoices.length).toBe(5);
    expect(result.pendingQuotes.length).toBe(5);

    // But the summary counts must return the full scope count truthfully (10 and 12)
    expect(result.pendingInvoicesCount).toBe(10);
    expect(result.pendingQuotesCount).toBe(12);
  });

  it("handles zero/empty states truthfully when there are no records", async () => {
    mockGetPortalSession.mockResolvedValue({
      customerId: "cust_123",
      orgId: "org_123",
      orgSlug: "test-org",
    });
    mockDb.organization.findUnique.mockResolvedValue({ id: "org_123" });
    mockDb.customer.findFirst.mockResolvedValue({ id: "cust_123", name: "Hadi" });
    mockDb.invoice.count.mockResolvedValue(0);
    mockDb.invoice.aggregate.mockResolvedValue({ _sum: { remainingAmount: null, amountPaid: null } });
    mockDb.invoice.findMany.mockResolvedValue([]);
    mockDb.quote.count.mockResolvedValue(0);
    mockDb.quote.findMany.mockResolvedValue([]);

    const result = await getPortalDashboardData("test-org");

    expect(result.outstandingBalance).toBe(0);
    expect(result.totalPaid).toBe(0);
    expect(result.pendingInvoicesCount).toBe(0);
    expect(result.pendingQuotesCount).toBe(0);
    expect(result.pendingInvoices).toEqual([]);
    expect(result.pendingQuotes).toEqual([]);
  });
});
