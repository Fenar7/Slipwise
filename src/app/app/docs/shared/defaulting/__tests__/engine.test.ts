import { describe, it, expect, beforeEach, vi } from "vitest";
import { resolveInvoiceDefaults, resolveVoucherDefaults, resolveQuoteDefaults } from "../engine";
import { db } from "@/lib/db";

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

describe("Shared Client Defaulting Engine", () => {
  const mockOrgId = "org_123";
  const mockCustomerId = "cust_456";
  const mockVendorId = "vendor_789";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolveInvoiceDefaults", () => {
    it("resolves invoice defaults from org defaults only when no customer", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        defaultInvoiceTemplate: "professional",
        defaultInvoiceNotes: "Test notes",
        defaultInvoiceTerms: "Net 30",
        defaultInvoiceAuthorizedBy: "John Doe",
        gstin: "29ABCDE1234F1Z5",
        bankName: "Test Bank",
        bankAccount: "1234567890",
        bankIFSC: "TEST0001",
        businessAddress: "123 Test St",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveInvoiceDefaults({
        orgId: mockOrgId,
      });

      expect(result.customerId).toBe("");
      expect(result.clientName).toBe("");
      expect(result.templateId).toBe("professional");
      expect(result.notes).toBe("Test notes");
      expect(result.terms).toBe("Net 30");
      expect(result.authorizedBy).toBe("John Doe");
      expect(result.businessTaxId).toBe("29ABCDE1234F1Z5");
      expect(result.bankName).toBe("Test Bank");
    });

    it("template query param overrides org default", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        defaultInvoiceTemplate: "professional",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveInvoiceDefaults({
        orgId: mockOrgId,
        templateParam: "minimal",
      });

      expect(result.templateId).toBe("minimal");
    });

    it("resolves customer-linked defaults when customer is provided", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        defaultInvoiceTemplate: "professional",
        defaultInvoiceNotes: "Org notes",
        gstin: "29ABCDE1234F1Z5",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: mockCustomerId,
        organizationId: mockOrgId,
        name: "Test Customer",
        email: "customer@test.com",
        phone: "1234567890",
        address: "456 Customer Ave",
        gstin: "27XYZAB5678G1H9",
        paymentTermsDays: 45,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveInvoiceDefaults({
        orgId: mockOrgId,
        customerId: mockCustomerId,
      });

      expect(result.customerId).toBe(mockCustomerId);
      expect(result.clientName).toBe("Test Customer");
      expect(result.clientEmail).toBe("customer@test.com");
      expect(result.clientTaxId).toBe("27XYZAB5678G1H9");
      expect(result.placeOfSupply).toBe("Maharashtra");
      expect(result.notes).toBe("Org notes");
    });

    it("throws error for invalid customer", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.customer.findFirst).mockResolvedValue(null);

      await expect(
        resolveInvoiceDefaults({
          orgId: mockOrgId,
          customerId: "invalid_customer",
        })
      ).rejects.toThrow("Customer not found or does not belong to this organisation.");
    });
  });

  describe("resolveVoucherDefaults", () => {
    it("resolves voucher defaults from org defaults only when no vendor", async () => {
      vi.mocked(db.organization.findUnique).mockResolvedValue({
        id: mockOrgId,
        name: "Test Org",
      } as never);

      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        defaultVoucherTemplate: "minimal-office",
        defaultVoucherNotes: "Voucher notes",
        defaultVoucherApprovedBy: "Manager",
        defaultVoucherReceivedBy: "Accountant",
        defaultVoucherPaymentMode: "Cash",
        businessAddress: "789 Org Blvd",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.brandingProfile.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        accentColor: "#ff0000",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveVoucherDefaults({
        orgId: mockOrgId,
      });

      expect(result.vendorId).toBe("");
      expect(result.counterpartyName).toBe("");
      expect(result.templateId).toBe("minimal-office");
      expect(result.notes).toBe("Voucher notes");
      expect(result.approvedBy).toBe("Manager");
      expect(result.receivedBy).toBe("Accountant");
      expect(result.paymentMode).toBe("Cash");
      expect(result.branding.companyName).toBe("Test Org");
      expect(result.branding.accentColor).toBe("#ff0000");
    });

    it("template query param overrides org default", async () => {
      vi.mocked(db.organization.findUnique).mockResolvedValue({
        id: mockOrgId,
        name: "Test Org",
      } as never);

      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        defaultVoucherTemplate: "minimal-office",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.brandingProfile.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        accentColor: "#dc2626",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveVoucherDefaults({
        orgId: mockOrgId,
        templateParam: "custom-voucher",
      });

      expect(result.templateId).toBe("custom-voucher");
    });

    it("resolves vendor-linked defaults when vendor is provided", async () => {
      vi.mocked(db.organization.findUnique).mockResolvedValue({
        id: mockOrgId,
        name: "Test Org",
      } as never);

      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        defaultVoucherNotes: "Org voucher notes",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.brandingProfile.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        accentColor: "#dc2626",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.vendor.findFirst).mockResolvedValue({
        id: mockVendorId,
        organizationId: mockOrgId,
        name: "Test Vendor",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveVoucherDefaults({
        orgId: mockOrgId,
        vendorId: mockVendorId,
      });

      expect(result.vendorId).toBe(mockVendorId);
      expect(result.counterpartyName).toBe("Test Vendor");
      expect(result.notes).toBe("Org voucher notes");
    });

    it("throws error for invalid vendor", async () => {
      vi.mocked(db.organization.findUnique).mockResolvedValue({
        id: mockOrgId,
        name: "Test Org",
      } as never);

      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);
      vi.mocked(db.vendor.findFirst).mockResolvedValue(null);

      await expect(
        resolveVoucherDefaults({
          orgId: mockOrgId,
          vendorId: "invalid_vendor",
        })
      ).rejects.toThrow("Vendor not found or does not belong to this organisation.");
    });
  });

  describe("resolveQuoteDefaults", () => {
    it("resolves quote defaults from org defaults only when no customer", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        quoteValidityDays: 30,
        defaultQuoteNotes: "Quote notes",
        defaultQuoteTerms: "Quote terms",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveQuoteDefaults({
        orgId: mockOrgId,
      });

      expect(result.customerId).toBe("");
      expect(result.clientName).toBe("");
      expect(result.notes).toBe("Quote notes");
      expect(result.termsAndConditions).toBe("Quote terms");
      expect(result.issueDate).toBeTruthy();
      expect(result.validUntil).toBeTruthy();
    });

    it("uses default validity days when not configured", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveQuoteDefaults({
        orgId: mockOrgId,
      });

      const issueDate = new Date(result.issueDate);
      const validUntil = new Date(result.validUntil);
      const daysDiff = Math.round((validUntil.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBe(14);
    });

    it("resolves customer-linked defaults when customer is provided", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        quoteValidityDays: 21,
        defaultQuoteNotes: "Org quote notes",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: mockCustomerId,
        organizationId: mockOrgId,
        name: "Quote Customer",
        email: "quote@test.com",
        phone: "9876543210",
        address: "321 Quote St",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      const result = await resolveQuoteDefaults({
        orgId: mockOrgId,
        customerId: mockCustomerId,
      });

      expect(result.customerId).toBe(mockCustomerId);
      expect(result.clientName).toBe("Quote Customer");
      expect(result.clientEmail).toBe("quote@test.com");
      expect(result.clientPhone).toBe("9876543210");
      expect(result.notes).toBe("Org quote notes");
    });

    it("throws error for invalid customer", async () => {
      vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
        id: "1",
        organizationId: mockOrgId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never);

      vi.mocked(db.customer.findFirst).mockResolvedValue(null);

      await expect(
        resolveQuoteDefaults({
          orgId: mockOrgId,
          customerId: "invalid_customer",
        })
      ).rejects.toThrow("Customer not found or does not belong to this organisation.");
    });
  });
});
