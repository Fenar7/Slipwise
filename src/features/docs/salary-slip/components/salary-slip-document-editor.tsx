"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { normalizeSalarySlip } from "@/features/docs/salary-slip/utils/normalize-salary-slip";
import type { SalarySlipFormValues } from "@/features/docs/salary-slip/types";
import { DocumentBrandMark } from "@/components/document/document-brand-mark";
import {
  DocumentEditorRoot,
  InlineDateField,
  InlineTextArea,
  InlineTextField,
} from "@/components/document/inline-edit-fields";

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[rgba(29,23,16,0.4)] transition-colors hover:bg-red-50 hover:text-red-500"
      aria-label="Remove row"
    >
      ×
    </button>
  );
}

function AddRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 text-[0.78rem] font-medium text-[var(--voucher-accent)] transition-opacity hover:opacity-75"
    >
      ＋ {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-[1.25rem] border px-4 py-4"
      style={
        accent
          ? {
              backgroundColor: "var(--voucher-accent)",
              borderColor: "transparent",
              color: "white",
            }
          : undefined
      }
    >
      <p
        className={
          accent
            ? "text-[0.68rem] uppercase tracking-[0.24em] text-white"
            : "text-[0.68rem] uppercase tracking-[0.24em] text-[rgba(29,23,16,0.45)]"
        }
      >
        {label}
      </p>
      <p className={`mt-3 text-2xl font-medium ${accent ? "text-white" : ""}`}>{value}</p>
    </div>
  );
}

