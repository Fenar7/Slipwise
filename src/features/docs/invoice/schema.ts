import { z } from "zod";
import { invoiceDefaultValues } from "@/features/docs/invoice/constants";
import type { InvoiceFormValues } from "@/features/docs/invoice/types";

const brandingSchema = z.object({
  salutation: z.string().trim().optional(),
  companyName: z.string().trim(),
  address: z.string().trim(),
  email: z.string().trim(),
  phone: z.string().trim(),
  logoDataUrl: z.string().optional(),
  accentColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{6})$/, "Enter a valid hex color."),
  logoSize: z.number().min(30).max(150).optional(),
  logoFit: z.enum(["contain", "cover"]).optional(),
});

const visibilitySchema = z.object({
  showAddress: z.boolean(),
  showEmail: z.boolean(),
  showPhone: z.boolean(),
  showWebsite: z.boolean(),
  showBusinessTaxId: z.boolean(),
  showClientAddress: z.boolean(),
  showClientEmail: z.boolean(),
  showClientPhone: z.boolean(),
  showClientTaxId: z.boolean(),
  showShippingAddress: z.boolean(),
  showDueDate: z.boolean(),
  showPlaceOfSupply: z.boolean(),
  showNotes: z.boolean(),
  showTerms: z.boolean(),
  showBankDetails: z.boolean(),
  showSignature: z.boolean(),
  showPaymentSummary: z.boolean(),
  showUpiDetails: z.boolean(),
});

const lineItemFormSchema = z.object({
  description: z.string().trim().min(1, "Description is required."),
  inventoryItemId: z.string().trim().optional(),
  quantity: z
    .string()
    .trim()
    .min(1, "Quantity is required.")
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid quantity.")
    .refine((value) => Number(value) > 0, "Quantity must be greater than zero."),
  unitPrice: z
    .string()
    .trim()
    .min(1, "Unit price is required.")
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid unit price.")
    .refine((value) => Number(value) >= 0, "Unit price cannot be negative."),
  taxRate: z
    .string()
    .trim()
    .min(1, "Tax rate is required.")
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid tax rate.")
    .refine((value) => Number(value) >= 0, "Tax rate cannot be negative."),
  discountAmount: z
    .string()
    .trim()
    .min(1, "Discount is required.")
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid discount.")
    .refine((value) => Number(value) >= 0, "Discount cannot be negative."),
});

const lineItemDocumentSchema = z.object({
  description: z.string().trim().min(1),
  quantity: z.number().finite().positive(),
  unitPrice: z.number().finite().min(0),
  taxRate: z.number().finite().min(0),
  discountAmount: z.number().finite().min(0),
  baseAmount: z.number().finite().min(0),
  taxableAmount: z.number().finite().min(0),
  taxAmount: z.number().finite().min(0),
  lineTotal: z.number().finite().min(0),
  unitPriceFormatted: z.string().trim().min(1),
  discountAmountFormatted: z.string().trim().min(1),
  baseAmountFormatted: z.string().trim().min(1),
  taxAmountFormatted: z.string().trim().min(1),
  lineTotalFormatted: z.string().trim().min(1),
});

export const invoiceDocumentSchema = z.object({
  templateId: z.enum(["minimal", "professional", "bold-brand", "classic-bordered", "modern-edge"]),
  title: z.string().trim().min(1),
  branding: brandingSchema,
  website: z.string().trim().optional(),
  businessTaxId: z.string().trim().optional(),
  clientSalutation: z.string().trim().optional(),
  clientName: z.string().trim().min(1),
  clientAddress: z.string().trim().optional(),
  shippingAddress: z.string().trim().optional(),
  clientEmail: z.string().trim().optional(),
  clientPhone: z.string().trim().optional(),
  clientTaxId: z.string().trim().optional(),
  invoiceNumber: z.string().trim().optional(),
  invoiceDate: z.string().trim().min(1),
  dueDate: z.string().trim().optional(),
  placeOfSupply: z.string().trim().optional(),
  currencyCode: z.literal("INR"),
  lineItems: z.array(lineItemDocumentSchema).min(1),
  subtotal: z.number().finite().min(0),
  totalDiscount: z.number().finite().min(0),
  totalTax: z.number().finite().min(0),
  extraCharges: z.number().finite().min(0),
  invoiceLevelDiscount: z.number().finite().min(0),
  grandTotal: z.number().finite().min(0),
  amountPaid: z.number().finite().min(0),
  balanceDue: z.number().finite().min(0),
  subtotalFormatted: z.string().trim().min(1),
  totalDiscountFormatted: z.string().trim().min(1),
  totalTaxFormatted: z.string().trim().min(1),
  extraChargesFormatted: z.string().trim().min(1),
  invoiceLevelDiscountFormatted: z.string().trim().min(1),
  grandTotalFormatted: z.string().trim().min(1),
  amountPaidFormatted: z.string().trim().min(1),
  balanceDueFormatted: z.string().trim().min(1),
  amountInWords: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  bankAccountNumber: z.string().trim().optional(),
  bankIfsc: z.string().trim().optional(),
  upiId: z.string().trim().optional(),
  upiQrDataUrl: z.string().optional(),
  authorizedBy: z.string().trim().optional(),
  authorizedByDesignation: z.string().trim().optional(),
  authorizedByCompany: z.string().trim().optional(),
  visibility: visibilitySchema,
});

