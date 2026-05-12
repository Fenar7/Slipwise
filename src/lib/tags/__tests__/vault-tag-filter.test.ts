import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  documentIndexFindMany: vi.fn(),
  documentIndexCount: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceTagAssignmentFindMany: vi.fn(),
  voucherTagAssignmentFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    documentIndex: {
      findMany: mocks.documentIndexFindMany,
      count: mocks.documentIndexCount,
    },
    invoice: {
      findMany: mocks.invoiceFindMany,
    },
    invoiceTagAssignment: {
      findMany: mocks.invoiceTagAssignmentFindMany,
    },
    voucherTagAssignment: {
      findMany: mocks.voucherTagAssignmentFindMany,
    },
  },
}));

import { queryVault } from "@/lib/docs-vault";
import type { VaultRow } from "@/lib/docs-vault";

const ORG_ID = "org_abc";
const CTX = { orgId: ORG_ID, userId: "user_1", role: "member", representedId: null, proxyGrantId: null, proxyScope: [] };

function makeRow(docType: string, documentId: string, overrides: Partial<VaultRow> = {}): VaultRow {
  return {
    id: `idx_${documentId}`,
    orgId: ORG_ID,
    docType,
    documentId,
    documentNumber: `${docType.toUpperCase()}-001`,
    titleOrSummary: `Test ${docType}`,
    counterpartyLabel: null,
    status: "approved",
    primaryDate: new Date("2026-05-01"),
    amount: 1000,
    currency: "INR",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
});

describe("queryVault with tagIds", () => {
  it("filters documents by tag using relational joins", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
      { invoiceId: "inv_1" },
      { invoiceId: "inv_2" },
    ]);
    mocks.voucherTagAssignmentFindMany.mockResolvedValue([
      { voucherId: "vou_1" },
    ]);

    mocks.documentIndexFindMany.mockResolvedValue([
      makeRow("invoice", "inv_1"),
      makeRow("invoice", "inv_2"),
      makeRow("voucher", "vou_1"),
    ]);
    mocks.documentIndexCount.mockResolvedValue(3);
    mocks.invoiceFindMany.mockResolvedValue([]);

    const result = await queryVault({
      tagIds: ["tag_001", "tag_002"],
    });

    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);
    expect(mocks.invoiceTagAssignmentFindMany).toHaveBeenCalledWith({
      where: { tagId: { in: ["tag_001", "tag_002"] } },
      select: { invoiceId: true },
      distinct: ["invoiceId"],
    });
    expect(mocks.voucherTagAssignmentFindMany).toHaveBeenCalledWith({
      where: { tagId: { in: ["tag_001", "tag_002"] } },
      select: { voucherId: true },
      distinct: ["voucherId"],
    });
    expect(mocks.documentIndexFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          documentId: { in: ["inv_1", "inv_2", "vou_1"] },
        }),
      })
    );
  });

  it("returns empty result when no documents match the tag", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([]);
    mocks.voucherTagAssignmentFindMany.mockResolvedValue([]);

    const result = await queryVault({
      tagIds: ["tag_nonexistent"],
    });

    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
    expect(mocks.documentIndexFindMany).not.toHaveBeenCalled();
  });

  it("combines tag filter with other filters", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
      { invoiceId: "inv_1" },
    ]);
    mocks.voucherTagAssignmentFindMany.mockResolvedValue([]);

    mocks.documentIndexFindMany.mockResolvedValue([
      makeRow("invoice", "inv_1"),
    ]);
    mocks.documentIndexCount.mockResolvedValue(1);
    mocks.invoiceFindMany.mockResolvedValue([]);

    const result = await queryVault({
      docType: "invoice",
      tagIds: ["tag_001"],
    });

    expect(result.total).toBe(1);
    expect(mocks.documentIndexFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          docType: "invoice",
          documentId: { in: ["inv_1"] },
        }),
      })
    );
  });

  it("does not add tag filter when tagIds is empty", async () => {
    mocks.documentIndexFindMany.mockResolvedValue([]);
    mocks.documentIndexCount.mockResolvedValue(0);

    await queryVault({ tagIds: [] });

    expect(mocks.invoiceTagAssignmentFindMany).not.toHaveBeenCalled();
    expect(mocks.voucherTagAssignmentFindMany).not.toHaveBeenCalled();
  });

  it("does not add tag filter when tagIds is undefined", async () => {
    mocks.documentIndexFindMany.mockResolvedValue([]);
    mocks.documentIndexCount.mockResolvedValue(0);

    await queryVault({});

    expect(mocks.invoiceTagAssignmentFindMany).not.toHaveBeenCalled();
    expect(mocks.voucherTagAssignmentFindMany).not.toHaveBeenCalled();
  });
});
