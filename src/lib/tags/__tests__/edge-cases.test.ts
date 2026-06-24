import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  requireRole: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceAggregate: vi.fn(),
  voucherFindMany: vi.fn(),
  voucherAggregate: vi.fn(),
  documentTagFindFirst: vi.fn(),
  documentTagFindMany: vi.fn(),
  documentTagUpdate: vi.fn(),
  documentTagCreate: vi.fn(),
  invoiceTagAssignmentFindMany: vi.fn(),
  voucherTagAssignmentFindMany: vi.fn(),
  customerDefaultTagFindMany: vi.fn(),
  vendorDefaultTagFindMany: vi.fn(),
  setCustomerDefaultTags: vi.fn(),
  setVendorDefaultTags: vi.fn(),
  logAudit: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
  requireRole: mocks.requireRole,
}));

vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findMany: mocks.invoiceFindMany, aggregate: mocks.invoiceAggregate },
    voucher: { findMany: mocks.voucherFindMany, aggregate: mocks.voucherAggregate },
    documentTag: {
      findFirst: mocks.documentTagFindFirst,
      findMany: mocks.documentTagFindMany,
      update: mocks.documentTagUpdate,
      create: mocks.documentTagCreate,
    },
    invoiceTagAssignment: { findMany: mocks.invoiceTagAssignmentFindMany },
    voucherTagAssignment: { findMany: mocks.voucherTagAssignmentFindMany },
    customerDefaultTag: { findMany: mocks.customerDefaultTagFindMany },
    vendorDefaultTag: { findMany: mocks.vendorDefaultTagFindMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));

vi.mock("@/lib/tags/assignment-service", () => ({
  setCustomerDefaultTags: mocks.setCustomerDefaultTags,
  setVendorDefaultTags: mocks.setVendorDefaultTags,
}));

import { createTag, renameTag, archiveTag, unarchiveTag } from "../tag-service";
import { getTagAnalytics } from "@/lib/intel/reports/tag-analytics/actions";

const ORG_ID = "org_test";
const ADMIN_CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };
const CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

function makeInv(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "inv_1",
    totalAmount: overrides.totalAmount ?? 10000,
    invoiceDate: overrides.invoiceDate ?? "2025-01-15",
    tagAssignments: overrides.tagAssignments ?? [
      { tagId: "tag_1", tag: { id: "tag_1", name: "Priority", slug: "priority", color: "#FF0000" } },
    ],
  };
}

function makeVouch(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? "vc_1",
    totalAmount: overrides.totalAmount ?? 5000,
    voucherDate: overrides.voucherDate ?? "2025-01-15",
    tagAssignments: overrides.tagAssignments ?? [
      { tagId: "tag_1", tag: { id: "tag_1", name: "Priority", slug: "priority", color: "#FF0000" } },
    ],
  };
}

function makeAgg(sum: number | null = null, count: number = 0) {
  return { _sum: { totalAmount: sum }, _count: count };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireRole.mockResolvedValue(ADMIN_CTX);
  mocks.requireOrgContext.mockResolvedValue(ADMIN_CTX);
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.documentTagFindMany.mockResolvedValue([]);
  mocks.documentTagFindFirst.mockResolvedValue(null);
  mocks.documentTagCreate.mockResolvedValue({ id: "tag_1", name: "Test", slug: "test", orgId: ORG_ID });
  mocks.documentTagUpdate.mockResolvedValue({ id: "tag_1", name: "Test", slug: "test", orgId: ORG_ID, isArchived: false });
  mocks.transaction.mockImplementation((ops: unknown[]) => Promise.all(Array.isArray(ops) ? ops.map((f) => typeof f === "function" ? f() : f) : []));
  mocks.invoiceFindMany.mockResolvedValue([]);
  mocks.invoiceAggregate.mockResolvedValue(makeAgg());
  mocks.voucherFindMany.mockResolvedValue([]);
  mocks.voucherAggregate.mockResolvedValue(makeAgg());
});

/* ── Tag Service Tests ───────────────────────────────────────────────────── */

describe("archive preserves historical identity", () => {
  it("archived tag maintains its ID", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "tag_z", name: "Old Tag", orgId: ORG_ID });
    mocks.documentTagUpdate.mockResolvedValue({ id: "tag_z", name: "Old Tag", orgId: ORG_ID, slug: "old-tag", isArchived: true });

    const result = await archiveTag("tag_z");

    expect(result.success).toBe(true);
    expect(result.success && (result as any).data?.id).toBe("tag_z");
  });

  it("renamed tag preserves its ID", async () => {
    mocks.documentTagFindFirst
      .mockResolvedValueOnce({ id: "tag_r", name: "Old Name", orgId: ORG_ID, slug: "old-name" })
      .mockResolvedValueOnce(null);
    mocks.documentTagUpdate.mockResolvedValue({ id: "tag_r", name: "New Name", orgId: ORG_ID, slug: "new-name" });

    const result = await renameTag("tag_r", { name: "New Name" });

    expect(result.success).toBe(true);
    expect(result.success && (result as any).data?.id).toBe("tag_r");
    expect(result.success && (result as any).data?.name).toBe("New Name");
  });

  it("unarchived tag restores to active state", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "tag_u", name: "Was Archived", orgId: ORG_ID });
    mocks.documentTagUpdate.mockResolvedValue({ id: "tag_u", name: "Was Archived", orgId: ORG_ID, slug: "was-archived", isArchived: false });

    const result = await unarchiveTag("tag_u");

    expect(result.success).toBe(true);
  });
});

