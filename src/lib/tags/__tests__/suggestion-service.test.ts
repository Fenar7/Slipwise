import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  customerDefaultTagFindMany: vi.fn(),
  vendorDefaultTagFindMany: vi.fn(),
  invoiceTagAssignmentFindMany: vi.fn(),
  voucherTagAssignmentFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireOrgContext: mocks.requireOrgContext }));
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

function ta(id: string, name: string, slug?: string, color?: string) {
  return { tagId: id, tag: { id, name, slug: slug ?? name.toLowerCase(), color: color ?? null } };
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
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([ta("r1", "Recent", "recent", "#00FF00")]);

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
      mocks.voucherTagAssignmentFindMany.mockResolvedValue([ta("r1", "RecV", "recv")]);

      const result = await getSuggestedTags({
        counterpartyId: "ven_1",
        counterpartyType: "vendor",
        documentType: "voucher",
      });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe("recent");
    });

    it("counts usage and sorts by frequency", async () => {
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
        ta("a", "Alpha"), ta("b", "Beta"), ta("a", "Alpha"), ta("a", "Alpha"),
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
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([ta("tag_x", "Shared", "shared")]);

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
      mocks.invoiceTagAssignmentFindMany.mockResolvedValueOnce([]);

      const result = await getSuggestedTags({
        counterpartyId: "cust_1",
        counterpartyType: "customer",
        documentType: "invoice",
        limit: 3,
      });

      expect(mocks.invoiceTagAssignmentFindMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("limit", () => {
    it("respects the limit parameter", async () => {
      mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
        ta("1", "One"), ta("2", "Two"), ta("3", "Three"),
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
