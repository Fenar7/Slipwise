import {
  voucherDocumentSchema,
  voucherExportRequestSchema,
} from "@/features/docs/voucher/schema";
import { normalizeVoucher } from "@/features/docs/voucher/utils/normalize-voucher";
import type { VoucherFormValues } from "@/features/docs/voucher/types";

const validFormValues: VoucherFormValues = {
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
  amount: "2500",
  paymentMode: "Bank Transfer",
  referenceNumber: "REF-001",
  purpose: "Office supplies",
  notes: "Approved by manager",
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

describe("voucher export schemas", () => {
  it("accepts a normalized voucher document payload", () => {
    const document = normalizeVoucher(validFormValues);

    expect(voucherDocumentSchema.safeParse(document).success).toBe(true);
    expect(voucherExportRequestSchema.safeParse({ document }).success).toBe(true);
  });

  it("rejects malformed export payloads", () => {
    expect(
      voucherExportRequestSchema.safeParse({
        document: {
          voucherNumber: "",
        },
      }).success,
    ).toBe(false);
  });
});
