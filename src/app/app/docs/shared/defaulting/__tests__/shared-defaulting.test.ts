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

    // --- Centralized template precedence tests ---

    it("resolver: query param overrides org default for invoice template", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultInvoiceTemplate: "professional",
      } as any);

      const result = await resolveDefaults({
        kind: "invoice",
        orgId: ORG_ID,
        queryParams: { template: "minimal" },
      });

      expect(result.templateId).toBe("minimal");
    });

    it("resolver: query param overrides org default for voucher template", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultVoucherTemplate: "minimal-office",
      } as any);

      const result = await resolveDefaults({
        kind: "voucher",
        orgId: ORG_ID,
        queryParams: { template: "modern-premium" },
      });

      expect(result.templateId).toBe("modern-premium");
    });

    it("resolver: org default template used when no query param for invoice", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultInvoiceTemplate: "professional",
      } as any);

      const result = await resolveDefaults({
        kind: "invoice",
        orgId: ORG_ID,
      });

      expect(result.templateId).toBe("professional");
    });

    it("resolver: org default template used when no query param for voucher", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultVoucherTemplate: "minimal-office",
      } as any);

      const result = await resolveDefaults({
        kind: "voucher",
        orgId: ORG_ID,
      });

      expect(result.templateId).toBe("minimal-office");
    });

    it("resolver: voucher kind resolves voucher-specific template", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultInvoiceTemplate: "professional",
        defaultVoucherTemplate: "minimal-office",
      } as any);

      const invoiceResult = await resolveDefaults({ kind: "invoice", orgId: ORG_ID });
      const voucherResult = await resolveDefaults({ kind: "voucher", orgId: ORG_ID });

      expect(invoiceResult.templateId).toBe("professional");
      expect(voucherResult.templateId).toBe("minimal-office");
    });

    it("resolver: structural fallback when org defaults null for invoice", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);

      const result = await resolveDefaults({
        kind: "invoice",
        orgId: ORG_ID,
      });

      expect(result.templateId).toBe("professional");
    });

    it("resolver: structural fallback when org defaults null for voucher", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);

      const result = await resolveDefaults({
        kind: "voucher",
        orgId: ORG_ID,
      });

      expect(result.templateId).toBe("minimal-office");
    });

    it("resolver: invoice templateId is present in DefaultResolution with entity", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        organizationId: ORG_ID,
        defaultInvoiceTemplate: "professional",
      } as any);
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: "cust-1", organizationId: ORG_ID, name: "Co", email: null,
        phone: null, address: null, gstin: null, taxId: null, paymentTermsDays: 30,
      } as any);

      const result = await resolveDefaults({
        kind: "invoice",
        orgId: ORG_ID,
        entityId: "cust-1",
      });

      expect(result.templateId).toBe("professional");
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

  it("seeds templateId from resolver through to autofill payload", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultVoucherTemplate: "traditional-ledger",
      defaultVoucherNotes: "Org note",
    } as any);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Org" } as any);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);

    const result = await resolveVoucherDefaults({
      orgId: ORG_ID,
    });

    expect(result.templateId).toBe("traditional-ledger");
  });

  it("autofill rehydration payload preserves templateId when switching vendors", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultVoucherTemplate: "minimal-office",
    } as any);
    vi.mocked(db.vendor.findFirst).mockResolvedValue({
      id: "vendor-2", organizationId: ORG_ID, name: "Another Vendor",
      email: null, phone: null, address: null, gstin: null, taxId: null, paymentTermsDays: 0,
    } as any);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Org" } as any);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);

    const result = await resolveVoucherDefaults({
      orgId: ORG_ID,
      vendorId: "vendor-2",
    });

    expect(result.templateId).toBe("minimal-office");
    expect(result.counterpartyName).toBe("Another Vendor");
    expect(result.vendorId).toBe("vendor-2");
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

import { deterministicFingerprint } from "../fingerprint-utils";
import { entityFingerprint, checkStale } from "../stale-detection";
import { INVOICE_MANAGED_FIELDS, QUOTE_MANAGED_FIELDS, VOUCHER_MANAGED_FIELDS } from "../managed-fields";

