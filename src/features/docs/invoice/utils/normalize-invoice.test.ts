import { vi } from "vitest";

vi.mock("@/features/docs/invoice/constants", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/docs/invoice/constants")>();
  return {
    ...original,
    invoiceDefaultValues: {
      templateId: "professional",
      branding: {
        companyName: "Northfield Trading Co.",
        address: "18 Market Road, Kozhikode",
        email: "accounts@northfield.example",
        phone: "+91 98765 43210",
        accentColor: "#c69854",
      },
      website: "www.northfield.example",
      businessTaxId: "GSTIN 32ABCDE1234F1Z6",
      clientName: "Axis PeopleX Pvt. Ltd.",
      clientAddress: "4th Floor, Grand Square, Kochi",
      shippingAddress: "Warehouse Bay 3, Marine Drive, Kochi",
      clientEmail: "finance@axispeoplex.example",
      clientPhone: "+91 98470 12000",
      clientTaxId: "GSTIN 32AAACA1122R1ZV",
      invoiceNumber: "",
      invoiceDate: "2026-03-26",
      dueDate: "2026-04-02",
      placeOfSupply: "Kerala",
      extraCharges: "1500",
      invoiceLevelDiscount: "500",
      amountPaid: "15000",
      notes: "Thank you for the continued engagement. Please reference the invoice number with your remittance.",
      terms: "Payment due within 7 days. Late payments may be subject to a finance charge after prior notice.",
      bankName: "Federal Bank",
      bankAccountNumber: "122001004281",
      bankIfsc: "FDRL0001220",
      authorizedBy: "Anita Thomas",
      lineItems: [
        {
          description: "HR outsourcing retainer for March 2026",
          inventoryItemId: "",
          quantity: "1",
          unitPrice: "32000",
          taxRate: "18",
          discountAmount: "2000",
        },
        {
          description: "Recruitment coordination support",
          inventoryItemId: "",
          quantity: "2",
          unitPrice: "7500",
          taxRate: "18",
          discountAmount: "0",
        },
      ],
      visibility: {
        showAddress: true,
        showEmail: true,
        showPhone: true,
        showWebsite: true,
        showBusinessTaxId: true,
        showClientAddress: true,
        showClientEmail: true,
        showClientPhone: true,
        showClientTaxId: true,
        showShippingAddress: true,
        showDueDate: true,
        showPlaceOfSupply: true,
        showNotes: true,
        showTerms: true,
        showBankDetails: true,
        showSignature: true,
        showPaymentSummary: true,
      },
    },
  };
});

import { invoiceDefaultValues } from "@/features/docs/invoice/constants";
import { normalizeInvoice } from "@/features/docs/invoice/utils/normalize-invoice";

describe("normalizeInvoice", () => {
  it("computes invoice totals, payment, and balance due", () => {
    const document = normalizeInvoice(invoiceDefaultValues);

    expect(document.subtotal).toBe(45000);
    expect(document.totalDiscount).toBe(2000);
    expect(document.totalTax).toBe(8100);
    expect(document.extraCharges).toBe(1500);
    expect(document.invoiceLevelDiscount).toBe(500);
    expect(document.grandTotal).toBe(54100);
    expect(document.amountPaid).toBe(15000);
    expect(document.balanceDue).toBe(39100);
    expect(document.amountInWords).toBe("Rupees fifty-four thousand one hundred only");
  });

  it("hides optional footer and client blocks through visibility pruning", () => {
    const document = normalizeInvoice({
      ...invoiceDefaultValues,
      visibility: {
        ...invoiceDefaultValues.visibility,
        showClientEmail: false,
        showClientPhone: false,
        showPaymentSummary: false,
        showNotes: false,
        showTerms: false,
      },
    });

    expect(document.clientEmail).toBeUndefined();
    expect(document.clientPhone).toBeUndefined();
    expect(document.notes).toBeUndefined();
    expect(document.terms).toBeUndefined();
    expect(document.visibility.showPaymentSummary).toBe(false);
  });

  it('shows "Draft" when invoiceNumber is empty', () => {
    const document = normalizeInvoice(invoiceDefaultValues);
    expect(document.invoiceNumber).toBe("Draft");
  });

  it("shows the real invoice number when one is assigned", () => {
    const document = normalizeInvoice({
      ...invoiceDefaultValues,
      invoiceNumber: "INV-2026-0042",
    });
    expect(document.invoiceNumber).toBe("INV-2026-0042");
  });

  it("shows the trimmed invoice number when whitespace is present", () => {
    const document = normalizeInvoice({
      ...invoiceDefaultValues,
      invoiceNumber: "  INV-2026-0073  ",
    });
    expect(document.invoiceNumber).toBe("INV-2026-0073");
  });

  it('shows "Draft" when invoiceNumber is only whitespace', () => {
    const document = normalizeInvoice({
      ...invoiceDefaultValues,
      invoiceNumber: "   ",
    });
    expect(document.invoiceNumber).toBe("Draft");
  });
});
