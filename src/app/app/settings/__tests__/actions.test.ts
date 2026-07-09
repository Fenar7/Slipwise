import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    orgDefaults: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    brandingProfile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
  requireRole: vi.fn(),
}));

import { requireOrgContext, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { getOrgSettings, saveOrgBranding, saveOrgFinancials } from "../actions";

const ORG_ID = "org-1";

describe("organization settings actions security and scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOrgSettings", () => {
    it("scopes read queries to the active organization from authenticated context", async () => {
      vi.mocked(requireOrgContext).mockResolvedValue({
        orgId: ORG_ID,
        userId: "user-1",
        role: "admin",
      } as any);

      await getOrgSettings();

      expect(requireOrgContext).toHaveBeenCalled();
      expect(db.brandingProfile.findUnique).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
      expect(db.orgDefaults.findUnique).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
    });
  });

  describe("saveOrgBranding", () => {
    it("rejects unauthorized access when non-admin role is supplied", async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error("Insufficient permissions"));

      await expect(
        saveOrgBranding({
          accentColor: "#ffffff",
          fontFamily: "Inter",
        })
      ).rejects.toThrow("Insufficient permissions");

      expect(requireRole).toHaveBeenCalledWith("admin");
      expect(db.brandingProfile.upsert).not.toHaveBeenCalled();
    });

    it("saves branding configuration strictly for the derived orgId", async () => {
      vi.mocked(requireRole).mockResolvedValue({
        orgId: ORG_ID,
        userId: "user-1",
        role: "admin",
      } as any);

      await saveOrgBranding({
        accentColor: "#dc2626",
        fontFamily: "Roboto",
      });

      expect(requireRole).toHaveBeenCalledWith("admin");
      expect(db.brandingProfile.upsert).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        create: { organizationId: ORG_ID, accentColor: "#dc2626", fontFamily: "Roboto" },
        update: { accentColor: "#dc2626", fontFamily: "Roboto" },
      });
    });
  });

  describe("saveOrgFinancials", () => {
    it("rejects unauthorized settings changes if role verification fails", async () => {
      vi.mocked(requireRole).mockRejectedValue(new Error("Insufficient permissions"));

      await expect(
        saveOrgFinancials({
          bankName: "HDFC",
          bankAccount: "999",
          bankIFSC: "HDFC0001",
          taxId: "PAN999",
          gstin: "27AAACA1122R1ZV",
          businessAddress: "India",
          defaultInvoiceNotes: "Notes",
          defaultInvoiceTerms: "Terms",
          defaultInvoiceAuthorizedBy: "Jane",
          defaultQuoteNotes: "Quote Notes",
          defaultQuoteTerms: "Quote Terms",
        })
      ).rejects.toThrow("Insufficient permissions");

      expect(requireRole).toHaveBeenCalledWith("admin");
      expect(db.orgDefaults.upsert).not.toHaveBeenCalled();
    });

    it("persists financials and quote defaults for the derived orgId", async () => {
      vi.mocked(requireRole).mockResolvedValue({
        orgId: ORG_ID,
        userId: "user-1",
        role: "admin",
      } as any);

      await saveOrgFinancials({
        bankName: "ICICI Bank",
        bankAccount: "1001",
        bankIFSC: "ICIC0001",
        taxId: "PAN1001",
        gstin: "32ABCDE1234F1Z6",
        businessAddress: "Kochi, Kerala",
        defaultInvoiceNotes: "Thank you",
        defaultInvoiceTerms: "Net 30",
        defaultInvoiceAuthorizedBy: "Operator",
        defaultQuoteNotes: "Valid for 15 days",
        defaultQuoteTerms: "50% upfront",
      });

      expect(requireRole).toHaveBeenCalledWith("admin");
      expect(db.orgDefaults.upsert).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        create: expect.objectContaining({
          organizationId: ORG_ID,
          bankName: "ICICI Bank",
          defaultQuoteNotes: "Valid for 15 days",
          defaultQuoteTerms: "50% upfront",
        }),
        update: expect.objectContaining({
          bankName: "ICICI Bank",
          defaultQuoteNotes: "Valid for 15 days",
          defaultQuoteTerms: "50% upfront",
        }),
      });
    });
  });
});
