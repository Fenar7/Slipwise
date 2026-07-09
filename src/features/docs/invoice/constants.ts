import type {
  InvoiceFormValues,
  InvoiceTemplateId,
} from "@/features/docs/invoice/types";

export const invoiceTemplateOptions: Array<{
  id: InvoiceTemplateId;
  name: string;
  description: string;
}> = [
  {
    id: "minimal",
    name: "Minimal",
    description: "A clean invoice layout with restrained typography and crisp totals.",
  },
  {
    id: "professional",
    name: "Professional",
    description: "Structured business blocks and strong financial hierarchy for client-ready use.",
  },
  {
    id: "bold-brand",
    name: "Bold Brand",
    description: "A more expressive branded header with a confident summary area.",
  },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const invoiceDefaultValues: InvoiceFormValues = {
  templateId: "professional",
  branding: {
    companyName: "",
    address: "",
    email: "",
    phone: "",
    accentColor: "#c69854",
  },
  website: "",
  businessTaxId: "",
  clientName: "",
  clientAddress: "",
  shippingAddress: "",
  clientEmail: "",
  clientPhone: "",
  clientTaxId: "",
  invoiceNumber: "",
  invoiceDate: todayIso(),
  dueDate: "",
  placeOfSupply: "",
  extraCharges: "0",
  invoiceLevelDiscount: "0",
  amountPaid: "0",
  notes: "",
  terms: "",
  bankName: "",
  bankAccountNumber: "",
  bankIfsc: "",
  authorizedBy: "",
  lineItems: [
    {
      description: "",
      inventoryItemId: "",
      quantity: "1",
      unitPrice: "",
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
};
