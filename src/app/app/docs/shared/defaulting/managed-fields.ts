import type { DocumentKind } from "./types";

export const INVOICE_MANAGED_FIELDS: readonly string[] = [
  "customerId", "clientName", "clientAddress", "shippingAddress",
  "clientEmail", "clientPhone", "clientTaxId", "businessTaxId",
  "templateId", "invoiceDate", "dueDate", "placeOfSupply",
  "notes", "terms", "authorizedBy",
  "bankName", "bankAccountNumber", "bankIfsc",
  "branding.companyName", "branding.address", "branding.email", "branding.phone",
];

export const QUOTE_MANAGED_FIELDS: readonly string[] = [
  "customerId", "clientName", "clientEmail", "clientPhone", "clientAddress",
  "issueDate", "validUntil", "notes", "termsAndConditions",
];

export const VOUCHER_MANAGED_FIELDS: readonly string[] = [
  "vendorId", "counterpartyName", "notes", "approvedBy", "receivedBy",
  "paymentMode", "templateId",
  "branding.companyName", "branding.address", "branding.email", "branding.phone", "branding.accentColor",
  "date",
];

export const MANAGED_FIELDS_BY_KIND: Record<DocumentKind, readonly string[]> = {
  invoice: INVOICE_MANAGED_FIELDS,
  quote: QUOTE_MANAGED_FIELDS,
  voucher: VOUCHER_MANAGED_FIELDS,
};
