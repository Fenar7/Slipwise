import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceAggregate: vi.fn(),
  voucherFindMany: vi.fn(),
  voucherAggregate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    invoice: {
      findMany: mocks.invoiceFindMany,
      aggregate: mocks.invoiceAggregate,
    },
    voucher: {
      findMany: mocks.voucherFindMany,
      aggregate: mocks.voucherAggregate,
    },
  },
}));

import { getTagAnalytics } from "../actions";

const ORG_ID = "org_test";
const CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

function makeTaggedInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "inv_1",
    totalAmount: overrides.totalAmount ?? 10000,
    invoiceDate: overrides.invoiceDate ?? "2025-01-15",
    tagAssignments: overrides.tagAssignments ?? [
      { tagId: "tag_1", tag: { id: "tag_1", name: "Priority", slug: "priority", color: "#FF0000" } },
    ],
  };
}

function makeTaggedVoucher(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "vc_1",
    totalAmount: overrides.totalAmount ?? 5000,
    voucherDate: overrides.voucherDate ?? "2025-01-15",
    tagAssignments: overrides.tagAssignments ?? [
      { tagId: "tag_1", tag: { id: "tag_1", name: "Priority", slug: "priority", color: "#FF0000" } },
    ],
  };
}

function makeAgg(overrides: { sum?: number | null; count?: number } = {}) {
  return {
    _sum: { totalAmount: overrides.sum ?? null },
    _count: overrides.count ?? 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.invoiceFindMany.mockResolvedValue([]);
  mocks.invoiceAggregate.mockResolvedValue(makeAgg());
  mocks.voucherFindMany.mockResolvedValue([]);
  mocks.voucherAggregate.mockResolvedValue(makeAgg());
});

