import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    customer: {
      findFirst: vi.fn(),
    },
    quote: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireOrgContext: vi.fn(),
}));

vi.mock("@/lib/plans/enforcement", () => ({
  checkLimit: vi.fn(),
}));

vi.mock("@/lib/plans/usage", () => ({
  incrementUsage: vi.fn(),
}));

vi.mock("@/lib/quotes", () => ({
  createQuote: vi.fn(),
  updateQuote: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/document-events", () => ({
  emitQuoteEvent: vi.fn(),
}));

vi.mock("@/lib/docs-vault", () => ({
  syncQuoteToIndex: vi.fn(),
  removeDocumentFromIndex: vi.fn(),
}));

import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkLimit } from "@/lib/plans/enforcement";
import { createQuote, updateQuote } from "@/lib/quotes";
import { createQuoteAction, updateQuoteAction } from "../actions";

const ORG_ID = "org-1";
const USER_ID = "user-1";

describe("quote actions security and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOrgContext).mockResolvedValue({
      orgId: ORG_ID,
      userId: USER_ID,
      role: "admin",
    });
    vi.mocked(checkLimit).mockResolvedValue({ allowed: true, current: 0, limit: 100 });
  });

  describe("createQuoteAction", () => {
    it("rejects cross-org customer IDs", async () => {
      // Customer lookup returns null if not found in active org
      vi.mocked(db.customer.findFirst).mockResolvedValue(null);

      const result = await createQuoteAction({
        customerId: "foreign-customer-id",
        title: "Test Quote",
        lineItems: [{ description: "Consulting", quantity: 1, unitPrice: 100, taxRate: 0 }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Customer not found or does not belong to this organisation");
      expect(createQuote).not.toHaveBeenCalled();
    });

    it("allows valid in-org customer IDs to create quotes", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: "cust-1",
        organizationId: ORG_ID,
        name: "In-Org Customer",
      } as any);

      vi.mocked(createQuote).mockResolvedValue({
        id: "qte-1",
        quoteNumber: "QTE-00001",
        title: "Test Quote",
        status: "DRAFT",
        issueDate: new Date(),
        totalAmount: 100,
        currency: "INR",
      } as any);

      const result = await createQuoteAction({
        customerId: "cust-1",
        title: "Test Quote",
        lineItems: [{ description: "Consulting", quantity: 1, unitPrice: 100, taxRate: 0 }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("qte-1");
      }
      expect(createQuote).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG_ID,
          customerId: "cust-1",
          title: "Test Quote",
        }),
      );
    });
  });

  describe("updateQuoteAction", () => {
    it("rejects cross-org customer IDs on update", async () => {
      // Customer lookup returns null if not found in active org
      vi.mocked(db.customer.findFirst).mockResolvedValue(null);

      const result = await updateQuoteAction("quote-1", {
        customerId: "foreign-customer-id",
        title: "Updated Title",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Customer not found or does not belong to this organisation");
      expect(updateQuote).not.toHaveBeenCalled();
    });

    it("allows valid in-org customer IDs to update quotes", async () => {
      vi.mocked(db.customer.findFirst).mockResolvedValue({
        id: "cust-1",
        organizationId: ORG_ID,
        name: "In-Org Customer",
      } as any);

      vi.mocked(db.quote.findUnique).mockResolvedValue({
        id: "quote-1",
        quoteNumber: "QTE-00001",
        title: "Test Quote",
        status: "DRAFT",
        issueDate: new Date(),
        totalAmount: 100,
        currency: "INR",
        archivedAt: null,
      } as any);

      vi.mocked(updateQuote).mockResolvedValue({
        id: "quote-1",
        title: "Updated Title",
      } as any);

      const result = await updateQuoteAction("quote-1", {
        customerId: "cust-1",
        title: "Updated Title",
      });

      expect(result.success).toBe(true);
      expect(updateQuote).toHaveBeenCalledWith(
        "quote-1",
        ORG_ID,
        USER_ID,
        expect.objectContaining({
          customerId: "cust-1",
          title: "Updated Title",
        }),
      );
    });
  });
});
