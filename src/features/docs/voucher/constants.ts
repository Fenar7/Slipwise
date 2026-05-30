import type {
  VoucherFormValues,
  VoucherTemplateId,
} from "@/features/docs/voucher/types";

export const voucherTemplateOptions: Array<{
  id: VoucherTemplateId;
  name: string;
  description: string;
}> = [
  {
    id: "minimal-office",
    name: "Minimal Office",
    description: "Clean, spacious, and modern with a soft branded header.",
  },
  {
    id: "traditional-ledger",
    name: "Traditional Ledger",
    description: "Ledger-inspired structure with strong separators and formal rhythm.",
  },
];

export const voucherDefaultValues: VoucherFormValues = {
  templateId: "minimal-office",
  voucherType: "payment",
  branding: {
    companyName: "",
    address: "",
    email: "",
    phone: "",
    accentColor: "#dc2626",
  },
  voucherNumber: "",
  date: new Date().toISOString().split("T")[0],
  counterpartyName: "",
  amount: "",
  paymentMode: "",
  referenceNumber: "",
  purpose: "",
  notes: "",
  approvedBy: "",
  receivedBy: "",
  isMultiLine: false,
  lineItems: [],
  visibility: {
    showAddress: true,
    showEmail: true,
    showPhone: true,
    showPaymentMode: true,
    showReferenceNumber: true,
    showNotes: true,
    showApprovedBy: true,
    showReceivedBy: true,
    showSignatureArea: true,
  },
};