describe("getTagAnalytics", () => {
  // ── Mode-aware sorting (Fix #2) ──

  describe("leaderboard sorting", () => {
    it("revenue mode sorts by invoiceTotal only", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({
          id: "inv_1", totalAmount: 5000,
          tagAssignments: [{ tagId: "tag_a", tag: { id: "tag_a", name: "Alpha", slug: "a", color: null } }],
        }),
        makeTaggedInvoice({
          id: "inv_2", totalAmount: 15000,
          tagAssignments: [{ tagId: "tag_b", tag: { id: "tag_b", name: "Beta", slug: "b", color: null } }],
        }),
      ]);
      mocks.invoiceAggregate.mockResolvedValue(makeAgg({ sum: 20000, count: 2 }));

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.topTags[0].tagName).toBe("Beta");
      expect(result.topTags[0].invoiceTotal).toBe(15000);
      expect(result.topTags[1].tagName).toBe("Alpha");
      expect(result.topTags[1].invoiceTotal).toBe(5000);
    });

    it("expense mode sorts by voucherTotal only", async () => {
      mocks.voucherFindMany.mockResolvedValue([
        makeTaggedVoucher({
          id: "vc_1", totalAmount: 3000,
          tagAssignments: [{ tagId: "tag_c", tag: { id: "tag_c", name: "Charlie", slug: "c", color: null } }],
        }),
        makeTaggedVoucher({
          id: "vc_2", totalAmount: 12000,
          tagAssignments: [{ tagId: "tag_d", tag: { id: "tag_d", name: "Delta", slug: "d", color: null } }],
        }),
      ]);
      mocks.voucherAggregate.mockResolvedValue(makeAgg({ sum: 15000, count: 2 }));

      const result = await getTagAnalytics({ mode: "expense" });

      expect(result.topTags[0].tagName).toBe("Delta");
      expect(result.topTags[0].voucherTotal).toBe(12000);
      expect(result.topTags[1].tagName).toBe("Charlie");
      expect(result.topTags[1].voucherTotal).toBe(3000);
    });

    it("combined mode sorts by invoiceTotal + voucherTotal", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({
          id: "inv_1", totalAmount: 5000,
          tagAssignments: [{ tagId: "tag_e", tag: { id: "tag_e", name: "Echo", slug: "e", color: null } }],
        }),
      ]);
      mocks.voucherFindMany.mockResolvedValue([
        makeTaggedVoucher({
          id: "vc_1", totalAmount: 20000,
          tagAssignments: [{ tagId: "tag_f", tag: { id: "tag_f", name: "Foxtrot", slug: "f", color: null } }],
        }),
      ]);
      mocks.invoiceAggregate.mockResolvedValue(makeAgg({ sum: 5000, count: 1 }));
      mocks.voucherAggregate.mockResolvedValue(makeAgg({ sum: 20000, count: 1 }));

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.topTags[0].tagName).toBe("Foxtrot");
      expect(result.topTags[0].voucherTotal).toBe(20000);
      expect(result.topTags[1].tagName).toBe("Echo");
      expect(result.topTags[1].invoiceTotal).toBe(5000);
    });
  });

  // ── Summary correctness (Fix #1) ──

  describe("summary totals", () => {
    it("includes overall invoice totals from aggregate query", async () => {
      mocks.invoiceAggregate.mockResolvedValue(makeAgg({ sum: 150000, count: 42 }));
      mocks.invoiceFindMany.mockResolvedValue([]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.summary.totalInvoiceValue).toBe(150000);
      expect(result.summary.totalInvoiceCount).toBe(42);
      expect(result.summary.totalDocumentCount).toBe(42);
    });

    it("includes overall voucher totals from aggregate query", async () => {
      mocks.voucherAggregate.mockResolvedValue(makeAgg({ sum: 75000, count: 18 }));
      mocks.voucherFindMany.mockResolvedValue([]);

      const result = await getTagAnalytics({ mode: "expense" });

      expect(result.summary.totalVoucherValue).toBe(75000);
      expect(result.summary.totalVoucherCount).toBe(18);
      expect(result.summary.totalDocumentCount).toBe(18);
    });

    it("combines invoice and voucher counts in combined mode", async () => {
      mocks.invoiceAggregate.mockResolvedValue(makeAgg({ sum: 100000, count: 10 }));
      mocks.voucherAggregate.mockResolvedValue(makeAgg({ sum: 50000, count: 15 }));
      mocks.invoiceFindMany.mockResolvedValue([]);
      mocks.voucherFindMany.mockResolvedValue([]);

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.summary.totalInvoiceValue).toBe(100000);
      expect(result.summary.totalVoucherValue).toBe(50000);
      expect(result.summary.totalDocumentCount).toBe(25);
    });

    it("summary totals are correct even when leaderboard is truncated", async () => {
      // 30 tags, leaderboard only shows 20
      const invoices = Array.from({ length: 30 }, (_, i) =>
        makeTaggedInvoice({
          id: `inv_${i}`,
          totalAmount: (30 - i) * 1000,
          tagAssignments: [
            { tagId: `tag_${i}`, tag: { id: `tag_${i}`, name: `Tag ${i}`, slug: `tag-${i}`, color: null } },
          ],
        })
      );
      mocks.invoiceFindMany.mockResolvedValue(invoices);
      // Full dataset total: sum of (30-i)*1000 for i=0..29 = sum of k*1000 for k=1..30 = 1000 * 30*31/2 = 465000
      mocks.invoiceAggregate.mockResolvedValue(makeAgg({ sum: 465000, count: 30 }));

      const result = await getTagAnalytics({ mode: "revenue" });

      // Leaderboard truncated
      expect(result.topTags.length).toBeLessThanOrEqual(20);
      // Summary uses aggregate, not truncated leaderboard
      expect(result.summary.totalInvoiceValue).toBe(465000);
      expect(result.summary.totalInvoiceCount).toBe(30);
      expect(result.summary.totalDocumentCount).toBe(30);
    });

    it("summary handles null aggregate values as zero", async () => {
      mocks.invoiceAggregate.mockResolvedValue(makeAgg({ sum: null, count: 0 }));
      mocks.invoiceFindMany.mockResolvedValue([]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.summary.totalInvoiceValue).toBe(0);
      expect(result.summary.totalInvoiceCount).toBe(0);
    });
  });

  // ── Existing behavior preserved ──

  describe("revenue mode", () => {
    it("queries only invoices, not vouchers", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "revenue" });

      expect(mocks.invoiceFindMany).toHaveBeenCalled();
      expect(mocks.voucherFindMany).not.toHaveBeenCalled();
      expect(mocks.invoiceAggregate).toHaveBeenCalled();
      expect(mocks.voucherAggregate).not.toHaveBeenCalled();
    });

    it("aggregates invoice totals by tag", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({ id: "inv_1", totalAmount: 10000 }),
        makeTaggedInvoice({ id: "inv_2", totalAmount: 20000 }),
      ]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.topTags).toHaveLength(1);
      expect(result.topTags[0].tagId).toBe("tag_1");
      expect(result.topTags[0].invoiceTotal).toBe(30000);
      expect(result.topTags[0].invoiceCount).toBe(2);
      expect(result.topTags[0].voucherTotal).toBe(0);
    });
  });

  describe("expense mode", () => {
    it("queries only vouchers, not invoices", async () => {
      mocks.voucherFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "expense" });

      expect(mocks.voucherFindMany).toHaveBeenCalled();
      expect(mocks.invoiceFindMany).not.toHaveBeenCalled();
      expect(mocks.voucherAggregate).toHaveBeenCalled();
      expect(mocks.invoiceAggregate).not.toHaveBeenCalled();
    });

    it("aggregates voucher totals by tag", async () => {
      mocks.voucherFindMany.mockResolvedValue([
        makeTaggedVoucher({ id: "vc_1", totalAmount: 3000 }),
        makeTaggedVoucher({ id: "vc_2", totalAmount: 4000 }),
      ]);

      const result = await getTagAnalytics({ mode: "expense" });

      expect(result.topTags).toHaveLength(1);
      expect(result.topTags[0].voucherTotal).toBe(7000);
      expect(result.topTags[0].voucherCount).toBe(2);
      expect(result.topTags[0].invoiceTotal).toBe(0);
    });
  });

  describe("combined mode", () => {
    it("queries both invoices and vouchers", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);
      mocks.voucherFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "combined" });

      expect(mocks.invoiceFindMany).toHaveBeenCalled();
      expect(mocks.voucherFindMany).toHaveBeenCalled();
    });

    it("merges invoice and voucher totals for the same tag", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({ id: "inv_1", totalAmount: 10000 }),
      ]);
      mocks.voucherFindMany.mockResolvedValue([
        makeTaggedVoucher({ id: "vc_1", totalAmount: 5000 }),
      ]);

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.topTags).toHaveLength(1);
      expect(result.topTags[0].invoiceTotal).toBe(10000);
      expect(result.topTags[0].voucherTotal).toBe(5000);
      expect(result.topTags[0].activityCount).toBe(2);
    });

    it("handles multi-tag attribution correctly", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({
          id: "inv_1",
          totalAmount: 10000,
          tagAssignments: [
            { tagId: "tag_x", tag: { id: "tag_x", name: "XRay", slug: "x", color: null } },
            { tagId: "tag_y", tag: { id: "tag_y", name: "Yankee", slug: "y", color: null } },
          ],
        }),
      ]);

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.topTags).toHaveLength(2);
      const x = result.topTags.find((t) => t.tagName === "XRay")!;
      const y = result.topTags.find((t) => t.tagName === "Yankee")!;
      expect(x.invoiceTotal).toBe(10000);
      expect(y.invoiceTotal).toBe(10000);
      expect(x.invoiceCount).toBe(1);
      expect(y.invoiceCount).toBe(1);
    });
  });

  describe("date range", () => {
    it("applies dateFrom and dateTo to invoice query and aggregate", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);

      await getTagAnalytics({
        mode: "revenue",
        dateFrom: "2025-01-01",
        dateTo: "2025-03-31",
      });

      const whereArg = { invoiceDate: { gte: "2025-01-01", lte: "2025-03-31" } };
      expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining(whereArg) })
      );
      expect(mocks.invoiceAggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining(whereArg) })
      );
    });

    it("applies dateFrom without dateTo", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "revenue", dateFrom: "2025-01-01" });

      expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ invoiceDate: { gte: "2025-01-01" } }),
        })
      );
    });
  });

  describe("monthly trend", () => {
    it("buckets by month correctly", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({ id: "inv_1", invoiceDate: "2025-01-15", totalAmount: 10000 }),
        makeTaggedInvoice({ id: "inv_2", invoiceDate: "2025-02-20", totalAmount: 15000 }),
        makeTaggedInvoice({ id: "inv_3", invoiceDate: "2025-01-10", totalAmount: 5000 }),
      ]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.monthlyTrend).toHaveLength(2);
      const jan = result.monthlyTrend.find((m) => m.month === "2025-01")!;
      const feb = result.monthlyTrend.find((m) => m.month === "2025-02")!;
      expect(jan.invoiceTotal).toBe(15000);
      expect(feb.invoiceTotal).toBe(15000);
    });

    it("sorts months chronologically", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({ id: "inv_1", invoiceDate: "2025-03-01", totalAmount: 10000 }),
        makeTaggedInvoice({ id: "inv_2", invoiceDate: "2025-01-01", totalAmount: 10000 }),
        makeTaggedInvoice({ id: "inv_3", invoiceDate: "2025-02-01", totalAmount: 10000 }),
      ]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.monthlyTrend.map((m) => m.month)).toEqual([
        "2025-01",
        "2025-02",
        "2025-03",
      ]);
    });
  });

  describe("empty states", () => {
    it("returns empty arrays and zero summary when no tagged documents exist", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);
      mocks.voucherFindMany.mockResolvedValue([]);

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.topTags).toEqual([]);
      expect(result.monthlyTrend).toEqual([]);
      expect(result.summary.totalDocumentCount).toBe(0);
      expect(result.summary.totalInvoiceValue).toBe(0);
    });
  });

  describe("last activity tracking", () => {
    it("records the most recent date per tag", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({ id: "inv_1", invoiceDate: "2025-01-01", totalAmount: 1000 }),
        makeTaggedInvoice({ id: "inv_2", invoiceDate: "2025-06-15", totalAmount: 2000 }),
      ]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.topTags[0].lastActivityDate).toBe("2025-06-15");
    });
  });

  describe("org scoping", () => {
    it("passes orgId to all queries including aggregates", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);
      mocks.voucherFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "combined" });

      expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
      );
      expect(mocks.invoiceAggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
      );
      expect(mocks.voucherAggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG_ID }) })
      );
    });
  });
});
