import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOrgContext: vi.fn(),
  documentTagFindFirst: vi.fn(),
  documentTagFindMany: vi.fn(),
  invoiceTagAssignmentFindFirst: vi.fn(),
  invoiceTagAssignmentFindMany: vi.fn(),
  invoiceTagAssignmentCreate: vi.fn(),
  invoiceTagAssignmentDeleteMany: vi.fn(),
  voucherTagAssignmentFindFirst: vi.fn(),
  voucherTagAssignmentFindMany: vi.fn(),
  voucherTagAssignmentCreate: vi.fn(),
  voucherTagAssignmentDeleteMany: vi.fn(),
  customerDefaultTagFindFirst: vi.fn(),
  customerDefaultTagFindMany: vi.fn(),
  customerDefaultTagCreate: vi.fn(),
  customerDefaultTagDeleteMany: vi.fn(),
  vendorDefaultTagFindFirst: vi.fn(),
  vendorDefaultTagFindMany: vi.fn(),
  vendorDefaultTagCreate: vi.fn(),
  vendorDefaultTagDeleteMany: vi.fn(),
  invoiceFindFirst: vi.fn(),
  voucherFindFirst: vi.fn(),
  customerFindFirst: vi.fn(),
  vendorFindFirst: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: mocks.requireOrgContext,
}));

vi.mock("@/lib/db", () => ({
  db: {
    documentTag: {
      findFirst: mocks.documentTagFindFirst,
      findMany: mocks.documentTagFindMany,
    },
    invoiceTagAssignment: {
      findFirst: mocks.invoiceTagAssignmentFindFirst,
      findMany: mocks.invoiceTagAssignmentFindMany,
      create: mocks.invoiceTagAssignmentCreate,
      deleteMany: mocks.invoiceTagAssignmentDeleteMany,
    },
    voucherTagAssignment: {
      findFirst: mocks.voucherTagAssignmentFindFirst,
      findMany: mocks.voucherTagAssignmentFindMany,
      create: mocks.voucherTagAssignmentCreate,
      deleteMany: mocks.voucherTagAssignmentDeleteMany,
    },
    customerDefaultTag: {
      findFirst: mocks.customerDefaultTagFindFirst,
      findMany: mocks.customerDefaultTagFindMany,
      create: mocks.customerDefaultTagCreate,
      deleteMany: mocks.customerDefaultTagDeleteMany,
    },
    vendorDefaultTag: {
      findFirst: mocks.vendorDefaultTagFindFirst,
      findMany: mocks.vendorDefaultTagFindMany,
      create: mocks.vendorDefaultTagCreate,
      deleteMany: mocks.vendorDefaultTagDeleteMany,
    },
    invoice: { findFirst: mocks.invoiceFindFirst },
    voucher: { findFirst: mocks.voucherFindFirst },
    customer: { findFirst: mocks.customerFindFirst },
    vendor: { findFirst: mocks.vendorFindFirst },
    $transaction: mocks.transaction,
  },
}));

import {
  addInvoiceTag,
  removeInvoiceTag,
  setInvoiceTags,
  getInvoiceTags,
  addVoucherTag,
  removeVoucherTag,
  setVoucherTags,
  getVoucherTags,
  addCustomerDefaultTag,
  removeCustomerDefaultTag,
  setCustomerDefaultTags,
  getCustomerDefaultTags,
  addVendorDefaultTag,
  removeVendorDefaultTag,
  setVendorDefaultTags,
  getVendorDefaultTags,
} from "../assignment-service";

const ORG_ID = "org_abc";
const CTX = { orgId: ORG_ID, userId: "user_1", role: "member", representedId: null, proxyGrantId: null, proxyScope: [] };

function makeTag(id: string = "tag_001", overrides: Record<string, unknown> = {}) {
  return {
    id,
    orgId: ORG_ID,
    name: "Hotel Sarovar",
    slug: "hotel-sarovar",
    color: "#3b82f6",
    description: null,
    isArchived: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireOrgContext.mockResolvedValue(CTX);
  mocks.transaction.mockImplementation((ops: any[]) => Promise.all(ops));
});

// Helper: simulate verifyOrgEntity returning true
function allowEntity(type: "invoice" | "voucher" | "customer" | "vendor") {
  const map: Record<string, any> = {
    invoice: mocks.invoiceFindFirst,
    voucher: mocks.voucherFindFirst,
    customer: mocks.customerFindFirst,
    vendor: mocks.vendorFindFirst,
  };
  map[type].mockResolvedValue({ id: "entity_1" });
}

