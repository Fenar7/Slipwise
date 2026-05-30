import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    orgDefaults: {
      findUnique: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    vendor: {
      findFirst: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    brandingProfile: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
}));

import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveDefaults } from "../resolver";
import { resolveInvoiceDefaults } from "../adapters/invoice-adapter";
import { resolveQuoteDefaults } from "../adapters/quote-adapter";
import { resolveVoucherDefaults } from "../adapters/voucher-adapter";

const ORG_ID = "org-test-1";

describe("Shared Defaulting Engine — resolveDefaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgContext).mockResolvedValue({
      orgId: ORG_ID,
      userId: "user-1",
      role: "admin",
    });
  });

  describe("precedence rules", () => {
    it("resolves invoice defaults without entity preselection", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultInvoiceTemplate: "professional",
        defaultInvoiceNotes: "Thank you",
        defaultInvoiceTerms: "Net 30",
        defaultInvoiceAuthorizedBy: "Manager",
        gstin: "32ABCDE1234F1Z6",
        bankName: "HDFC Bank",
        bankAccount: "50100012345678",
        bankIFSC: "HDFC0001234",
        businessAddress: "12 Business Park",
      } as any);

      const result = await resolveDefaults({
        kind: "invoice",
        orgId: ORG_ID,
      });

      expect(result.orgDefaults.defaultInvoiceTemplate).toBe("professional");
      expect(result.orgDefaults.defaultInvoiceNotes).toBe("Thank you");
      expect(result.orgDefaults.defaultInvoiceTerms).toBe("Net 30");
      expect(result.orgDefaults.defaultInvoiceAuthorizedBy).toBe("Manager");
      expect(result.orgDefaults.gstin).toBe("32ABCDE1234F1Z6");
      expect(result.orgDefaults.bankName).toBe("HDFC Bank");
      expect(result.entity).toBeNull();
    });

    it("resolves quote defaults without entity preselection", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultQuoteNotes: "Standard quote notes",
        defaultQuoteTerms: "50% upfront",
        quoteValidityDays: 30,
      } as any);

      const result = await resolveDefaults({
        kind: "quote",
        orgId: ORG_ID,
      });

      expect(result.orgDefaults.defaultQuoteNotes).toBe("Standard quote notes");
      expect(result.orgDefaults.defaultQuoteTerms).toBe("50% upfront");
      expect(result.orgDefaults.quoteValidityDays).toBe(30);
      expect(result.entity).toBeNull();
    });

    it("resolves voucher defaults without entity preselection", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultVoucherTemplate: "minimal-office",
        defaultVoucherNotes: "Manager approval required",
        defaultVoucherApprovedBy: "Jane Approved",
        defaultVoucherReceivedBy: "John Received",
        defaultVoucherPaymentMode: "Bank Transfer",
      } as any);

      const result = await resolveDefaults({
        kind: "voucher",
        orgId: ORG_ID,
      });

      expect(result.orgDefaults.defaultVoucherTemplate).toBe("minimal-office");
      expect(result.orgDefaults.defaultVoucherNotes).toBe("Manager approval required");
      expect(result.orgDefaults.defaultVoucherApprovedBy).toBe("Jane Approved");
      expect(result.orgDefaults.defaultVoucherReceivedBy).toBe("John Received");
      expect(result.orgDefaults.defaultVoucherPaymentMode).toBe("Bank Transfer");
      expect(result.entity).toBeNull();
    });

    it("validates entity belongs to org", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
      vi.mocked(db.customer.findFirst).mockResolvedValue(null);

      await expect(
        resolveDefaults({
          kind: "invoice",
          orgId: ORG_ID,
          entityId: "foreign-cust",
        }),
      ).rejects.toThrow("Customer not found or does not belong to this organisation");
    });

    it("returns customer entity when preselected and valid", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: "cust-1",
        organizationId: ORG_ID,
        name: "Acme Corp",
        email: "billing@acme.com",
        phone: "+91 98765 43210",
        address: "45 Client Street",
        gstin: "27AAACA1122R1ZV",
        taxId: null,
        paymentTermsDays: 45,
      } as any);

      const result = await resolveDefaults({
        kind: "invoice",
        orgId: ORG_ID,
        entityId: "cust-1",
      });

      expect(result.entity).not.toBeNull();
      expect(result.entity!.id).toBe("cust-1");
      expect(result.entity!.name).toBe("Acme Corp");
      expect(result.entity!.email).toBe("billing@acme.com");
      expect(result.entity!.phone).toBe("+91 98765 43210");
      expect(result.entity!.address).toBe("45 Client Street");
      expect(result.entity!.gstin).toBe("27AAACA1122R1ZV");
      expect(result.entity!.paymentTermsDays).toBe(45);

      expect(db.customer.findFirst).toHaveBeenCalledWith({
        where: { id: "cust-1", organizationId: ORG_ID },
      });
    });

    it("supplies safe structural defaults when org defaults are null", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);

      const result = await resolveDefaults({
        kind: "invoice",
        orgId: ORG_ID,
      });

      expect(result.orgDefaults.defaultInvoiceTemplate).toBe("professional");
      expect(result.orgDefaults.defaultVoucherTemplate).toBe("minimal-office");
      expect(result.orgDefaults.quoteValidityDays).toBe(14);
    });
  });
});

