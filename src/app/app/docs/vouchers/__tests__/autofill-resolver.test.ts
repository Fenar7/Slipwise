import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    organization: {
      findUnique: vi.fn(),
    },
    orgDefaults: {
      findUnique: vi.fn(),
    },
    brandingProfile: {
      findUnique: vi.fn(),
    },
    vendor: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
}));

import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveVoucherAutofill } from "../autofill-resolver";

const ORG_ID = "org-1";

describe("resolveVoucherAutofill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgContext).mockResolvedValue({
      orgId: ORG_ID,
      userId: "user-1",
      role: "admin",
    });
  });

  it("returns org-scoped vendor voucher autofill data", async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue({
      id: ORG_ID,
      name: "Acme Corp",
    } as any);

    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      businessAddress: "123 Business Rd",
      defaultVoucherNotes: "Manager approval required",
      defaultVoucherApprovedBy: "Jane Approved",
      defaultVoucherReceivedBy: "John Received",
      defaultVoucherPaymentMode: "Bank Transfer",
      defaultVoucherTemplate: "minimal-office",
    } as any);

    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue({
      accentColor: "#dc2626",
    } as any);

    vi.mocked(db.vendor.findFirst).mockResolvedValue({
      id: "vendor-123",
      organizationId: ORG_ID,
      name: "Supplier Alpha",
    } as any);

    const result = await resolveVoucherAutofill({ vendorId: "vendor-123" });

    expect(result.vendorId).toBe("vendor-123");
    expect(result.counterpartyName).toBe("Supplier Alpha");
    expect(result.notes).toBe("Manager approval required");
    expect(result.approvedBy).toBe("Jane Approved");
    expect(result.receivedBy).toBe("John Received");
    expect(result.paymentMode).toBe("Bank Transfer");
    expect(result.branding.companyName).toBe("Acme Corp");
    expect(result.branding.address).toBe("123 Business Rd");
    expect(result.branding.accentColor).toBe("#dc2626");

    expect(db.vendor.findFirst).toHaveBeenCalledWith({
      where: { id: "vendor-123", organizationId: ORG_ID },
    });
  });

  it("rejects cross-org vendor access", async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue({ name: "Acme Corp" } as any);
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);
    vi.mocked(db.vendor.findFirst).mockResolvedValue(null);

    await expect(
      resolveVoucherAutofill({ vendorId: "foreign-vendor-id" }),
    ).rejects.toThrow("Vendor not found or does not belong to this organisation");
  });

  it("returns safe blanks and org defaults when no vendor selected", async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue({
      id: ORG_ID,
      name: "Acme Corp",
    } as any);

    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      businessAddress: "123 Business Rd",
      defaultVoucherNotes: "Global Notes",
      defaultVoucherApprovedBy: "Global Approver",
      defaultVoucherReceivedBy: "Global Receiver",
      defaultVoucherPaymentMode: "UPI",
    } as any);

    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue({
      accentColor: "#10b981",
    } as any);

    const result = await resolveVoucherAutofill({});

    expect(result.vendorId).toBe("");
    expect(result.counterpartyName).toBe("");
    expect(result.notes).toBe("Global Notes");
    expect(result.approvedBy).toBe("Global Approver");
    expect(result.receivedBy).toBe("Global Receiver");
    expect(result.paymentMode).toBe("UPI");
    expect(result.branding.companyName).toBe("Acme Corp");
    expect(result.branding.address).toBe("123 Business Rd");
    expect(result.branding.accentColor).toBe("#10b981");
  });

  it("does not return any demo/sample company content", async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue(null);
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.brandingProfile.findUnique).mockResolvedValue(null);

    const result = await resolveVoucherAutofill({});

    const allValues = [
      result.counterpartyName,
      result.notes,
      result.approvedBy,
      result.receivedBy,
      result.paymentMode,
      result.branding.companyName,
      result.branding.address,
      result.branding.email,
      result.branding.phone,
    ];

    for (const val of allValues) {
      expect(val).not.toContain("Northfield");
      expect(val).not.toContain("Axis");
      expect(val).not.toContain("Anita Thomas");
      expect(val).not.toContain("Federal Bank");
    }
  });
});