export function SalarySlipDocumentEditor() {
  const { control } = useFormContext<SalarySlipFormValues>();

  const {
    fields: earningFields,
    append: appendEarning,
    remove: removeEarning,
  } = useFieldArray({ control, name: "earnings" });

  const {
    fields: deductionFields,
    append: appendDeduction,
    remove: removeDeduction,
  } = useFieldArray({ control, name: "deductions" });

  const watchedValues = useWatch({ control }) as SalarySlipFormValues;
  const doc = normalizeSalarySlip(watchedValues);
  const branding = doc.branding;

  return (
    <DocumentEditorRoot branding={branding}>
      {/* ── Header Card ── */}
      <section className="document-break-inside-avoid rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,241,232,0.96))] p-6">
        <div className="flex items-start justify-between gap-6">
          {/* Left: brand + employee */}
          <div className="flex items-start gap-4">
            <DocumentBrandMark branding={branding} />
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                Salary Slip
              </p>
              <div className="mt-2 flex items-center gap-2 text-sm text-[rgba(29,23,16,0.7)]">
                <InlineTextField name="month" placeholder="Month" className="w-16" />
                <InlineTextField name="year" placeholder="Year" className="w-12" />
                <InlineDateField name="payDate" placeholder="Pay date" className="w-28" />
              </div>
              <InlineTextField
                name="employeeName"
                placeholder="Employee Name"
                className="mt-3 text-[2rem] font-medium"
              />
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.7)]">
                {doc.payPeriodLabel}
                {doc.payDate ? ` · Paid on ${doc.payDate}` : ""}
              </p>
            </div>
          </div>

          {/* Right: company info */}
          <div className="max-w-[15rem] text-right text-sm leading-7 text-[rgba(29,23,16,0.72)]">
            <InlineTextField
              name="branding.companyName"
              placeholder="Company Name"
              className="font-medium text-[var(--voucher-ink)] text-right"
            />
            <InlineTextField
              name="branding.address"
              placeholder="Address"
              className="text-right"
            />
            <InlineTextField
              name="branding.email"
              placeholder="Email"
              className="text-right"
            />
            <InlineTextField
              name="branding.phone"
              placeholder="Phone"
              className="text-right"
            />
          </div>
        </div>

        {/* Employee profile + Summary cards */}
        <div className="mt-6 grid md:grid-cols-[1.15fr_0.85fr] gap-4">
          {/* Employee profile */}
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-white/88 p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Employee profile
            </p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm text-[rgba(29,23,16,0.78)]">
              <p className="flex items-center gap-1">Employee ID: <InlineTextField name="employeeId" placeholder="—" /></p>
              <p className="flex items-center gap-1">Department: <InlineTextField name="department" placeholder="—" /></p>
              <p className="flex items-center gap-1">Designation: <InlineTextField name="designation" placeholder="—" /></p>
              <p className="flex items-center gap-1">Location: <InlineTextField name="workLocation" placeholder="—" /></p>
              <p className="flex items-center gap-1">Joined: <InlineDateField name="joiningDate" placeholder="—" /></p>
              <p className="flex items-center gap-1">PAN: <InlineTextField name="pan" placeholder="—" /></p>
              <p className="flex items-center gap-1">UAN: <InlineTextField name="uan" placeholder="—" /></p>
              <p className="flex items-center gap-1">Mode: <InlineTextField name="paymentMethod" placeholder="—" /></p>
              <p className="flex items-center gap-1">Bank: <InlineTextField name="bankName" placeholder="—" /></p>
              <p className="flex items-center gap-1">Account: <InlineTextField name="bankAccountNumber" placeholder="—" /></p>
              <p className="flex items-center gap-1">IFSC: <InlineTextField name="bankIfsc" placeholder="—" /></p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid gap-3">
            <SummaryCard label="Earnings" value={doc.totalEarningsFormatted} />
            <SummaryCard label="Deductions" value={doc.totalDeductionsFormatted} />
            <SummaryCard label="Net salary" value={doc.netSalaryFormatted} accent />
          </div>
        </div>
      </section>

      {/* ── Earnings & Deductions + Side Panel ── */}
      <section className="grid lg:grid-cols-[1.05fr_0.95fr] gap-4">
        {/* Earnings and deductions */}
        <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Earnings and deductions
          </p>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            {/* Earnings column */}
            <div>
              <p className="text-sm font-medium text-[rgba(29,23,16,0.72)]">Earnings</p>
              <div className="mt-3 divide-y divide-[rgba(29,23,16,0.08)]">
                {earningFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_auto_auto] gap-2 py-3 text-sm">
                    <InlineTextField name={`earnings.${index}.label`} placeholder="Earning item" />
                    <InlineTextField name={`earnings.${index}.amount`} placeholder="0.00" className="text-right font-medium" />
                    {earningFields.length > 1 && (
                      <RemoveRowButton onClick={() => removeEarning(index)} />
                    )}
                  </div>
                ))}
              </div>
              <AddRowButton label="Add earning" onClick={() => appendEarning({ label: "", amount: "" })} />
            </div>

            {/* Deductions column */}
            <div>
              <p className="text-sm font-medium text-[rgba(29,23,16,0.72)]">Deductions</p>
              <div className="mt-3 divide-y divide-[rgba(29,23,16,0.08)]">
                {deductionFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_auto_auto] gap-2 py-3 text-sm">
                    <InlineTextField name={`deductions.${index}.label`} placeholder="Deduction item" />
                    <InlineTextField name={`deductions.${index}.amount`} placeholder="0.00" className="text-right font-medium" />
                    {deductionFields.length > 1 && (
                      <RemoveRowButton onClick={() => removeDeduction(index)} />
                    )}
                  </div>
                ))}
              </div>
              <AddRowButton label="Add deduction" onClick={() => appendDeduction({ label: "", amount: "" })} />
            </div>
          </div>
        </div>

        {/* Right side panel */}
        <div className="space-y-4">
          {/* Net salary in words */}
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Net salary in words
            </p>
            <p className="mt-4 text-lg leading-8 text-[rgba(29,23,16,0.84)]">
              {doc.netSalaryInWords}
            </p>
          </div>

          {/* Attendance summary */}
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Attendance summary
            </p>
            <div className="mt-4 grid sm:grid-cols-2 gap-3 text-sm text-[rgba(29,23,16,0.78)]">
              <p className="flex items-center gap-1">Working days: <InlineTextField name="workingDays" placeholder="—" /></p>
              <p className="flex items-center gap-1">Paid days: <InlineTextField name="paidDays" placeholder="—" /></p>
              <p className="flex items-center gap-1">Leave days: <InlineTextField name="leaveDays" placeholder="—" /></p>
              <p className="flex items-center gap-1">Loss of pay: <InlineTextField name="lossOfPayDays" placeholder="—" /></p>
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-[1.35rem] border border-dashed border-[rgba(29,23,16,0.14)] bg-[rgba(255,255,255,0.88)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Notes
            </p>
            <InlineTextArea name="notes" placeholder="Any additional notes…" className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]" />
          </div>
        </div>
      </section>

      {/* ── Disbursement ── */}
      <section className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
        <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          Disbursement
        </p>
        <div className="mt-4 grid sm:grid-cols-4 gap-3 text-sm">
          <div>
            <span className="text-[rgba(29,23,16,0.45)]">Method</span>
            <InlineTextField name="paymentMethod" placeholder="—" />
          </div>
          <div>
            <span className="text-[rgba(29,23,16,0.45)]">Bank</span>
            <InlineTextField name="bankName" placeholder="—" />
          </div>
          <div>
            <span className="text-[rgba(29,23,16,0.45)]">Account No.</span>
            <InlineTextField name="bankAccountNumber" placeholder="—" />
          </div>
          <div>
            <span className="text-[rgba(29,23,16,0.45)]">IFSC</span>
            <InlineTextField name="bankIfsc" placeholder="—" />
          </div>
        </div>
      </section>

      {/* ── Signature ── */}
      <section className="grid md:grid-cols-2 gap-4">
        <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
          <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
          <p className="mt-4 text-sm font-medium">
            Prepared by: <InlineTextField name="preparedBy" placeholder="Name" className="inline" />
          </p>
        </div>
        <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
          <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
          <p className="mt-4 text-sm font-medium">Employee acknowledgement</p>
        </div>
      </section>
    </DocumentEditorRoot>
  );
}
