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
  it("returns customer default tags first", async () => {
    mocks.customerDefaultTagFindMany.mockResolvedValue([{ tag: { id: "d1", name: "Default1", slug: "d1", color: null } }]);
    const r = await getSuggestedTags({ counterpartyId: "c1", counterpartyType: "customer", documentType: "invoice" });
    expect(r[0].source).toBe("default");
    expect(r[0].name).toBe("Default1");
  });

  it("returns recent tags for customer invoices", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([ta("r1", "Recent", "recent", "#00FF00")]);
    const r = await getSuggestedTags({ counterpartyId: "c1", counterpartyType: "customer", documentType: "invoice" });
    expect(r[0].source).toBe("recent");
    expect(r[0].name).toBe("Recent");
  });

  it("returns recent tags for vendor vouchers", async () => {
    mocks.voucherTagAssignmentFindMany.mockResolvedValue([ta("r1", "RecV", "recv")]);
    const r = await getSuggestedTags({ counterpartyId: "v1", counterpartyType: "vendor", documentType: "voucher" });
    expect(r[0].source).toBe("recent");
  });

  it("deduplicates tags across sources", async () => {
    mocks.customerDefaultTagFindMany.mockResolvedValue([{ tag: { id: "shared", name: "Shared", slug: "shared", color: null } }]);
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([ta("shared", "Shared", "shared")]);
    const r = await getSuggestedTags({ counterpartyId: "c1", counterpartyType: "customer", documentType: "invoice" });
    expect(r).toHaveLength(1);
    expect(r[0].source).toBe("default");
  });

  it("sorts recent by frequency", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([ta("a", "A"), ta("b", "B"), ta("a", "A"), ta("a", "A")]);
    const r = await getSuggestedTags({ counterpartyId: "c1", counterpartyType: "customer", documentType: "invoice", limit: 5 });
    expect(r[0].name).toBe("A");
    expect(r[0].usageCount).toBe(3);
  });

  it("respects limit", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([ta("1", "1"), ta("2", "2"), ta("3", "3")]);
    const r = await getSuggestedTags({ counterpartyId: "c1", counterpartyType: "customer", documentType: "invoice", limit: 2 });
    expect(r.length).toBeLessThanOrEqual(2);
  });

  it("falls back to popular when few recent", async () => {
    mocks.invoiceTagAssignmentFindMany.mockResolvedValueOnce([ta("r1", "R1")]);
    const r = await getSuggestedTags({ counterpartyId: "c1", counterpartyType: "customer", documentType: "invoice", limit: 3 });
    expect(mocks.invoiceTagAssignmentFindMany).toHaveBeenCalledTimes(2);
  });
});
