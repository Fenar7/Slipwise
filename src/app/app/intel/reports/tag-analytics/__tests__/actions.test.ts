import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  invoiceFindMany: vi.fn(),
  voucherFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findMany: mocks.invoiceFindMany },
    voucher: { findMany: mocks.voucherFindMany },
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.invoiceFindMany.mockResolvedValue([]);
  mocks.voucherFindMany.mockResolvedValue([]);
});

describe("getTagAnalytics", () => {
  describe("revenue mode", () => {
    it("queries only invoices, not vouchers", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "revenue" });

      expect(mocks.invoiceFindMany).toHaveBeenCalled();
      expect(mocks.voucherFindMany).not.toHaveBeenCalled();
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

    it("ranks tags by total descending", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({
          id: "inv_1",
          totalAmount: 5000,
          tagAssignments: [{ tagId: "tag_a", tag: { id: "tag_a", name: "A", slug: "a", color: null } }],
        }),
        makeTaggedInvoice({
          id: "inv_2",
          totalAmount: 15000,
          tagAssignments: [{ tagId: "tag_b", tag: { id: "tag_b", name: "B", slug: "b", color: null } }],
        }),
      ]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.topTags[0].tagName).toBe("B");
      expect(result.topTags[1].tagName).toBe("A");
      expect(result.topTags[0].invoiceTotal).toBe(15000);
      expect(result.topTags[1].invoiceTotal).toBe(5000);
    });
  });

  describe("expense mode", () => {
    it("queries only vouchers, not invoices", async () => {
      mocks.voucherFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "expense" });

      expect(mocks.voucherFindMany).toHaveBeenCalled();
      expect(mocks.invoiceFindMany).not.toHaveBeenCalled();
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
            { tagId: "tag_a", tag: { id: "tag_a", name: "Alpha", slug: "alpha", color: null } },
            { tagId: "tag_b", tag: { id: "tag_b", name: "Beta", slug: "beta", color: null } },
          ],
        }),
      ]);

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.topTags).toHaveLength(2);
      const alpha = result.topTags.find((t) => t.tagName === "Alpha")!;
      const beta = result.topTags.find((t) => t.tagName === "Beta")!;
      expect(alpha.invoiceTotal).toBe(10000);
      expect(beta.invoiceTotal).toBe(10000);
      expect(alpha.invoiceCount).toBe(1);
      expect(beta.invoiceCount).toBe(1);
    });

    it("limits leaderboard to top 20", async () => {
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

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.topTags.length).toBeLessThanOrEqual(20);
    });
  });

  describe("date range", () => {
    it("applies dateFrom and dateTo to invoice query", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);

      await getTagAnalytics({
        mode: "revenue",
        dateFrom: "2025-01-01",
        dateTo: "2025-03-31",
      });

      expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoiceDate: { gte: "2025-01-01", lte: "2025-03-31" },
          }),
        })
      );
    });

    it("applies dateFrom without dateTo", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "revenue", dateFrom: "2025-01-01" });

      expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            invoiceDate: { gte: "2025-01-01" },
          }),
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
      expect(jan.invoiceTotal).toBe(15000); // 10000 + 5000
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

    it("merges invoice and voucher totals by month in combined mode", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({ id: "inv_1", invoiceDate: "2025-01-15", totalAmount: 10000 }),
      ]);
      mocks.voucherFindMany.mockResolvedValue([
        makeTaggedVoucher({ id: "vc_1", voucherDate: "2025-01-20", totalAmount: 5000 }),
      ]);

      const result = await getTagAnalytics({ mode: "combined" });

      const jan = result.monthlyTrend.find((m) => m.month === "2025-01")!;
      expect(jan.invoiceTotal).toBe(10000);
      expect(jan.voucherTotal).toBe(5000);
      expect(jan.combinedTotal).toBe(15000);
    });
  });

  describe("empty states", () => {
    it("returns empty arrays when no tagged documents exist", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);
      mocks.voucherFindMany.mockResolvedValue([]);

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.topTags).toEqual([]);
      expect(result.monthlyTrend).toEqual([]);
    });

    it("returns empty top tags when no invoices in revenue mode", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);

      const result = await getTagAnalytics({ mode: "revenue" });

      expect(result.topTags).toEqual([]);
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

    it("tracks last activity across both invoice and voucher dates", async () => {
      mocks.invoiceFindMany.mockResolvedValue([
        makeTaggedInvoice({ id: "inv_1", invoiceDate: "2025-03-01", totalAmount: 1000 }),
      ]);
      mocks.voucherFindMany.mockResolvedValue([
        makeTaggedVoucher({ id: "vc_1", voucherDate: "2025-06-01", totalAmount: 1000 }),
      ]);

      const result = await getTagAnalytics({ mode: "combined" });

      expect(result.topTags[0].lastActivityDate).toBe("2025-06-01");
    });
  });

  describe("org scoping", () => {
    it("passes orgId to all queries", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);
      mocks.voucherFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "combined" });

      expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID }),
        })
      );
      expect(mocks.voucherFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: ORG_ID }),
        })
      );
    });

    it("filters out archived invoices and vouchers", async () => {
      mocks.invoiceFindMany.mockResolvedValue([]);
      mocks.voucherFindMany.mockResolvedValue([]);

      await getTagAnalytics({ mode: "combined" });

      expect(mocks.invoiceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ archivedAt: null }),
        })
      );
    });
  });
});