describe("Shared Defaulting Engine — Invoice Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies template query param over org default", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultInvoiceTemplate: "professional",
    } as any);

    const result = await resolveInvoiceDefaults({
      orgId: ORG_ID,
      templateParam: "minimal",
    });

    expect(result.templateId).toBe("minimal");
  });

  it("falls back to org default template when no query param", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultInvoiceTemplate: "professional",
    } as any);

    const result = await resolveInvoiceDefaults({
      orgId: ORG_ID,
    });

    expect(result.templateId).toBe("professional");
  });

  it("populates customer fields from entity when customerId provided", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultInvoiceTemplate: "professional",
    } as any);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Acme Corp",
      email: "billing@acme.com",
      phone: "+91 98765 43210",
      address: "45 Client Street",
      gstin: "27AAACA1122R1ZV",
      taxId: null,
      paymentTermsDays: 30,
    } as any);

    const result = await resolveInvoiceDefaults({
      orgId: ORG_ID,
      customerId: "cust-1",
    });

    expect(result.customerId).toBe("cust-1");
    expect(result.clientName).toBe("Acme Corp");
    expect(result.clientEmail).toBe("billing@acme.com");
    expect(result.clientTaxId).toBe("27AAACA1122R1ZV");
  });

  it("returns empty customer fields when no customerId", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);

    const result = await resolveInvoiceDefaults({
      orgId: ORG_ID,
    });

    expect(result.customerId).toBe("");
    expect(result.clientName).toBe("");
    expect(result.clientEmail).toBe("");
  });
});

describe("Shared Defaulting Engine — Quote Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses org quote defaults for notes and terms", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultQuoteNotes: "Custom notes",
      defaultQuoteTerms: "Custom terms",
      quoteValidityDays: 20,
    } as any);

    const result = await resolveQuoteDefaults({
      orgId: ORG_ID,
    });

    expect(result.notes).toBe("Custom notes");
    expect(result.termsAndConditions).toBe("Custom terms");
  });

  it("derives validUntil from quoteValidityDays", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      quoteValidityDays: 20,
    } as any);

    const result = await resolveQuoteDefaults({
      orgId: ORG_ID,
    });

    const issue = new Date(result.issueDate);
    const valid = new Date(result.validUntil);
    const diffDays = Math.round((valid.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(20);
  });

  it("defaults to 14 days validity when org defaults are absent", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);

    const result = await resolveQuoteDefaults({
      orgId: ORG_ID,
    });

    const issue = new Date(result.issueDate);
    const valid = new Date(result.validUntil);
    const diffDays = Math.round((valid.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(14);
  });

  it("populates customer fields when customerId provided", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-q-1",
      organizationId: ORG_ID,
      name: "Quote Client",
      email: "qc@example.com",
      phone: "+91 11111 22222",
      address: "Quote Address",
      gstin: null,
      taxId: null,
      paymentTermsDays: 30,
    } as any);

    const result = await resolveQuoteDefaults({
      orgId: ORG_ID,
      customerId: "cust-q-1",
    });

    expect(result.customerId).toBe("cust-q-1");
    expect(result.clientName).toBe("Quote Client");
    expect(result.clientEmail).toBe("qc@example.com");
  });
});

