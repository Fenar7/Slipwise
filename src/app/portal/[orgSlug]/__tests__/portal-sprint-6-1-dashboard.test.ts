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
  },
  quote: {
    findMany: vi.fn(),
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
    mockDb.invoice.findMany.mockResolvedValue([]);
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

    expect(mockDb.invoice.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: "org_123",
        customerId: "cust_123",
        status: { not: "DRAFT" },
      },
      orderBy: { invoiceDate: "desc" },
      select: expect.any(Object),
    });

    expect(mockDb.quote.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "org_123",
        customerId: "cust_123",
        status: { not: "DRAFT" },
      },
      orderBy: { createdAt: "desc" },
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

  it("truthfully computes outstanding balance and total paid from real database records", async () => {
    mockGetPortalSession.mockResolvedValue({
      customerId: "cust_123",
      orgId: "org_123",
      orgSlug: "test-org",
    });
    mockDb.organization.findUnique.mockResolvedValue({ id: "org_123" });
    mockDb.customer.findFirst.mockResolvedValue({ id: "cust_123", name: "Hadi" });

    // Mock invoices: 1 paid, 1 unpaid, 1 partially paid, 1 cancelled
    mockDb.invoice.findMany.mockResolvedValue([
      {
        id: "inv_1",
        invoiceNumber: "INV-001",
        invoiceDate: new Date("2025-10-01"),
        dueDate: new Date("2025-10-15"),
        totalAmount: 1000,
        amountPaid: 1000,
        remainingAmount: 0,
        status: "PAID",
      },
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
      {
        id: "inv_4",
        invoiceNumber: "INV-004",
        invoiceDate: new Date("2025-10-12"),
        dueDate: new Date("2025-10-27"),
        totalAmount: 1500,
        amountPaid: 0,
        remainingAmount: 1500,
        status: "CANCELLED",
      },
    ]);
    mockDb.quote.findMany.mockResolvedValue([]);

    const result = await getPortalDashboardData("test-org");

    // Outstanding balance should sum remainingAmount of non-paid, non-cancelled: INV-002 (2000) + INV-003 (1800) = 3800
    expect(result.outstandingBalance).toBe(3800);

    // Total paid should sum amountPaid of non-cancelled: INV-001 (1000) + INV-002 (0) + INV-003 (1200) = 2200
    expect(result.totalPaid).toBe(2200);

    // Pending invoices list should exclude PAID and CANCELLED
    expect(result.pendingInvoices.length).toBe(2);
    expect(result.pendingInvoices[0].id).toBe("inv_2");
    expect(result.pendingInvoices[1].id).toBe("inv_3");
  });

  it("handles zero/empty states truthfully when there are no records", async () => {
    mockGetPortalSession.mockResolvedValue({
      customerId: "cust_123",
      orgId: "org_123",
      orgSlug: "test-org",
    });
    mockDb.organization.findUnique.mockResolvedValue({ id: "org_123" });
    mockDb.customer.findFirst.mockResolvedValue({ id: "cust_123", name: "Hadi" });
    mockDb.invoice.findMany.mockResolvedValue([]);
    mockDb.quote.findMany.mockResolvedValue([]);

    const result = await getPortalDashboardData("test-org");

    expect(result.outstandingBalance).toBe(0);
    expect(result.totalPaid).toBe(0);
    expect(result.pendingInvoices).toEqual([]);
    expect(result.pendingQuotes).toEqual([]);
  });

  it("filters quotes to only SENT and unexpired proposals (truthful pending quotes)", async () => {
    mockGetPortalSession.mockResolvedValue({
      customerId: "cust_123",
      orgId: "org_123",
      orgSlug: "test-org",
    });
    mockDb.organization.findUnique.mockResolvedValue({ id: "org_123" });
    mockDb.customer.findFirst.mockResolvedValue({ id: "cust_123", name: "Hadi" });
    mockDb.invoice.findMany.mockResolvedValue([]);

    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);

    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 5);

    mockDb.quote.findMany.mockResolvedValue([
      {
        id: "q_1",
        quoteNumber: "QT-001",
        title: "Sent & Active",
        status: "SENT",
        issueDate: new Date(),
        validUntil: farFuture,
        totalAmount: 1500,
      },
      {
        id: "q_2",
        quoteNumber: "QT-002",
        title: "Sent & Expired",
        status: "SENT",
        issueDate: new Date(),
        validUntil: pastDate,
        totalAmount: 2000,
      },
      {
        id: "q_3",
        quoteNumber: "QT-003",
        title: "Draft quote (internal)",
        status: "DRAFT",
        issueDate: new Date(),
        validUntil: farFuture,
        totalAmount: 1000,
      },
      {
        id: "q_4",
        quoteNumber: "QT-004",
        title: "Accepted Proposal",
        status: "ACCEPTED",
        issueDate: new Date(),
        validUntil: farFuture,
        totalAmount: 3000,
      },
    ]);

    const result = await getPortalDashboardData("test-org");

    expect(result.pendingQuotes.length).toBe(1);
    expect(result.pendingQuotes[0].id).toBe("q_1");
  });
});
