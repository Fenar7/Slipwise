import { z } from "zod";
import { salarySlipDefaultValues } from "@/features/docs/salary-slip/constants";
import type { SalarySlipFormValues } from "@/features/docs/salary-slip/types";

const brandingSchema = z.object({
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
  showEmployeeId: z.boolean(),
  showDepartment: z.boolean(),
  showDesignation: z.boolean(),
  showPan: z.boolean(),
  showUan: z.boolean(),
  showBankDetails: z.boolean(),
  showJoiningDate: z.boolean(),
  showWorkLocation: z.boolean(),
  showAttendance: z.boolean(),
  showNotes: z.boolean(),
  showSignature: z.boolean(),
});

const lineItemSchema = z.object({
  label: z.string().trim().min(1, "Label is required."),
  amount: z
    .string()
    .trim()
    .min(1, "Amount is required.")
    .refine((value) => Number.isFinite(Number(value)), "Enter a valid amount.")
    .refine((value) => Number(value) >= 0, "Amount cannot be negative."),
});

export const salarySlipDocumentSchema = z.object({
  templateId: z.enum(["corporate-clean", "modern-premium", "classic-formal", "detailed-breakdown", "compact-payslip"]),
  title: z.string().trim().min(1),
  branding: brandingSchema,
  employeeName: z.string().trim().min(1),
  employeeId: z.string().trim().optional(),
  department: z.string().trim().optional(),
  designation: z.string().trim().optional(),
  pan: z.string().trim().optional(),
  uan: z.string().trim().optional(),
  payPeriodLabel: z.string().trim().min(1),
  payDate: z.string().trim().optional(),
  workingDays: z.string().trim().optional(),
  paidDays: z.string().trim().optional(),
  leaveDays: z.string().trim().optional(),
  lossOfPayDays: z.string().trim().optional(),
  paymentMethod: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  bankAccountNumber: z.string().trim().optional(),
  bankIfsc: z.string().trim().optional(),
  joiningDate: z.string().trim().optional(),
  workLocation: z.string().trim().optional(),
  earnings: z.array(
    z.object({
      label: z.string().trim().min(1),
      amount: z.number().finite(),
      amountFormatted: z.string().trim().min(1),
    }),
  ),
  deductions: z.array(
    z.object({
      label: z.string().trim().min(1),
      amount: z.number().finite(),
      amountFormatted: z.string().trim().min(1),
    }),
  ),
  totalEarnings: z.number().finite(),
  totalDeductions: z.number().finite(),
  netSalary: z.number().finite(),
  totalEarningsFormatted: z.string().trim().min(1),
  totalDeductionsFormatted: z.string().trim().min(1),
  netSalaryFormatted: z.string().trim().min(1),
  netSalaryInWords: z.string().trim().min(1),
  notes: z.string().trim().optional(),
  preparedBy: z.string().trim().optional(),
  visibility: visibilitySchema,
});

export const salarySlipExportRequestSchema = z.object({
  document: salarySlipDocumentSchema,
});

export const salarySlipFormSchema = z
  .object({
    templateId: z.enum(["corporate-clean", "modern-premium", "classic-formal", "detailed-breakdown", "compact-payslip"]),
    branding: brandingSchema.extend({
      companyName: z.string().trim().min(1, "Company name is required."),
    }),
    employeeName: z.string().trim().min(1, "Employee name is required."),
    employeeId: z.string().trim().min(1, "Employee ID is required."),
    department: z.string().trim(),
    designation: z.string().trim(),
    pan: z.string().trim(),
    uan: z.string().trim(),
    payPeriodLabel: z.string().trim(),
    month: z.string().trim().min(1, "Month is required."),
    year: z
      .string()
      .trim()
      .min(1, "Year is required.")
      .regex(/^\d{4}$/, "Enter a valid year."),
    payDate: z.string().trim(),
    workingDays: z.string().trim(),
    paidDays: z.string().trim(),
    leaveDays: z.string().trim(),
    lossOfPayDays: z.string().trim(),
    paymentMethod: z.string().trim(),
    bankName: z.string().trim(),
    bankAccountNumber: z.string().trim(),
    bankIfsc: z.string().trim(),
    joiningDate: z.string().trim(),
    workLocation: z.string().trim(),
    earnings: z
      .array(lineItemSchema)
      .min(1, "Add at least one earning row.")
      .refine(
        (rows) => rows.some((row) => Number(row.amount) > 0),
        "At least one earning amount must be greater than zero.",
      ),
    deductions: z.array(
      z.object({
        label: z.string().trim(),
        amount: z
          .string()
          .trim()
          .refine(
            (value) => value.length === 0 || Number.isFinite(Number(value)),
            "Enter a valid amount.",
          )
          .refine(
            (value) => value.length === 0 || Number(value) >= 0,
            "Amount cannot be negative.",
          ),
      }),
    ),
    notes: z.string().trim(),
    preparedBy: z.string().trim(),
    visibility: visibilitySchema,
  })
  .superRefine((values, context) => {
    const workingDays = Number(values.workingDays || 0);
    const paidDays = Number(values.paidDays || 0);

    if (values.workingDays && !Number.isFinite(workingDays)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workingDays"],
        message: "Working days must be a valid number.",
      });
    }

    if (values.paidDays && !Number.isFinite(paidDays)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paidDays"],
        message: "Paid days must be a valid number.",
      });
    }

    if (
      values.workingDays &&
      values.paidDays &&
      Number.isFinite(workingDays) &&
      Number.isFinite(paidDays) &&
      paidDays > workingDays
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["paidDays"],
        message: "Paid days cannot exceed working days.",
      });
    }

    const monthIndex = new Date(`${values.month} 1, 2000`).getMonth();

    if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["month"],
        message: "Enter a valid month.",
      });
    }
  });

export type SalarySlipFormSchema = z.infer<typeof salarySlipFormSchema>;

export function validateSalarySlipForm(
  values: SalarySlipFormValues = salarySlipDefaultValues,
) {
  return salarySlipFormSchema.safeParse(values);
}