describe("Shared Defaulting Engine — Voucher Adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: null } as any);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);
  });

  it("resolves voucher org defaults through shared engine", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultVoucherTemplate: "minimal-office",
      defaultVoucherNotes: "Manager approval required",
      defaultVoucherApprovedBy: "Jane Approved",
      defaultVoucherReceivedBy: "John Received",
      defaultVoucherPaymentMode: "Bank Transfer",
    } as any);

    const result = await resolveVoucherDefaults({
      orgId: ORG_ID,
    });

    expect(result.templateId).toBe("minimal-office");
    expect(result.notes).toBe("Manager approval required");
    expect(result.approvedBy).toBe("Jane Approved");
    expect(result.receivedBy).toBe("John Received");
    expect(result.paymentMode).toBe("Bank Transfer");
  });

  it("preserves vendor-linked defaults when vendor is preselected", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultVoucherNotes: "Org note",
      defaultVoucherApprovedBy: "Approver",
      defaultVoucherTemplate: "minimal-office",
    } as any);
    vi.mocked(db.vendor.findFirst).mockResolvedValue({
      id: "vendor-1",
      organizationId: ORG_ID,
      name: "Supplier Inc",
      email: "supplier@example.com",
      phone: "",
      address: "Vendor Address",
      gstin: null,
      taxId: null,
      paymentTermsDays: 0,
    } as any);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Org" } as any);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);

    const result = await resolveVoucherDefaults({
      orgId: ORG_ID,
      vendorId: "vendor-1",
    });

    expect(result.counterpartyName).toBe("Supplier Inc");
    expect(result.notes).toBe("Org note");
    expect(result.approvedBy).toBe("Approver");
  });

  it("applies query param template over org default template", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultVoucherTemplate: "minimal-office",
    } as any);

    const result = await resolveVoucherDefaults({
      orgId: ORG_ID,
      templateParam: "modern-premium",
    });

    expect(result.templateId).toBe("modern-premium");
  });

  it("returns empty vendor fields when no vendorId", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);

    const result = await resolveVoucherDefaults({
      orgId: ORG_ID,
    });

    expect(result.vendorId).toBe("");
    expect(result.counterpartyName).toBe("");
  });
});

describe("Cross-org entity security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects cross-org customer in invoice adapter", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    await expect(
      resolveInvoiceDefaults({
        orgId: ORG_ID,
        customerId: "foreign-cust-id",
      }),
    ).rejects.toThrow("Customer not found or does not belong to this organisation");
  });

  it("rejects cross-org customer in quote adapter", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    await expect(
      resolveQuoteDefaults({
        orgId: ORG_ID,
        customerId: "foreign-cust-id",
      }),
    ).rejects.toThrow("Customer not found or does not belong to this organisation");
  });

  it("rejects cross-org vendor in voucher adapter", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.vendor.findFirst).mockResolvedValue(null);
    vi.mocked(db.organization.findUnique).mockResolvedValue(null);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);

    await expect(
      resolveVoucherDefaults({
        orgId: ORG_ID,
        vendorId: "foreign-vendor-id",
      }),
    ).rejects.toThrow("Vendor not found or does not belong to this organisation");
  });
});
