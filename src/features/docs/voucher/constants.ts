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
    companyName: "Northfield Trading Co.",
    address: "18 Market Road, Kozhikode",
    email: "accounts@northfield.example",
    phone: "+91 98765 43210",
    accentColor: "#c69854",
  },
  voucherNumber: "", // assigned when approved — drafts have no official number (Phase 5)
  date: "2026-03-25",
  counterpartyName: "Rahul Menon",
  amount: "1850",
  paymentMode: "Cash",
  referenceNumber: "REF-8831",
  purpose: "Travel reimbursement for site visit.",
  notes: "Settled after manager approval.",
  approvedBy: "Anita Thomas",
  receivedBy: "Rahul Menon",
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
