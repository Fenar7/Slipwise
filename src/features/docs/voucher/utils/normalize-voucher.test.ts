import { normalizeVoucher } from "@/features/docs/voucher/utils/normalize-voucher";
import type { VoucherFormValues } from "@/features/docs/voucher/types";

const baseValues: VoucherFormValues = {
  templateId: "minimal-office",
  voucherType: "payment",
  branding: {
    companyName: "Test Co",
    address: "123 Test St",
    email: "test@example.com",
    phone: "+91 12345 67890",
    accentColor: "#dc2626",
  },
  voucherNumber: "",
  date: "2026-04-23",
  counterpartyName: "Test Vendor",
  amount: "1850",
  paymentMode: "Bank Transfer",
  referenceNumber: "REF-001",
  purpose: "Test payment",
  notes: "Test notes",
  approvedBy: "John Doe",
  receivedBy: "Jane Smith",
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

describe("normalizeVoucher", () => {
  it("maps payment vouchers to the correct title and labels", () => {
    const document = normalizeVoucher(baseValues);

    expect(document.title).toBe("Payment Voucher");
    expect(document.counterpartyLabel).toBe("Paid to");
    expect(document.amount).toBe(1850);
  });

  it("prunes hidden optional fields from the preview payload", () => {
    const document = normalizeVoucher({
      ...baseValues,
      visibility: {
        ...baseValues.visibility,
        showNotes: false,
        showReferenceNumber: false,
      },
    });

    expect(document.notes).toBeUndefined();
    expect(document.referenceNumber).toBeUndefined();
  });

  it("switches labels for receipt vouchers", () => {
    const document = normalizeVoucher({
      ...baseValues,
      voucherType: "receipt",
    });

    expect(document.title).toBe("Receipt Voucher");
    expect(document.counterpartyLabel).toBe("Received from");
  });
});
