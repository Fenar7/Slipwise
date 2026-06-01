export type DocumentKind = "invoice" | "quote" | "voucher";

export type DefaultResolutionInput = {
  kind: DocumentKind;
  orgId: string;
  entityId?: string;
  queryParams?: Record<string, string | undefined>;
};

export type OrgDefaultsSnapshot = {
  gstin: string | null;
  taxId: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIFSC: string | null;
  businessAddress: string | null;
  defaultInvoiceTemplate: string;
  defaultInvoiceNotes: string;
  defaultInvoiceTerms: string;
  defaultInvoiceAuthorizedBy: string;
  defaultVoucherTemplate: string;
  defaultVoucherNotes: string;
  defaultVoucherApprovedBy: string;
  defaultVoucherReceivedBy: string;
  defaultVoucherPaymentMode: string;
  defaultQuoteNotes: string;
  defaultQuoteTerms: string;
  quoteValidityDays: number;
};

export type EntityInfo = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  gstin: string;
  taxId: string;
  paymentTermsDays: number;
};

export type DefaultResolution = {
  orgDefaults: OrgDefaultsSnapshot;
  entity: EntityInfo | null;
  templateId: string;
};
