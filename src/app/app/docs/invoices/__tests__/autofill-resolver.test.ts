import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    orgDefaults: {
      findUnique: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
}));

import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveInvoiceAutofill } from "../autofill-resolver";

const ORG_ID = "org-1";

describe("resolveInvoiceAutofill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgContext).mockResolvedValue({
      orgId: ORG_ID,
      userId: "user-1",
      role: "admin",
    });
  });

  it("returns org-scoped customer autofill data", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      gstin: "32ABCDE1234F1Z6",
      taxId: null,
      bankName: "HDFC Bank",
      bankAccount: "50100012345678",
      bankIFSC: "HDFC0001234",
      businessAddress: "12 Business Park, Kochi",
      defaultInvoiceTemplate: "professional",
      defaultInvoiceNotes: null,
      defaultInvoiceTerms: null,
      defaultInvoiceAuthorizedBy: null,
    } as any);

    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Acme Corp",
      email: "billing@acme.com",
      phone: "+91 98765 43210",
      address: "45 Client Street, Mumbai",
      taxId: "ABCDE1234F",
      gstin: "27AAACA1122R1ZV",
      paymentTermsDays: 45,
    } as any);

    const result = await resolveInvoiceAutofill({ customerId: "cust-1" });

    expect(result.customerId).toBe("cust-1");
    expect(result.clientName).toBe("Acme Corp");
    expect(result.clientAddress).toBe("45 Client Street, Mumbai");
    expect(result.shippingAddress).toBe("45 Client Street, Mumbai");
    expect(result.clientEmail).toBe("billing@acme.com");
    expect(result.clientPhone).toBe("+91 98765 43210");
    expect(result.clientTaxId).toBe("27AAACA1122R1ZV");
    expect(result.businessTaxId).toBe("32ABCDE1234F1Z6");
    expect(result.bankName).toBe("HDFC Bank");
    expect(result.bankAccountNumber).toBe("50100012345678");
    expect(result.bankIfsc).toBe("HDFC0001234");

    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "cust-1", organizationId: ORG_ID },
    });
  });

  it("rejects cross-org customer access", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    // findFirst returns null — customer doesn't belong to this org
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    await expect(
      resolveInvoiceAutofill({ customerId: "foreign-cust" }),
    ).rejects.toThrow("Customer not found or does not belong to this organisation");
  });

  it("computes dueDate from customer.paymentTermsDays", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Test Co",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      gstin: null,
      paymentTermsDays: 60,
    } as any);

    const result = await resolveInvoiceAutofill({ customerId: "cust-1" });

    const invoice = new Date(result.invoiceDate);
    const due = new Date(result.dueDate);
    const diffDays = Math.round((due.getTime() - invoice.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(60);
  });

  it("falls back to 30 days when paymentTermsDays is absent", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Test Co",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      gstin: null,
      paymentTermsDays: null,
    } as any);

    const result = await resolveInvoiceAutofill({ customerId: "cust-1" });

    const invoice = new Date(result.invoiceDate);
    const due = new Date(result.dueDate);
    const diffDays = Math.round((due.getTime() - invoice.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  it("resolves template from query param over org default", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultInvoiceTemplate: "minimal",
    } as any);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Test",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      gstin: null,
      paymentTermsDays: 30,
    } as any);

    const result = await resolveInvoiceAutofill({
      customerId: "cust-1",
      templateParam: "bold-brand",
    });

    expect(result.templateId).toBe("bold-brand");
  });

  it("falls back to org default template when no query param", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultInvoiceTemplate: "minimal",
    } as any);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Test",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      gstin: null,
      paymentTermsDays: 30,
    } as any);

    const result = await resolveInvoiceAutofill({ customerId: "cust-1" });

    expect(result.templateId).toBe("minimal");
  });

  it("resolves tax fields with correct priority: gstin > taxId", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    // Customer with both gstin and taxId
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Test",
      email: null,
      phone: null,
      address: null,
      taxId: "PAN12345",
      gstin: "27AAACA1122R1ZV",
      paymentTermsDays: 30,
    } as any);

    const result = await resolveInvoiceAutofill({ customerId: "cust-1" });

    // gstin should take priority
    expect(result.clientTaxId).toBe("27AAACA1122R1ZV");
  });

  it("falls back to taxId when gstin is absent", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Test",
      email: null,
      phone: null,
      address: null,
      taxId: "PAN12345",
      gstin: null,
      paymentTermsDays: 30,
    } as any);

    const result = await resolveInvoiceAutofill({ customerId: "cust-1" });

    expect(result.clientTaxId).toBe("PAN12345");
  });

  it("extracts placeOfSupply from GSTIN state code", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-1",
      organizationId: ORG_ID,
      name: "Test",
      email: null,
      phone: null,
      address: null,
      taxId: null,
      gstin: "32AAACA1122R1ZV",
      paymentTermsDays: 30,
    } as any);

    const result = await resolveInvoiceAutofill({ customerId: "cust-1" });

    expect(result.placeOfSupply).toBe("Kerala");
  });

  it("returns safe blanks when no customer selected", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      gstin: null,
      taxId: null,
      bankName: null,
      bankAccount: null,
      bankIFSC: null,
      businessAddress: null,
      defaultInvoiceTemplate: null,
      defaultInvoiceNotes: null,
      defaultInvoiceTerms: null,
      defaultInvoiceAuthorizedBy: null,
    } as any);

    const result = await resolveInvoiceAutofill({});

    expect(result.customerId).toBe("");
    expect(result.clientName).toBe("");
    expect(result.clientAddress).toBe("");
    expect(result.clientTaxId).toBe("");
    expect(result.businessTaxId).toBe("");
    expect(result.bankName).toBe("");
    expect(result.notes).toBe("");
    expect(result.terms).toBe("");
    expect(result.templateId).toBe("professional");
  });

  it("uses org defaults for notes, terms, authorizedBy when present", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      defaultInvoiceTemplate: "minimal",
      defaultInvoiceNotes: "Thank you for your business.",
      defaultInvoiceTerms: "Net 30 payment terms apply.",
      defaultInvoiceAuthorizedBy: "Jane Doe",
    } as any);

    const result = await resolveInvoiceAutofill({});

    expect(result.notes).toBe("Thank you for your business.");
    expect(result.terms).toBe("Net 30 payment terms apply.");
    expect(result.authorizedBy).toBe("Jane Doe");
  });

  it("does not return any demo/sample company content", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    // No customer — should get safe blanks
    const result = await resolveInvoiceAutofill({});

    const allValues = [
      result.clientName,
      result.clientAddress,
      result.clientEmail,
      result.clientPhone,
      result.clientTaxId,
      result.businessTaxId,
      result.notes,
      result.terms,
      result.authorizedBy,
      result.bankName,
      result.bankAccountNumber,
      result.bankIfsc,
      result.branding.companyName,
      result.branding.address,
    ];

    for (const val of allValues) {
      expect(val).not.toContain("Northfield");
      expect(val).not.toContain("Axis");
      expect(val).not.toContain("Anita Thomas");
      expect(val).not.toContain("Federal Bank");
    }
  });
});