describe("Sprint 4.5 — Fingerprint determinism", () => {
  it("produces the same fingerprint for identical objects", () => {
    const a = { name: "Acme", email: "a@a.com", phone: "123", address: "Addr", gstin: "GST1", taxId: null, paymentTermsDays: 30 };
    const b = { name: "Acme", email: "a@a.com", phone: "123", address: "Addr", gstin: "GST1", taxId: null, paymentTermsDays: 30 };
    expect(deterministicFingerprint(a)).toBe(deterministicFingerprint(b));
  });

  it("produces different fingerprints for different entity values", () => {
    const a = { name: "Acme", email: "a@a.com" };
    const b = { name: "Beta", email: "b@b.com" };
    expect(deterministicFingerprint(a)).not.toBe(deterministicFingerprint(b));
  });
});

describe("Sprint 4.5 — Stale detection", () => {
  const allVoucherOrgKeys = { gstin: null, taxId: null, bankName: null, bankAccount: null, bankIFSC: null, businessAddress: null, defaultVoucherTemplate: "minimal-office", defaultVoucherNotes: "Old note", defaultVoucherApprovedBy: null, defaultVoucherReceivedBy: null, defaultVoucherPaymentMode: null };
  const priorBaseline = {
    resolvedAt: new Date().toISOString(),
    kind: "voucher" as const,
    entityType: "vendor" as const,
    entityId: "vendor-1",
    entityFingerprint: entityFingerprint({ name: "Old Vendor", email: "", phone: "", address: "", gstin: "", taxId: "", paymentTermsDays: 30 }),
    orgDefaultsFingerprint: deterministicFingerprint(allVoucherOrgKeys as Record<string, unknown>),
    templateId: "minimal-office",
    managedFieldKeys: [],
  };

  const matchingOrgDefaults = { defaultVoucherNotes: "Old note", defaultVoucherTemplate: "minimal-office", defaultVoucherApprovedBy: null, defaultVoucherReceivedBy: null, defaultVoucherPaymentMode: null, gstin: null, taxId: null, bankName: null, bankAccount: null, bankIFSC: null, businessAddress: null };

  it("detects entity change", () => {
    const result = checkStale(priorBaseline, { name: "New Vendor", email: "", phone: "", address: "", gstin: "", taxId: "", paymentTermsDays: 30 }, matchingOrgDefaults, "voucher");
    expect(result).toMatchObject({ stale: true, source: "entity" });
  });

  it("detects org defaults change", () => {
    const result = checkStale(priorBaseline, { name: "Old Vendor", email: "", phone: "", address: "", gstin: "", taxId: "", paymentTermsDays: 30 }, { defaultVoucherNotes: "New note", defaultVoucherTemplate: "minimal-office" }, "voucher");
    expect(result).toMatchObject({ stale: true, source: "orgDefaults" });
  });

  it("detects both changed", () => {
    const result = checkStale(priorBaseline, { name: "New Vendor", email: "", phone: "", address: "", gstin: "", taxId: "", paymentTermsDays: 30 }, { defaultVoucherNotes: "New note", defaultVoucherTemplate: "minimal-office" }, "voucher");
    expect(result).toMatchObject({ stale: true, source: "both" });
  });

  it("returns not stale when nothing changed", () => {
    const result = checkStale(priorBaseline, { name: "Old Vendor", email: "", phone: "", address: "", gstin: "", taxId: "", paymentTermsDays: 30 }, matchingOrgDefaults, "voucher");
    expect(result).toMatchObject({ stale: false });
  });

  it("gracefully handles null baseline (legacy data)", () => {
    const result = checkStale(null, { name: "Vendor" }, {}, "voucher");
    expect(result).toMatchObject({ stale: false });
  });

  it("returns not stale when entity fingerprint is null (no entity selected on baseline)", () => {
    const noEntityBaseline = { ...priorBaseline, entityId: null, entityFingerprint: null };
    const result = checkStale(noEntityBaseline, { name: "New Vendor", email: "", phone: "", address: "", gstin: "", taxId: "", paymentTermsDays: 30 }, matchingOrgDefaults, "voucher");
    expect(result).toMatchObject({ stale: false });
  });
});

