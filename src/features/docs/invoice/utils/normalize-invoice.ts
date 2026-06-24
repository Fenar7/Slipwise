import type {
  InvoiceDocument,
  InvoiceFormValues,
  InvoiceLineItem,
} from "@/features/docs/invoice/types";
import { amountToWords } from "@/features/docs/voucher/utils/amount-to-words";
import {
  fromMinorUnits,
  multiplyMoneyToMinorUnits,
  normalizeMoney,
  percentageOfMinorUnits,
  sumMinorUnits,
  toMinorUnits,
} from "@/lib/money";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function normalizeLineItems(rows: InvoiceFormValues["lineItems"]) {
  const items: InvoiceLineItem[] = [];

  for (const row of rows) {
    const description = row.description.trim();
    const quantity = Number(row.quantity || 0);
    const safeUnitPrice = normalizeMoney(row.unitPrice);
    const safeTaxRate = Number.isFinite(Number(row.taxRate))
      ? Math.max(Number(row.taxRate), 0)
      : 0;
    const baseAmountMinor = multiplyMoneyToMinorUnits(quantity, safeUnitPrice);
    const safeDiscountAmountMinor = Math.min(
      Math.max(toMinorUnits(row.discountAmount), 0),
      baseAmountMinor,
    );
    const taxableAmountMinor = Math.max(baseAmountMinor - safeDiscountAmountMinor, 0);
    const taxAmountMinor = percentageOfMinorUnits(taxableAmountMinor, safeTaxRate);
    const lineTotalMinor = taxableAmountMinor + taxAmountMinor;
    const baseAmount = fromMinorUnits(baseAmountMinor);
    const safeDiscountAmount = fromMinorUnits(safeDiscountAmountMinor);
    const taxableAmount = fromMinorUnits(taxableAmountMinor);
    const taxAmount = fromMinorUnits(taxAmountMinor);
    const lineTotal = fromMinorUnits(lineTotalMinor);

    items.push({
      description: description || "Untitled item",
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
      unitPrice: safeUnitPrice,
      taxRate: safeTaxRate,
      discountAmount: safeDiscountAmount,
      baseAmount,
      taxableAmount,
      taxAmount,
      lineTotal,
      unitPriceFormatted: formatCurrency(
        Number.isFinite(safeUnitPrice) ? Math.max(safeUnitPrice, 0) : 0,
      ),
      discountAmountFormatted: formatCurrency(safeDiscountAmount),
      baseAmountFormatted: formatCurrency(baseAmount),
      taxAmountFormatted: formatCurrency(taxAmount),
      lineTotalFormatted: formatCurrency(lineTotal),
    });
  }

  return items;
}

export function normalizeInvoice(values: InvoiceFormValues): InvoiceDocument {
  const lineItems = normalizeLineItems(values.lineItems);
  const subtotalMinor = sumMinorUnits(lineItems.map((item) => item.taxableAmount));
  const totalDiscountMinor = sumMinorUnits(lineItems.map((item) => item.discountAmount));
  const totalTaxMinor = sumMinorUnits(lineItems.map((item) => item.taxAmount));
  const extraChargesMinor = Math.max(toMinorUnits(values.extraCharges), 0);
  const invoiceLevelDiscountMinor = Math.max(toMinorUnits(values.invoiceLevelDiscount), 0);
  const lineItemsGrandTotalMinor = sumMinorUnits(lineItems.map((item) => item.lineTotal));
  const grandTotalMinor = Math.max(
    lineItemsGrandTotalMinor + extraChargesMinor - invoiceLevelDiscountMinor,
    0,
  );
  const amountPaidMinor = Math.max(toMinorUnits(values.amountPaid), 0);
  const balanceDueMinor = Math.max(grandTotalMinor - amountPaidMinor, 0);
  const subtotal = fromMinorUnits(subtotalMinor);
  const totalDiscount = fromMinorUnits(totalDiscountMinor);
  const totalTax = fromMinorUnits(totalTaxMinor);
  const extraCharges = fromMinorUnits(extraChargesMinor);
  const invoiceLevelDiscount = fromMinorUnits(invoiceLevelDiscountMinor);
  const grandTotal = fromMinorUnits(grandTotalMinor);
  const amountPaid = fromMinorUnits(amountPaidMinor);
  const balanceDue = fromMinorUnits(balanceDueMinor);
  const visibility = values.visibility;

  return {
    templateId: values.templateId,
    title: "Tax Invoice",
    branding: values.branding,
    website: values.visibility.showWebsite ? values.website.trim() || undefined : undefined,
    businessTaxId: visibility.showBusinessTaxId
      ? values.businessTaxId.trim() || undefined
      : undefined,
    clientSalutation: values.clientSalutation?.trim() || undefined,
    clientName: values.clientName.trim(),
    clientAddress: visibility.showClientAddress
      ? values.clientAddress.trim() || undefined
      : undefined,
    shippingAddress: visibility.showShippingAddress
      ? values.shippingAddress.trim() || undefined
      : undefined,
    clientEmail: visibility.showClientEmail
      ? values.clientEmail.trim() || undefined
      : undefined,
    clientPhone: visibility.showClientPhone
      ? values.clientPhone.trim() || undefined
      : undefined,
    clientTaxId: visibility.showClientTaxId
      ? values.clientTaxId.trim() || undefined
      : undefined,
    invoiceNumber: values.invoiceNumber?.trim() || "Draft",
    invoiceDate: formatDate(values.invoiceDate) || values.invoiceDate,
    dueDate: visibility.showDueDate ? formatDate(values.dueDate) : undefined,
    placeOfSupply: visibility.showPlaceOfSupply
      ? values.placeOfSupply.trim() || undefined
      : undefined,
    currencyCode: "INR",
    lineItems,
    subtotal,
    totalDiscount,
    totalTax,
    extraCharges,
    invoiceLevelDiscount,
    grandTotal,
    amountPaid,
    balanceDue,
    subtotalFormatted: formatCurrency(subtotal),
    totalDiscountFormatted: formatCurrency(totalDiscount),
    totalTaxFormatted: formatCurrency(totalTax),
    extraChargesFormatted: formatCurrency(extraCharges),
    invoiceLevelDiscountFormatted: formatCurrency(invoiceLevelDiscount),
    grandTotalFormatted: formatCurrency(grandTotal),
    amountPaidFormatted: formatCurrency(amountPaid),
    balanceDueFormatted: formatCurrency(balanceDue),
    amountInWords: amountToWords(Math.max(grandTotal, 0)),
    notes: visibility.showNotes ? values.notes.trim() || undefined : undefined,
    terms: visibility.showTerms ? values.terms.trim() || undefined : undefined,
    bankName: visibility.showBankDetails
      ? values.bankName.trim() || undefined
      : undefined,
    bankAccountNumber: visibility.showBankDetails
      ? values.bankAccountNumber.trim() || undefined
      : undefined,
    bankIfsc: visibility.showBankDetails
      ? values.bankIfsc.trim() || undefined
      : undefined,
    upiId: visibility.showUpiDetails
      ? values.upiId.trim() || undefined
      : undefined,
    upiQrDataUrl: visibility.showUpiDetails
      ? values.upiQrDataUrl || undefined
      : undefined,
    authorizedBy: visibility.showSignature
      ? values.authorizedBy.trim() || undefined
      : undefined,
    authorizedByDesignation: visibility.showSignature
      ? values.authorizedByDesignation?.trim() || undefined
      : undefined,
    authorizedByCompany: visibility.showSignature
      ? values.authorizedByCompany?.trim() || undefined
      : undefined,
    visibility,
  };
}
