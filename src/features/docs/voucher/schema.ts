import { z } from "zod";
import type { VoucherFormValues } from "@/features/docs/voucher/types";
import { voucherDefaultValues } from "@/features/docs/voucher/constants";

const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Line description is required."),
  date: z.string(),
  time: z.string(),
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required.")
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid amount.")
    .refine((value) => Number(value) > 0, "Amount must be greater than zero."),
  category: z.string(),
});

const brandingSchema = z.object({
  companyName: z.string().trim(),
  address: z.string().trim(),
  email: z.string().trim(),
  phone: z.string().trim(),
  logoDataUrl: z.string().optional(),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, "Enter a valid hex color."),
});

const visibilitySchema = z.object({
  showAddress: z.boolean(),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  showPaymentMode: z.boolean(),
  showReferenceNumber: z.boolean(),
  showNotes: z.boolean(),
  showApprovedBy: z.boolean(),
  showReceivedBy: z.boolean(),
  showSignatureArea: z.boolean(),
});

export const voucherDocumentSchema = z.object({
  templateId: z.enum(["minimal-office", "traditional-ledger", "modern-card", "formal-bordered", "compact-receipt"]),
  voucherType: z.enum(["payment", "receipt"]),
  title: z.string().trim().min(1),
  counterpartyLabel: z.string().trim().min(1),
  branding: brandingSchema,
  voucherNumber: z.string().trim().optional(),
  date: z.string().trim().min(1),
  counterpartyName: z.string().trim().min(1),
  amount: z.number().finite().positive(),
  amountFormatted: z.string().trim().min(1),
  amountInWords: z.string().trim().min(1),
  paymentMode: z.string().trim().optional(),
  referenceNumber: z.string().trim().optional(),
  purpose: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  approvedBy: z.string().trim().optional(),
  receivedBy: z.string().trim().optional(),
  visibility: visibilitySchema,
});

export const voucherExportRequestSchema = z.object({
  document: voucherDocumentSchema,
});

export const voucherFormSchema = z
  .object({
    templateId: z.enum(["minimal-office", "traditional-ledger", "modern-card", "formal-bordered", "compact-receipt"]),
    voucherType: z.enum(["payment", "receipt"]),
    branding: brandingSchema,
    voucherNumber: z.string().trim().optional(),
    date: z.string().trim().min(1, "Date is required."),
    counterpartyName: z.string().trim().min(1, "Counterparty is required."),
    amount: z
      .string()
      .trim()
      .min(1, "Amount is required.")
      .refine((value) => Number.isFinite(Number(value)), "Enter a valid amount.")
      .refine((value) => Number(value) > 0, "Amount must be greater than zero."),
    paymentMode: z.string().trim(),
    referenceNumber: z.string().trim(),
    purpose: z.string().trim().min(1, "Purpose or narration is required."),
    notes: z.string().trim(),
    approvedBy: z.string().trim(),
    receivedBy: z.string().trim(),
    visibility: visibilitySchema,
    vendorId: z.string().optional(),
    isMultiLine: z.boolean().optional(),
    lineItems: z.array(lineItemSchema).optional(),
  })
  .superRefine((values, context) => {
    if (values.isMultiLine && (!values.lineItems || values.lineItems.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lineItems"],
        message: "Add at least one voucher line item.",
      });
    }
  });

export type VoucherFormSchema = z.infer<typeof voucherFormSchema>;

export function validateVoucherForm(
  values: VoucherFormValues = voucherDefaultValues,
) {
  return voucherFormSchema.safeParse(values);
}