describe("Sprint 4.5 — Managed field keys", () => {
  it("INVOICE_MANAGED_FIELDS contains all expected invoice fields", () => {
    expect(INVOICE_MANAGED_FIELDS).toContain("clientName");
    expect(INVOICE_MANAGED_FIELDS).toContain("templateId");
    expect(INVOICE_MANAGED_FIELDS).toContain("dueDate");
    expect(INVOICE_MANAGED_FIELDS).toContain("notes");
    expect(INVOICE_MANAGED_FIELDS).toContain("branding.companyName");
  });

  it("VOUCHER_MANAGED_FIELDS contains templateId", () => {
    expect(VOUCHER_MANAGED_FIELDS).toContain("templateId");
    expect(VOUCHER_MANAGED_FIELDS).toContain("counterpartyName");
    expect(VOUCHER_MANAGED_FIELDS).toContain("branding.accentColor");
  });

  it("QUOTE_MANAGED_FIELDS contains expected fields", () => {
    expect(QUOTE_MANAGED_FIELDS).toContain("notes");
    expect(QUOTE_MANAGED_FIELDS).toContain("issueDate");
    expect(QUOTE_MANAGED_FIELDS).toContain("validUntil");
  });
});

describe("Sprint 4.5 — Adapter baseline metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID, defaultInvoiceTemplate: "professional",
      defaultVoucherTemplate: "minimal-office", defaultVoucherNotes: "Note",
      defaultVoucherApprovedBy: "", defaultVoucherReceivedBy: "",
      defaultVoucherPaymentMode: "",
    } as any);
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Org" } as any);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue({ id: "cust-1", organizationId: ORG_ID, name: "Acme", email: "a@a.com", phone: "123", address: "Addr", gstin: null, taxId: null, paymentTermsDays: 30 } as any);
    vi.mocked(db.vendor.findFirst).mockResolvedValue({ id: "vendor-1", organizationId: ORG_ID, name: "Vendor Inc", email: null, phone: null, address: null, gstin: null, taxId: null, paymentTermsDays: 0 } as any);
  });

  it("invoice adapter returns baseline with entityFingerprint when customer preselected", async () => {
    const result = await resolveInvoiceDefaults({ orgId: ORG_ID, customerId: "cust-1" });
    expect(result.baseline).toBeDefined();
    expect(result.baseline.entityId).toBe("cust-1");
    expect(result.baseline.entityType).toBe("customer");
    expect(result.baseline.entityFingerprint).toBeTruthy();
    expect(result.baseline.kind).toBe("invoice");
  });

  it("invoice adapter returns baseline with null entityFingerprint when no customer", async () => {
    const result = await resolveInvoiceDefaults({ orgId: ORG_ID });
    expect(result.baseline).toBeDefined();
    expect(result.baseline.entityId).toBeNull();
    expect(result.baseline.entityFingerprint).toBeNull();
    expect(result.baseline.entityType).toBe("customer");
  });

  it("quote adapter returns baseline with entityFingerprint when customer preselected", async () => {
    const result = await resolveQuoteDefaults({ orgId: ORG_ID, customerId: "cust-1" });
    expect(result.baseline).toBeDefined();
    expect(result.baseline.entityId).toBe("cust-1");
    expect(result.baseline.entityFingerprint).toBeTruthy();
    expect(result.baseline.kind).toBe("quote");
  });

  it("voucher adapter returns baseline with entityFingerprint when vendor preselected", async () => {
    const result = await resolveVoucherDefaults({ orgId: ORG_ID, vendorId: "vendor-1" });
    expect(result.baseline).toBeDefined();
    expect(result.baseline.entityId).toBe("vendor-1");
    expect(result.baseline.entityType).toBe("vendor");
    expect(result.baseline.entityFingerprint).toBeTruthy();
    expect(result.baseline.kind).toBe("voucher");
  });

  it("voucher adapter returns baseline with null entityFingerprint when no vendor", async () => {
    const result = await resolveVoucherDefaults({ orgId: ORG_ID });
    expect(result.baseline).toBeDefined();
    expect(result.baseline.entityId).toBeNull();
    expect(result.baseline.entityFingerprint).toBeNull();
  });

  it("baseline orgDefaultsFingerprint is deterministic and present", async () => {
    const result = await resolveVoucherDefaults({ orgId: ORG_ID });
    expect(result.baseline.orgDefaultsFingerprint).toBeTruthy();
    const result2 = await resolveVoucherDefaults({ orgId: ORG_ID });
    expect(result2.baseline.orgDefaultsFingerprint).toBe(result.baseline.orgDefaultsFingerprint);
  });
});