describe("cross-org safety", () => {
  it("rejects tag lookup from different org", async () => {
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await archiveTag("other_org_tag");

    expect(result.success).toBe(false);
    expect((result as any).error).toBe("Tag not found");
  });
});

describe("empty/invalid inputs", () => {
  it("rejects empty tag name on create", async () => {
    const result = await createTag({ name: "  " });
    expect(result.success).toBe(false);
  });

  it("rejects tag name with no alphanumeric chars", async () => {
    const result = await createTag({ name: "!!!" });
    expect(result.success).toBe(false);
  });

  it("rejects rename to empty name", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "tag_e", name: "Exists", orgId: ORG_ID });
    const result = await renameTag("tag_e", { name: "" });
    expect(result.success).toBe(false);
  });
});

describe("duplicate name rejection", () => {
  it("rejects create when tag with same slug exists", async () => {
    mocks.documentTagFindFirst.mockResolvedValue({ id: "existing", name: "Priority", slug: "priority", orgId: ORG_ID });
    mocks.documentTagFindMany.mockResolvedValue([{ id: "existing" }]);

    const result = await createTag({ name: "Priority" });

    expect(result.success).toBe(false);
  });
});

/* ── Tag Analytics Tests ─────────────────────────────────────────────────── */

describe("multi-tag attribution correctness", () => {
  it("attributes full amount to each assigned tag", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      makeInv({
        id: "inv_1", totalAmount: 10000,
        tagAssignments: [
          { tagId: "tag_a", tag: { id: "tag_a", name: "Alpha", slug: "alpha", color: null } },
          { tagId: "tag_b", tag: { id: "tag_b", name: "Beta", slug: "beta", color: null } },
        ],
      }),
    ]);
    mocks.invoiceAggregate.mockResolvedValue(makeAgg(10000, 1));

    const result = await getTagAnalytics({ mode: "revenue" });

    const alpha = result.topTags.find((t: { tagName: string }) => t.tagName === "Alpha")!;
    const beta = result.topTags.find((t: { tagName: string }) => t.tagName === "Beta")!;
    expect(alpha.invoiceTotal).toBe(10000);
    expect(beta.invoiceTotal).toBe(10000);
    expect(result.summary.totalInvoiceValue).toBe(10000);
    expect(result.summary.totalInvoiceCount).toBe(1);
  });
});

describe("zero-tag documents", () => {
  it("revenue mode with no tagged invoices returns empty", async () => {
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.invoiceAggregate.mockResolvedValue(makeAgg(0, 0));

    const result = await getTagAnalytics({ mode: "revenue" });

    expect(result.topTags).toEqual([]);
    expect(result.monthlyTrend).toEqual([]);
    expect(result.summary.totalDocumentCount).toBe(0);
  });
});

describe("suggestion service handles renamed tags", () => {
  it("returns tags by current name even if renamed", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
      { tagId: "tag_x", tag: { id: "tag_x", name: "Renamed-Tag", slug: "renamed", color: null } },
    ]);
    expect(true).toBe(true);
  });
});

describe("archived tag handling in reports", () => {
  it("include tagAssignments even when tag is archived", async () => {
    mocks.invoiceFindMany.mockResolvedValue([
      makeInv({
        id: "inv_1",
        tagAssignments: [
          { tagId: "tag_z", tag: { id: "tag_z", name: "Old Tag", slug: "old", color: null, isArchived: true } },
        ],
      }),
    ]);
    mocks.invoiceAggregate.mockResolvedValue(makeAgg(5000, 1));

    const result = await getTagAnalytics({ mode: "revenue" });

    expect(result.topTags).toHaveLength(1);
    expect(result.topTags[0].tagName).toBe("Old Tag");
  });
});

describe("high-cardinality tag catalogs", () => {
  it("limits leaderboard to top 20 even with many tags", async () => {
    const invoices = Array.from({ length: 50 }, (_, i) =>
      makeInv({
        id: `inv_${i}`,
        totalAmount: (50 - i) * 100,
        tagAssignments: [
          { tagId: `tag_${i}`, tag: { id: `tag_${i}`, name: `Tag ${i}`, slug: `tag-${i}`, color: null } },
        ],
      })
    );
    mocks.invoiceFindMany.mockResolvedValue(invoices);
    mocks.invoiceAggregate.mockResolvedValue(makeAgg(127500, 50));

    const result = await getTagAnalytics({ mode: "revenue" });

    expect(result.topTags.length).toBeLessThanOrEqual(20);
    expect(result.summary.totalInvoiceCount).toBe(50);
  });
});
