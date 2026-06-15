import type { BrandingConfig } from "@/lib/branding";

export type VoucherType = "payment" | "receipt";
export type VoucherTemplateId = "minimal-office" | "traditional-ledger" | "modern-card" | "formal-bordered" | "compact-receipt";

export type LineItemFormValues = {
  description: string;
  date: string;
  time: string;
  amount: string;
  category: string;
};

export type VoucherVisibilityConfig = {
  showAddress: boolean;
  showEmail: boolean;
  showPhone: boolean;
  showPaymentMode: boolean;
  showReferenceNumber: boolean;
  showNotes: boolean;
  showApprovedBy: boolean;
  showReceivedBy: boolean;
  showSignatureArea: boolean;
  showUpiDetails: boolean;
};

export type VoucherFormValues = {
  templateId: VoucherTemplateId;
  voucherType: VoucherType;
  branding: BrandingConfig;
  voucherNumber?: string;
  date: string;
  counterpartyName: string;
  amount: string;
  paymentMode: string;
  referenceNumber: string;
  purpose: string;
  notes: string;
  approvedBy: string;
  receivedBy: string;
  upiId: string;
  upiQrDataUrl: string;
  visibility: VoucherVisibilityConfig;
  // Extended fields
  vendorId?: string;
  isMultiLine?: boolean;
  lineItems?: LineItemFormValues[];
  tagIds?: string[];
};

export type VoucherDocument = {
  templateId: VoucherTemplateId;
  voucherType: VoucherType;
  title: string;
  counterpartyLabel: string;
  branding: BrandingConfig;
  voucherNumber?: string;
  date: string;
  counterpartyName: string;
  amount: number;
  amountFormatted: string;
  amountInWords: string;
  paymentMode?: string;
  referenceNumber?: string;
  purpose: string;
  notes?: string;
  approvedBy?: string;
  receivedBy?: string;
  upiId?: string;
  upiQrDataUrl?: string;
  visibility: VoucherVisibilityConfig;
};

export type VoucherExportFormat = "pdf" | "png";

export type VoucherRenderPayload = {
  document: VoucherDocument;
};
