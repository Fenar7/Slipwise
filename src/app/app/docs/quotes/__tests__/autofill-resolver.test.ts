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
import { resolveQuoteAutofill } from "../autofill-resolver";

const ORG_ID = "org-1";

describe("resolveQuoteAutofill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgContext).mockResolvedValue({
      orgId: ORG_ID,
      userId: "user-1",
      role: "admin",
    });
  });

  it("returns org-scoped customer quote autofill data", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      quoteValidityDays: 14,
      defaultQuoteNotes: "Your initial quote notes.",
      defaultQuoteTerms: "Standard 50/50 payment terms.",
    } as any);

    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-123",
      organizationId: ORG_ID,
      name: "Client Alpha",
      email: "alpha@example.com",
      phone: "+91 99999 88888",
      address: "100 Innovation Way, Bangalore",
    } as any);

    const result = await resolveQuoteAutofill({ customerId: "cust-123" });

    expect(result.customerId).toBe("cust-123");
    expect(result.clientName).toBe("Client Alpha");
    expect(result.clientEmail).toBe("alpha@example.com");
    expect(result.clientPhone).toBe("+91 99999 88888");
    expect(result.clientAddress).toBe("100 Innovation Way, Bangalore");
    expect(result.notes).toBe("Your initial quote notes.");
    expect(result.termsAndConditions).toBe("Standard 50/50 payment terms.");

    expect(db.customer.findFirst).toHaveBeenCalledWith({
      where: { id: "cust-123", organizationId: ORG_ID },
    });
  });

  it("rejects cross-org customer access", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    await expect(
      resolveQuoteAutofill({ customerId: "foreign-cust-id" }),
    ).rejects.toThrow("Customer not found or does not belong to this organisation");
  });

  it("computes validUntil from quoteValidityDays org default", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      quoteValidityDays: 20,
    } as any);

    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-123",
      organizationId: ORG_ID,
      name: "Client Alpha",
    } as any);

    const result = await resolveQuoteAutofill({ customerId: "cust-123" });

    const issue = new Date(result.issueDate);
    const valid = new Date(result.validUntil);
    const diffDays = Math.round((valid.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(20);
  });

  it("falls back to 14 days when quoteValidityDays is absent", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue({
      id: "cust-123",
      organizationId: ORG_ID,
      name: "Client Alpha",
    } as any);

    const result = await resolveQuoteAutofill({ customerId: "cust-123" });

    const issue = new Date(result.issueDate);
    const valid = new Date(result.validUntil);
    const diffDays = Math.round((valid.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(14);
  });

  it("returns safe blanks and org defaults when no customer selected", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue({
      organizationId: ORG_ID,
      quoteValidityDays: 10,
      defaultQuoteNotes: "Global Quote Notes",
      defaultQuoteTerms: "Global Quote Terms",
    } as any);

    const result = await resolveQuoteAutofill({});

    expect(result.customerId).toBe("");
    expect(result.clientName).toBe("");
    expect(result.clientEmail).toBe("");
    expect(result.clientPhone).toBe("");
    expect(result.clientAddress).toBe("");
    expect(result.notes).toBe("Global Quote Notes");
    expect(result.termsAndConditions).toBe("Global Quote Terms");
  });

  it("does not return any demo/sample company content", async () => {
    vi.mocked(db.orgDefaults.findUnique).mockResolvedValue(null);
    vi.mocked(db.customer.findFirst).mockResolvedValue(null);

    const result = await resolveQuoteAutofill({});

    const allValues = [
      result.clientName,
      result.clientEmail,
      result.clientPhone,
      result.clientAddress,
      result.notes,
      result.termsAndConditions,
    ];

    for (const val of allValues) {
      expect(val).not.toContain("Northfield");
      expect(val).not.toContain("Axis");
      expect(val).not.toContain("Anita Thomas");
      expect(val).not.toContain("Federal Bank");
    }
  });
});
