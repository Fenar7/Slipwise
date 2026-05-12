import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  voucherFindMany: vi.fn(),
  voucherCount: vi.fn(),
  voucherAggregate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    voucher: {
      findMany: mocks.voucherFindMany,
      count: mocks.voucherCount,
      aggregate: mocks.voucherAggregate,
    },
  },
}));

import { getVoucherReport, exportVoucherReportCSV } from "../actions";

const ORG_ID = "org_test";
const CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

function makeVoucher(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "vc_1",
    voucherNumber: overrides.voucherNumber ?? "VC-001",
    type: overrides.type ?? "payment",
    voucherDate: overrides.voucherDate ?? "2025-01-15",
    vendorId: overrides.vendorId ?? "ven_1",
    vendor: { name: overrides.vendorName ?? "Office Supplies Inc" },
    lines: overrides.lines ?? [{ category: "Office Expenses" }],
    totalAmount: overrides.totalAmount ?? 5000,
    status: overrides.status ?? "approved",
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

function makeAggregate(sum: number | null, count: number) {
  return { _sum: { totalAmount: sum }, _count: count };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.voucherFindMany.mockResolvedValue([]);
  mocks.voucherCount.mockResolvedValue(0);
  mocks.voucherAggregate.mockResolvedValue(makeAggregate(null, 0));
});

describe("getVoucherReport", () => {
  it("returns paginated results with summary", async () => {
    mocks.voucherFindMany.mockResolvedValue([makeVoucher()]);
    mocks.voucherCount.mockResolvedValue(1);
    mocks.voucherAggregate
      .mockResolvedValueOnce(makeAggregate(5000, 1))
      .mockResolvedValueOnce(makeAggregate(0, 0));

    const result = await getVoucherReport({ page: 1 });

    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.summaryPayments).toBe(5000);
    expect(result.summaryPaymentCount).toBe(1);
    expect(result.summaryReceipts).toBe(0);
    expect(result.summaryReceiptCount).toBe(0);
  });

  it("includes tags in row data", async () => {
    mocks.voucherFindMany.mockResolvedValue([
      makeVoucher({
        tagAssignments: [
          makeTagAssignment("tag_1", "Operations", "operations", "#FF0000"),
          makeTagAssignment("tag_2", "Q1", "q1", "#0000FF"),
        ],
      }),
    ]);
    mocks.voucherCount.mockResolvedValue(1);

    const result = await getVoucherReport({ page: 1 });

    expect(result.rows[0].tags).toBe("Operations, Q1");
  });

  it("shows em dash for no tags", async () => {
    mocks.voucherFindMany.mockResolvedValue([makeVoucher({ tagAssignments: [] })]);
    mocks.voucherCount.mockResolvedValue(1);

    const result = await getVoucherReport({ page: 1 });

    expect(result.rows[0].tags).toBe("—");
  });

  it("filters by tagIds with match-any semantics", async () => {
    mocks.voucherFindMany.mockResolvedValue([]);
    mocks.voucherCount.mockResolvedValue(0);

    await getVoucherReport({ tagIds: ["tag_1", "tag_2"], page: 1 });

    expect(mocks.voucherFindMany).toHaveBeenCalledWith(
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
    mocks.voucherFindMany.mockResolvedValue([]);
    mocks.voucherCount.mockResolvedValue(0);

    await getVoucherReport({ tagIds: [], page: 1 });

    const callArg = mocks.voucherFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("tagAssignments");
  });

  it("does not apply tag filter when tagIds is undefined", async () => {
    mocks.voucherFindMany.mockResolvedValue([]);
    mocks.voucherCount.mockResolvedValue(0);

    await getVoucherReport({ page: 1 });

    const callArg = mocks.voucherFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("tagAssignments");
  });

  it("combines tag filter with type filter", async () => {
    mocks.voucherFindMany.mockResolvedValue([]);
    mocks.voucherCount.mockResolvedValue(0);

    await getVoucherReport({
      tagIds: ["tag_1"],
      type: "payment",
      page: 1,
    });

    const callArg = mocks.voucherFindMany.mock.calls[0][0];
    expect(callArg.where.tagAssignments).toEqual({
      some: { tagId: { in: ["tag_1"] } },
    });
    expect(callArg.where.type).toBe("payment");
  });

  it("includes tagAssignments with tag data in Prisma include", async () => {
    mocks.voucherFindMany.mockResolvedValue([]);
    mocks.voucherCount.mockResolvedValue(0);

    await getVoucherReport({ page: 1 });

    expect(mocks.voucherFindMany).toHaveBeenCalledWith(
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

  it("tag filter is included in aggregate queries", async () => {
    mocks.voucherFindMany.mockResolvedValue([]);
    mocks.voucherCount.mockResolvedValue(0);
    mocks.voucherAggregate.mockResolvedValue(makeAggregate(null, 0));

    await getVoucherReport({ tagIds: ["tag_1"], page: 1 });

    const paymentAggCall = mocks.voucherAggregate.mock.calls[0][0];
    const receiptAggCall = mocks.voucherAggregate.mock.calls[1][0];

    expect(paymentAggCall.where.tagAssignments).toEqual({
      some: { tagId: { in: ["tag_1"] } },
    });
    expect(receiptAggCall.where.tagAssignments).toEqual({
      some: { tagId: { in: ["tag_1"] } },
    });
  });
});

describe("exportVoucherReportCSV", () => {
  it("includes Tags column in CSV headers", async () => {
    mocks.voucherFindMany.mockResolvedValue([makeVoucher()]);
    mocks.voucherCount.mockResolvedValue(1);

    const csv = await exportVoucherReportCSV({});

    expect(csv).toContain("Tags");
  });

  it("includes tag values in CSV rows", async () => {
    mocks.voucherFindMany.mockResolvedValue([
      makeVoucher({
        tagAssignments: [makeTagAssignment("tag_1", "Operations", "operations")],
      }),
    ]);
    mocks.voucherCount.mockResolvedValue(1);

    const csv = await exportVoucherReportCSV({});
    const lines = csv.split("\n");

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[1]).toContain("Operations");
  });

  it("passes tagIds filter during export", async () => {
    mocks.voucherFindMany.mockResolvedValue([]);
    mocks.voucherCount.mockResolvedValue(0);

    await exportVoucherReportCSV({ tagIds: ["tag_1"] });

    expect(mocks.voucherFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tagAssignments: {
            some: { tagId: { in: ["tag_1"] } },
          },
        }),
      })
    );
  });
});
