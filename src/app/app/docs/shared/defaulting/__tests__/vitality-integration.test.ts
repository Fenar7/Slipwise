import { describe, expect, it } from "vitest";
import { resolveInvoiceDefaults } from "@/app/app/docs/shared/defaulting/adapters/invoice-adapter";
import { db } from "@/lib/db";

describe("Live Vitality Verification", () => {
  const orgId = "org_slipwise_main";

  it("verifies organization defaults are correctly resolved", async () => {
    const invoiceDefaults = await resolveInvoiceDefaults({ orgId });

    expect(invoiceDefaults.branding.companyName).toBe("Slipwise Technologies Pvt. Ltd.");
    expect(invoiceDefaults.branding.address).toBe("Suite 402, Cyberpark SEZ, Kozhikode, Kerala 673016");
    expect(invoiceDefaults.businessTaxId).toBe("32AAACS1234F1Z5");
    expect(invoiceDefaults.bankName).toBe("HDFC Bank Ltd.");
    expect(invoiceDefaults.bankAccountNumber).toBe("50200012345678");
    expect(invoiceDefaults.bankIfsc).toBe("HDFC0001234");
    expect(invoiceDefaults.templateId).toBe("professional");
    expect(invoiceDefaults.notes).toContain("Thank you for your business");
  });

  it("verifies customer prefill resolves correct entity data", async () => {
    const customer = await db.customer.findFirst({
      where: { organizationId: orgId, name: { contains: "Acme Global" } },
    });

    expect(customer).not.toBeNull();
    if (!customer) return;

    const result = await resolveInvoiceDefaults({ orgId, customerId: customer.id });

    expect(result.clientName).toBe("Acme Global Logistics Pvt. Ltd.");
    expect(result.clientTaxId).toBe("32AACCA9876Q1Z2");
    expect(result.placeOfSupply).toBe("Kerala");
    expect(result.clientAddress).toContain("Cochin Industrial Area");
  });

  it("verifies seeded inventory and invoices exist in database", async () => {
    const [invCount, custCount, itemCount] = await Promise.all([
      db.invoice.count({ where: { organizationId: orgId } }),
      db.customer.count({ where: { organizationId: orgId } }),
      db.inventoryItem.count({ where: { orgId } }),
    ]);

    expect(custCount).toBe(3);
    expect(invCount).toBe(2);
    expect(itemCount).toBe(3);
  });
});
