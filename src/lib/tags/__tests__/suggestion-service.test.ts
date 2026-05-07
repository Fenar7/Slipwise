import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  customerDefaultTagFindMany: vi.fn(),
  vendorDefaultTagFindMany: vi.fn(),
  invoiceTagAssignmentFindMany: vi.fn(),
  voucherTagAssignmentFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    customerDefaultTag: { findMany: mocks.customerDefaultTagFindMany },
    vendorDefaultTag: { findMany: mocks.vendorDefaultTagFindMany },
    invoiceTagAssignment: { findMany: mocks.invoiceTagAssignmentFindMany },
    voucherTagAssignment: { findMany: mocks.voucherTagAssignmentFindMany },
  },
}));

import { getSuggestedTags } from "../suggestion-service";

const ORG_ID = "org_test";
const CTX = { orgId: ORG_ID, userId: "u1", role: "admin", representedId: null, proxyGrantId: null, proxyScope: null };

function makeTagAssign(overrides: Record<string, unknown> = {}) {
  return {
    tagId: overrides.tagId ?? "tag_1",
    tag: {
      id: overrides.tagId ?? "tag_1",
      name: overrides.tagName ?? "Priority",
      slug: overrides.tagSlug ?? "priority",
      color: (overrides.tagColor as string) ?? "#FF0000",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.customerDefaultTagFindMany.mockResolvedValue([]);
  mocks.vendorDefaultTagFindMany.mockResolvedValue([]);
  mocks.invoiceTagAssignmentFindMany.mockResolvedValue([]);
  mocks.voucherTagAssignmentFindMany.mockResolvedValue([]);
});

describe("getSuggestedTags", () => {
  describe("default tags", () => {
    it("returns customer default tags first", async () => {
      mocks.customerDefaultTagFindMany.mockResolvedValue([
        { tag: { id: "tag_d", name: "Default", slug: "default", color: "#0000FF" } },
      ]);

      const result = await getSuggestedTags({
        counterpartyId: "cust_1",
        counterpartyType: "customer",
        documentType: "invoice",
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Default");
      expect(result[0].source).toBe("default");
    });

    it("returns vendor default tags first", async () => {
      mocks.vendorDefaultTagFindMany.mockResolvedValue([
        { tag: { id: "tag_d", name: "Vendor Default", slug: "vd", color: null } },
      ]);

      const result = await getSuggestedTags({
        counterpartyId: "ven_1",
        counterpartyType: "vendor",
        documentType: "voucher",
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Vendor Default");
      expect(result[0].source).toBe("default");
    });
  });

  describe("recent tags", () => {
    it("returns recently used tags for customer invoices", async () => {
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
        makeTagAssign({ tagId: "tag_r", tagName: "Recent", tagSlug: "recent", tagColor: "#00FF00" }),
      ]);

      const result = await getSuggestedTags({
        counterpartyId: "cust_1",
        counterpartyType: "customer",
        documentType: "invoice",
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Recent");
      expect(result[0].source).toBe("recent");
    });

    it("returns recently used tags for vendor vouchers", async () => {
      mocks.voucherTagAssignmentFindMany.mockResolvedValue([
        makeTagAssign({ tagId: "tag_r", tagName: "Recent V", tagSlug: "recent-v", tagColor: null }),
      ]);

      const result = await getSuggestedTags({
        counterpartyId: "ven_1",
        counterpartyType: "vendor",
        documentType: "voucher",
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Recent V");
      expect(result[0].source).toBe("recent");
    });

    it("counts usage and sorts by frequency", async () => {
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
        makeTagAssign({ tagId: "tag_a", tagName: "Alpha", tagSlug: "alpha" }),
        makeTagAssign({ tagId: "tag_b", tagName: "Beta", tagSlug: "beta" }),
        makeTagAssign({ tagId: "tag_a", tagName: "Alpha", tagSlug: "alpha" }),
        makeTagAssign({ tagId: "tag_a", tagName: "Alpha", tagSlug: "alpha" }),
      ]);

      const result = await getSuggestedTags({
        counterpartyId: "cust_1",
        counterpartyType: "customer",
        documentType: "invoice",
        limit: 5,
      });

      expect(result[0].name).toBe("Alpha");
      expect(result[0].usageCount).toBe(3);
      expect(result[1].name).toBe("Beta");
      expect(result[1].usageCount).toBe(1);
    });
  });

  describe("deduplication", () => {
    it("does not duplicate tags across sources", async () => {
      mocks.customerDefaultTagFindMany.mockResolvedValue([
        { tag: { id: "tag_x", name: "Shared", slug: "shared", color: null } },
      ]);
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
        makeTagAssign({ tagId: "tag_x", tagName: "Shared", tagSlug: "shared" }),
      ]);

      const result = await getSuggestedTags({
        counterpartyId: "cust_1",
        counterpartyType: "customer",
        documentType: "invoice",
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Shared");
      expect(result[0].source).toBe("default");
    });
  });

  describe("popular tags fallback", () => {
    it("returns org-wide popular tags when few recent tags", async () => {
      mocks.invoiceTagAssignmentFindMany
        .mockResolvedValueOnce([]);

      const result = await getSuggestedTags({
        counterpartyId: "cust_1",
        counterpartyType: "customer",
        documentType: "invoice",
        limit: 3,
      });

      // verify popular fallback was queried (the first findMany call is for recent, second for popular)
      expect(mocks.invoiceTagAssignmentFindMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("limit", () => {
    it("respects the limit parameter", async () => {
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
        makeTagAssign({ tagId: "tag_1", tagName: "One", tagSlug: "one" }),
        makeTagAssign({ tagId: "tag_2", tagName: "Two", tagSlug: "two" }),
        makeTagAssign({ tagId: "tag_3", tagName: "Three", tagSlug: "three" }),
      ]);

      const result = await getSuggestedTags({
        counterpartyId: "cust_1",
        counterpartyType: "customer",
        documentType: "invoice",
        limit: 2,
      });

      expect(result.length).toBeLessThanOrEqual(2);
    });
  });
});
