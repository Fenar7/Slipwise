import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceCount: vi.fn(),
  voucherFindMany: vi.fn(),
  voucherCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findMany: mocks.invoiceFindMany, count: mocks.invoiceCount },
    voucher: { findMany: mocks.voucherFindMany, count: mocks.voucherCount },
  },
}));

import { listInvoices } from "../invoices/actions";
import { listVouchers } from "../vouchers/actions";

const ORG_ID = "org_test";
const CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.invoiceFindMany.mockResolvedValue([]);
  mocks.invoiceCount.mockResolvedValue(0);
  mocks.voucherFindMany.mockResolvedValue([]);
  mocks.voucherCount.mockResolvedValue(0);
});

describe("invoice list tag filtering", () => {
  it("filters invoices by tagIds", async () => {
    await listInvoices({ tagIds: ["tag_1", "tag_2"] });

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
    await listInvoices({ tagIds: [] });

    const callArg = mocks.invoiceFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("tagAssignments");
  });

  it("does not apply tag filter when tagIds is undefined", async () => {
    await listInvoices({});

    const callArg = mocks.invoiceFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("tagAssignments");
  });

  it("combines tag filter with existing status filter", async () => {
    await listInvoices({ status: "PAID", tagIds: ["tag_1"] });

    const callArg = mocks.invoiceFindMany.mock.calls[0][0];
    expect(callArg.where.tagAssignments).toEqual({
      some: { tagId: { in: ["tag_1"] } },
    });
    expect(callArg.where.status).toBe("PAID");
  });
});

describe("voucher list tag filtering", () => {
  it("filters vouchers by tagIds", async () => {
    await listVouchers({ tagIds: ["tag_1"] });

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

  it("does not apply tag filter when tagIds is empty", async () => {
    await listVouchers({ tagIds: [] });

    const callArg = mocks.voucherFindMany.mock.calls[0][0];
    expect(callArg.where).not.toHaveProperty("tagAssignments");
  });

  it("combines tag filter with type filter", async () => {
    await listVouchers({ type: "payment", tagIds: ["tag_1"] });

    const callArg = mocks.voucherFindMany.mock.calls[0][0];
    expect(callArg.where.tagAssignments).toEqual({
      some: { tagId: { in: ["tag_1"] } },
    });
    expect(callArg.where.type).toBe("payment");
  });
});

describe("drill-down query parameters", () => {
  function buildDrilldownUrl(
    tagId: string,
    docType: "invoice" | "voucher",
    dateFrom?: string,
    dateTo?: string
  ): string {
    const params = new URLSearchParams();
    params.set("tagIds", tagId);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    return `/app/docs/${docType === "invoice" ? "invoices" : "vouchers"}?${params.toString()}`;
  }

  it("builds invoice drill-down URL with tag only", () => {
    const url = buildDrilldownUrl("tag_123", "invoice");
    expect(url).toContain("/app/docs/invoices?");
    expect(url).toContain("tagIds=tag_123");
  });

  it("builds voucher drill-down URL with tag only", () => {
    const url = buildDrilldownUrl("tag_123", "voucher");
    expect(url).toContain("/app/docs/vouchers?");
    expect(url).toContain("tagIds=tag_123");
  });

  it("preserves date range in drill-down URL", () => {
    const url = buildDrilldownUrl("tag_123", "invoice", "2025-01-01", "2025-03-31");
    expect(url).toContain("dateFrom=2025-01-01");
    expect(url).toContain("dateTo=2025-03-31");
    expect(url).toContain("tagIds=tag_123");
  });

  it("preserves only dateFrom when dateTo is not set", () => {
    const url = buildDrilldownUrl("tag_123", "invoice", "2025-01-01");
    expect(url).toContain("dateFrom=2025-01-01");
    expect(url).not.toContain("dateTo=");
  });

  it("parses comma-separated tagIds from query string", () => {
    const queryParam = "tag_1,tag_2,tag_3";
    const parsed = queryParam.split(",").filter(Boolean);
    expect(parsed).toEqual(["tag_1", "tag_2", "tag_3"]);
  });

  it("handles empty tagIds query param gracefully", () => {
    const queryParam = "";
    const parsed = queryParam ? queryParam.split(",").filter(Boolean) : undefined;
    expect(parsed).toBeUndefined();
  });
});