function allowTag() {
  mocks.documentTagFindFirst.mockResolvedValue({ id: "tag_001" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Invoice Tags
// ═══════════════════════════════════════════════════════════════════════════════

describe("addInvoiceTag", () => {
  it("adds a tag to an invoice", async () => {
    allowEntity("invoice");
    allowTag();
    mocks.invoiceTagAssignmentFindFirst.mockResolvedValue(null);

    const result = await addInvoiceTag("invoice_1", "tag_001");
    expect(result.success).toBe(true);
    expect(mocks.invoiceTagAssignmentCreate).toHaveBeenCalledWith({
      data: { invoiceId: "invoice_1", tagId: "tag_001" },
    });
  });

  it("is idempotent when tag is already assigned", async () => {
    allowEntity("invoice");
    allowTag();
    mocks.invoiceTagAssignmentFindFirst.mockResolvedValue({ id: "assign_1" });

    const result = await addInvoiceTag("invoice_1", "tag_001");
    expect(result.success).toBe(true);
    expect(mocks.invoiceTagAssignmentCreate).not.toHaveBeenCalled();
  });

  it("rejects non-existent invoice", async () => {
    mocks.invoiceFindFirst.mockResolvedValue(null);

    const result = await addInvoiceTag("invoice_1", "tag_001");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invoice not found");
  });

  it("rejects tag from a different org", async () => {
    allowEntity("invoice");
    mocks.documentTagFindFirst.mockResolvedValue(null);

    const result = await addInvoiceTag("invoice_1", "tag_001");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Tag not found");
  });
});

describe("removeInvoiceTag", () => {
  it("removes a tag from an invoice", async () => {
    allowEntity("invoice");

    const result = await removeInvoiceTag("invoice_1", "tag_001");
    expect(result.success).toBe(true);
    expect(mocks.invoiceTagAssignmentDeleteMany).toHaveBeenCalledWith({
      where: { invoiceId: "invoice_1", tagId: "tag_001" },
    });
  });
});

describe("setInvoiceTags", () => {
  it("replaces all tags on an invoice", async () => {
    allowEntity("invoice");
    mocks.documentTagFindMany.mockResolvedValue([{ id: "tag_001" }, { id: "tag_002" }]);

    const result = await setInvoiceTags("invoice_1", ["tag_001", "tag_002"]);
    expect(result.success).toBe(true);
    expect(mocks.invoiceTagAssignmentDeleteMany).toHaveBeenCalledWith({
      where: { invoiceId: "invoice_1" },
    });
    expect(mocks.invoiceTagAssignmentCreate).toHaveBeenCalledTimes(2);
  });

  it("accepts empty array to clear all tags", async () => {
    allowEntity("invoice");

    const result = await setInvoiceTags("invoice_1", []);
    expect(result.success).toBe(true);
    expect(mocks.invoiceTagAssignmentDeleteMany).toHaveBeenCalled();
    expect(mocks.invoiceTagAssignmentCreate).not.toHaveBeenCalled();
  });

  it("rejects invalid tag ids", async () => {
    allowEntity("invoice");
    mocks.documentTagFindMany.mockResolvedValue([{ id: "tag_001" }]);

    const result = await setInvoiceTags("invoice_1", ["tag_001", "invalid_tag"]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Tags not found");
  });
});

describe("getInvoiceTags", () => {
  it("returns tags assigned to an invoice", async () => {
    allowEntity("invoice");
    mocks.invoiceTagAssignmentFindMany.mockResolvedValue([
      { tag: makeTag("tag_001") },
      { tag: makeTag("tag_002", { name: "Mumbai Branch" }) },
    ]);

    const result = await getInvoiceTags("invoice_1");
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Voucher Tags
// ═══════════════════════════════════════════════════════════════════════════════

describe("addVoucherTag", () => {
  it("adds a tag to a voucher", async () => {
    allowEntity("voucher");
    allowTag();
    mocks.voucherTagAssignmentFindFirst.mockResolvedValue(null);

    const result = await addVoucherTag("voucher_1", "tag_001");
    expect(result.success).toBe(true);
  });

  it("rejects non-existent voucher", async () => {
    mocks.voucherFindFirst.mockResolvedValue(null);

    const result = await addVoucherTag("voucher_1", "tag_001");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Voucher not found");
  });
});

describe("setVoucherTags", () => {
  it("replaces all tags on a voucher", async () => {
    allowEntity("voucher");
    mocks.documentTagFindMany.mockResolvedValue([{ id: "tag_001" }]);

    const result = await setVoucherTags("voucher_1", ["tag_001"]);
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Customer Default Tags
// ═══════════════════════════════════════════════════════════════════════════════

describe("addCustomerDefaultTag", () => {
  it("adds a default tag to a customer", async () => {
    allowEntity("customer");
    allowTag();
    mocks.customerDefaultTagFindFirst.mockResolvedValue(null);

    const result = await addCustomerDefaultTag("customer_1", "tag_001");
    expect(result.success).toBe(true);
  });

  it("rejects non-existent customer", async () => {
    mocks.customerFindFirst.mockResolvedValue(null);

    const result = await addCustomerDefaultTag("customer_1", "tag_001");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Customer not found");
  });
});

describe("getCustomerDefaultTags", () => {
  it("returns default tags for a customer", async () => {
    allowEntity("customer");
    mocks.customerDefaultTagFindMany.mockResolvedValue([
      { tag: makeTag("tag_001") },
    ]);

    const result = await getCustomerDefaultTags("customer_1");
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Vendor Default Tags
// ═══════════════════════════════════════════════════════════════════════════════

describe("addVendorDefaultTag", () => {
  it("adds a default tag to a vendor", async () => {
    allowEntity("vendor");
    allowTag();
    mocks.vendorDefaultTagFindFirst.mockResolvedValue(null);

    const result = await addVendorDefaultTag("vendor_1", "tag_001");
    expect(result.success).toBe(true);
  });
});

describe("setVendorDefaultTags", () => {
  it("replaces all default tags for a vendor", async () => {
    allowEntity("vendor");
    mocks.documentTagFindMany.mockResolvedValue([{ id: "tag_001" }, { id: "tag_003" }]);

    const result = await setVendorDefaultTags("vendor_1", ["tag_001", "tag_003"]);
    expect(result.success).toBe(true);
    expect(mocks.vendorDefaultTagDeleteMany).toHaveBeenCalledWith({
      where: { vendorId: "vendor_1" },
    });
    expect(mocks.vendorDefaultTagCreate).toHaveBeenCalledTimes(2);
  });
});
