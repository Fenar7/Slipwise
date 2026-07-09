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

import { fireEvent, render, screen } from "@testing-library/react";
import InvoicePage from "@/app/invoice/page";

describe("Invoice workspace", () => {
  it("renders the interactive invoice builder", () => {
    render(<InvoicePage />);

    expect(screen.getByText(/template and branding/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /professional/i })).toBeInTheDocument();
    expect(screen.getAllByText(/preview/i).length).toBeGreaterThan(0);
  });

  it("updates the preview when line items change", () => {
    render(<InvoicePage />);

    fireEvent.change(screen.getByLabelText(/amount paid/i), {
      target: { value: "20000" },
    });

    expect(screen.getByText(/₹34,100.00/i)).toBeInTheDocument();
  });

  it("hides notes when the notes visibility toggle is disabled", () => {
    render(<InvoicePage />);

    expect(
      screen.getByText(/thank you for the continued engagement/i),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("switch", {
        name: /notes/i,
      }),
    );

    expect(
      screen.queryByText(/thank you for the continued engagement/i),
    ).not.toBeInTheDocument();
  });

  it("hides the payment summary block when the visibility toggle is disabled", () => {
    render(<InvoicePage />);

    expect(screen.getAllByText(/₹39,100.00/i).length).toBeGreaterThan(0);

    fireEvent.click(
      screen.getByRole("switch", {
        name: /payment summary/i,
      }),
    );

    expect(screen.queryByText(/₹39,100.00/i)).not.toBeInTheDocument();
  });
});
