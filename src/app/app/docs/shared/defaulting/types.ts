export type DocumentType = "invoice" | "voucher" | "quote";

export type DefaultResolutionInput = {
  orgId: string;
  documentType: DocumentType;
  customerId?: string;
  vendorId?: string;
  templateParam?: string;
};

export type InvoiceDefaults = {
  customerId: string;
  clientName: string;
  clientAddress: string;
  shippingAddress: string;
  clientEmail: string;
  clientPhone: string;
  clientTaxId: string;
  businessTaxId: string;
  templateId: string;
  invoiceDate: string;
  dueDate: string;
  placeOfSupply: string;
  notes: string;
  terms: string;
  authorizedBy: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  amountPaid: string;
  branding: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
  };
};

export type VoucherDefaults = {
  vendorId: string;
  voucherType: "payment" | "receipt";
  date: string;
  counterpartyName: string;
  notes: string;
  approvedBy: string;
  receivedBy: string;
  paymentMode: string;
  referenceNumber: string;
  purpose: string;
  branding: {
    companyName: string;
    address: string;
    email: string;
    phone: string;
    accentColor: string;
  };
  templateId: string;
};

export type QuoteDefaults = {
  customerId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  issueDate: string;
  validUntil: string;
  notes: string;
  termsAndConditions: string;
};

export type DocumentDefaults = InvoiceDefaults | VoucherDefaults | QuoteDefaults;