export const invoiceFormSchema = z
  .object({
    templateId: z.enum(["minimal", "professional", "bold-brand", "classic-bordered", "modern-edge"]),
    branding: brandingSchema.extend({
      companyName: z.string().trim().min(1, "Business name is required."),
    }),
    website: z.string().trim(),
    businessTaxId: z.string().trim(),
    clientSalutation: z.string().trim().optional(),
    clientName: z.string().trim().min(1, "Client name is required."),
    clientAddress: z.string().trim(),
    shippingAddress: z.string().trim(),
    clientEmail: z.string().trim(),
    clientPhone: z.string().trim(),
    clientTaxId: z.string().trim(),
    invoiceNumber: z.string().trim().optional(),
    invoiceDate: z.string().trim().min(1, "Invoice date is required."),
    dueDate: z.string().trim(),
    placeOfSupply: z.string().trim(),
    extraCharges: z
      .string()
      .trim()
      .refine((value) => value === "" || Number.isFinite(Number(value)), "Enter a valid amount.")
      .refine((value) => value === "" || Number(value) >= 0, "Extra charges cannot be negative."),
    invoiceLevelDiscount: z
      .string()
      .trim()
      .refine((value) => value === "" || Number.isFinite(Number(value)), "Enter a valid discount.")
      .refine(
        (value) => value === "" || Number(value) >= 0,
        "Invoice-level discount cannot be negative.",
      ),
    amountPaid: z
      .string()
      .trim()
      .refine((value) => value === "" || Number.isFinite(Number(value)), "Enter a valid amount.")
      .refine((value) => value === "" || Number(value) >= 0, "Amount paid cannot be negative."),
    notes: z.string().trim(),
    terms: z.string().trim(),
    bankName: z.string().trim(),
    bankAccountNumber: z.string().trim(),
    bankIfsc: z.string().trim(),
    upiId: z.string().trim(),
    upiQrDataUrl: z.string().optional(),
    authorizedBy: z.string().trim().optional(),
    authorizedByDesignation: z.string().trim().optional(),
    authorizedByCompany: z.string().trim().optional(),
    lineItems: z.array(lineItemFormSchema).min(1, "Add at least one line item."),
    visibility: visibilitySchema,
  })
  .superRefine((values, context) => {
    const invoiceDate = values.invoiceDate
      ? new Date(`${values.invoiceDate}T00:00:00`)
      : null;
    const dueDate = values.dueDate ? new Date(`${values.dueDate}T00:00:00`) : null;

    if (
      invoiceDate &&
      dueDate &&
      !Number.isNaN(invoiceDate.getTime()) &&
      !Number.isNaN(dueDate.getTime()) &&
      dueDate < invoiceDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dueDate"],
        message: "Due date cannot be earlier than the invoice date.",
      });
    }

    const extraCharges = Number(values.extraCharges || 0);
    const invoiceLevelDiscount = Number(values.invoiceLevelDiscount || 0);
    let computedSubtotal = 0;
    let computedTaxTotal = 0;

    values.lineItems.forEach((item, index) => {
      const quantity = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const taxRate = Number(item.taxRate || 0);
      const discountAmount = Number(item.discountAmount || 0);
      const baseAmount = quantity * unitPrice;

      if (discountAmount > baseAmount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lineItems", index, "discountAmount"],
          message: "Discount cannot exceed the line base amount.",
        });
      }

      const taxableAmount = Math.max(baseAmount - discountAmount, 0);
      const taxAmount = taxableAmount * (taxRate / 100);
      computedSubtotal += taxableAmount;
      computedTaxTotal += taxAmount;
    });

    const computedBeforeInvoiceDiscount =
      computedSubtotal + computedTaxTotal + Math.max(extraCharges, 0);

    if (invoiceLevelDiscount > computedBeforeInvoiceDiscount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["invoiceLevelDiscount"],
        message:
          "Invoice-level discount cannot exceed the computed invoice total.",
      });
    }

    const computedGrandTotal = Math.max(
      computedBeforeInvoiceDiscount - Math.max(invoiceLevelDiscount, 0),
      0,
    );

    if (!Number.isFinite(extraCharges)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["extraCharges"],
        message: "Extra charges must be a valid amount.",
      });
    }

    if (Number(values.amountPaid || 0) > computedGrandTotal) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amountPaid"],
        message: "Amount paid cannot exceed the grand total.",
      });
    }
  });

export type InvoiceFormSchema = z.infer<typeof invoiceFormSchema>;

export const invoiceExportRequestSchema = z.object({
  document: invoiceDocumentSchema,
});

export function validateInvoiceForm(
  values: InvoiceFormValues = invoiceDefaultValues,
) {
  return invoiceFormSchema.safeParse(values);
}
