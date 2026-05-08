import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceCount: vi.fn(),
  invoiceAggregate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    invoice: {
      findMany: mocks.invoiceFindMany,
      count: mocks.invoiceCount,
      aggregate: mocks.invoiceAggregate,
    },
  },
}));

import { getInvoiceReport, exportInvoiceReportCSV } from "../actions";

const ORG_ID = "org_test";
const CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "inv_1",
    invoiceNumber: overrides.invoiceNumber ?? "INV-001",
    customerId: overrides.customerId ?? "cust_1",
    customer: { id: "cust_1", name: overrides.customerName ?? "Acme Corp" },
    status: overrides.status ?? "ISSUED",
    invoiceDate: overrides.invoiceDate ?? "2025-01-15",
    dueDate: overrides.dueDate ?? "2025-02-15",
    totalAmount: overrides.totalAmount ?? 10000,
    payments: overrides.payments ?? [{ amount: 5000 }],
    tagAssignments: overrides.tagAssignments ?? [],
    archivedAt: null,
    organizationId: ORG_ID,
    createdAt: new Date("2025-01-01").toISOString(),
  };
}

function makeTagAssignment(tagId: string, tagName: string, tagSlug: string, color?: string) {
  return {
    tag: { id: tagId, name: tagName, slug: tagSlug, color: color ?? null, isArchived: false },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.invoiceFindMany.mockResolvedValue([]);
  mocks.invoiceCount.mockResolvedValue(0);
  mocks.invoiceAggregate.mockResolvedValue({ _sum: { totalAmount: null } });
});

describe("getInvoiceReport", () => {
  it("returns paginated results with default sort", async () => {
    mocks.invoiceFindMany.mockResolvedValue([makeInvoice()]);
    mocks.invoiceCount.mockResolvedValue(1);

    const result = await getInvoiceReport({ page: 1 });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
  });

  it("includes tags in row data", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      makeInvoice({
        tagAssignments: [
          makeTagAssignment("tag_1", "Priority", "priority", "#FF0000"),
          makeTagAssignment("tag_2", "VIP", "vip", "#00FF00"),
        ],
      }),
    ]);
    mocks.invoiceCount.mockResolvedValue(1);

    const result = await getInvoiceReport({ page: 1 });

    expect(result.rows[0].tags).toBe("Priority, VIP");
  });

  it("shows em dash for no tags", async () => {
    mocks.invoiceFindMany.mockResolvedValue([makeInvoice({ tagAssignments: [] })]);
    mocks.invoiceCount.mockResolvedValue(1);

    const result = await getInvoiceReport({ page: 1 });

    expect(result.rows[0].tags).toBe("—");
  });

  it("filters by tagIds with match-any semantics", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);

    await getInvoiceReport({ tagIds: ["tag_1", "tag_2"], page: 1 });

    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tagAssignments: {
            some: { tagId: { in: ["tag_1", "tag_2"] } },
          },
        }),
      })
    );
  });

  it("does not apply tag filter when tagIds is empty", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);

    await getInvoiceReport({ tagIds: [], page: 1 });

    const callArg = mocks.invoiceFindMany.mock.calls[0][0];
    expect(callArg.where.tagAssignments).toBeUndefined();
  });

  it("does not apply tag filter when tagIds is undefined", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);

    await getInvoiceReport({ page: 1 });

    const callArg = mocks.invoiceFindMany.mock.calls[0][0];
    expect(callArg.where.tagAssignments).toBeUndefined();
  });

  it("combines tag filter with other filters", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);

    await getInvoiceReport({
      tagIds: ["tag_1"],
      status: ["PAID"],
      dateFrom: "2025-01-01",
      page: 1,
    });

    const callArg = mocks.invoiceFindMany.mock.calls[0][0];
    expect(callArg.where.tagAssignments).toEqual({
      some: { tagId: { in: ["tag_1"] } },
    });
    expect(callArg.where.status).toEqual({ in: ["PAID"] });
  });

  it("includes tagAssignments with tag data in Prisma include", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);

    await getInvoiceReport({ page: 1 });

    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          tagAssignments: {
            include: {
              tag: {
                select: { id: true, name: true, slug: true, color: true, isArchived: true },
              },
            },
          },
        }),
      })
    );
  });

  it("returns server-side totalAmount aggregate", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);
    mocks.invoiceAggregate.mockResolvedValue({ _sum: { totalAmount: 150000 } });

    const result = await getInvoiceReport({ page: 1 });

    expect(result.totalAmount).toBe(150000);
  });

  it("returns 0 for totalAmount when aggregate is null", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);
    mocks.invoiceAggregate.mockResolvedValue({ _sum: { totalAmount: null } });

    const result = await getInvoiceReport({ page: 1 });

    expect(result.totalAmount).toBe(0);
  });

  it("passes orgId to all queries", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);
    mocks.invoiceAggregate.mockResolvedValue({ _sum: { totalAmount: null } });

    await getInvoiceReport({ page: 1 });

    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
      })
    );
    expect(mocks.invoiceCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
      })
    );
    expect(mocks.invoiceAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: ORG_ID }),
      })
    );
  });
});

describe("exportInvoiceReportCSV", () => {
  it("includes Tags column in CSV headers", async () => {
    mocks.invoiceFindMany.mockResolvedValue([makeInvoice()]);
    mocks.invoiceCount.mockResolvedValue(1);

    const csv = await exportInvoiceReportCSV({});

    expect(csv).toContain("Tags");
  });

  it("includes tag values in CSV rows", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      makeInvoice({
        tagAssignments: [makeTagAssignment("tag_1", "Priority", "priority")],
      }),
    ]);
    mocks.invoiceCount.mockResolvedValue(1);

    const csv = await exportInvoiceReportCSV({});
    const lines = csv.split("\n");

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toContain("Priority");
  });

  it("passes tagIds filter to getInvoiceReport during export", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceCount.mockResolvedValue(0);

    await exportInvoiceReportCSV({ tagIds: ["tag_1"] });

    expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tagAssignments: {
            some: { tagId: { in: ["tag_1"] } },
          },
        }),
      })
    );
  });

  it("paginates through all results", async () => {
    mocks.invoiceFindMany.mockResolvedValueOnce([makeInvoice({ id: "inv_1" })]);
    mocks.invoiceFindMany.mockResolvedValueOnce([makeInvoice({ id: "inv_2" })]);
    mocks.invoiceFindMany.mockResolvedValueOnce([]);
    mocks.invoiceCount
      .mockResolvedValueOnce(101)
      .mockResolvedValueOnce(101)
      .mockResolvedValueOnce(101);

    const csv = await exportInvoiceReportCSV({});

    expect(mocks.invoiceFindMany).toHaveBeenCalledTimes(3);
    const lines = csv.split("\n");
    expect(lines.length).toBe(3); // header + 2 data rows
  });
});
