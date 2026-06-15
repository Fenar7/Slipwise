import type { VoucherDocument, VoucherFormValues } from "@/features/docs/voucher/types";
import { amountToWords } from "@/features/docs/voucher/utils/amount-to-words";
import { normalizeMoney } from "@/lib/money";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return "";
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

export function normalizeVoucher(values: VoucherFormValues): VoucherDocument {
  const amount = normalizeMoney(values.amount);
  const isPayment = values.voucherType === "payment";
  const visibility = values.visibility;

  return {
    templateId: values.templateId,
    voucherType: values.voucherType,
    title: isPayment ? "Payment Voucher" : "Receipt Voucher",
    counterpartyLabel: isPayment ? "Paid to" : "Received from",
    branding: values.branding,
    voucherNumber: values.voucherNumber?.trim() || "Draft",
    date: formatDate(values.date),
    counterpartyName: values.counterpartyName.trim(),
    amount,
    amountFormatted: formatCurrency(amount),
    amountInWords: amountToWords(amount),
    paymentMode: visibility.showPaymentMode
      ? values.paymentMode.trim() || undefined
      : undefined,
    referenceNumber: visibility.showReferenceNumber
      ? values.referenceNumber.trim() || undefined
      : undefined,
    purpose: values.purpose.trim(),
    notes: visibility.showNotes ? values.notes.trim() || undefined : undefined,
    approvedBy: visibility.showApprovedBy
      ? values.approvedBy.trim() || undefined
      : undefined,
    receivedBy: visibility.showReceivedBy
      ? values.receivedBy.trim() || undefined
      : undefined,
    upiId: visibility.showUpiDetails
      ? values.upiId.trim() || undefined
      : undefined,
    upiQrDataUrl: visibility.showUpiDetails
      ? values.upiQrDataUrl || undefined
      : undefined,
    visibility,
  };
}
