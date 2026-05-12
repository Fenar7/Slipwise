"use client";

import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { DocumentBrandMark } from "@/components/document/document-brand-mark";
import {
  InlineNumberField,
  InlineTextArea,
  InlineTextField,
} from "@/components/document/inline-edit-fields";
import { cn } from "@/lib/utils";
import type { SalarySlipDocument, SalarySlipFormValues } from "@/features/docs/salary-slip/types";
import { normalizeSalarySlip } from "@/features/docs/salary-slip/utils/normalize-salary-slip";

type SalarySlipTemplateProps = {
  document: SalarySlipDocument;
  mode?: "preview" | "print" | "pdf" | "png" | "edit";
};

function MoneyTable({
  title,
  rows,
  totalLabel,
  totalValue,
}: {
  title: string;
  rows: SalarySlipDocument["earnings"];
  totalLabel: string;
  totalValue: string;
}) {
  return (
    <section className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.94)] p-5">
      <div className="flex items-center justify-between gap-4 border-b border-[rgba(29,23,16,0.08)] pb-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
          {title}
        </p>
        <p className="text-sm font-medium text-[rgba(29,23,16,0.7)]">{rows.length} items</p>
      </div>
      <div className="divide-y divide-[rgba(29,23,16,0.08)]">
        {rows.map((row) => (
          <div key={`${title}-${row.label}`} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
            <p className="text-[rgba(29,23,16,0.82)]">{row.label}</p>
            <p className="font-medium text-[var(--voucher-ink)]">{row.amountFormatted}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto] gap-4 rounded-[1rem] bg-[rgba(29,23,16,0.04)] px-4 py-3 text-sm">
        <p className="font-medium text-[rgba(29,23,16,0.7)]">{totalLabel}</p>
        <p className="font-semibold text-[var(--voucher-ink)]">{totalValue}</p>
      </div>
    </section>
  );
}

export function CorporateCleanSalarySlipTemplate({
  document,
  mode = "preview",
}: SalarySlipTemplateProps) {
  if (mode === "edit") {
    return <CorporateCleanEditor />;
  }

  const printLikeMode = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.96)] p-6">
        <div className="flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-5">
          <div className="flex items-start gap-4">
            <DocumentBrandMark branding={document.branding} />
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.45)]">
                Monthly payroll summary
              </p>
              <h2 className="mt-3 text-[1.8rem] font-medium">
                {document.branding.companyName || "Slipwise"}
              </h2>
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.68)]">
                {document.visibility.showAddress && document.branding.address ? (
                  <p>{document.branding.address}</p>
                ) : null}
                {document.visibility.showEmail && document.branding.email ? (
                  <p>{document.branding.email}</p>
                ) : null}
                {document.visibility.showPhone && document.branding.phone ? (
                  <p>{document.branding.phone}</p>
                ) : null}
              </div>
            </div>
          </div>
          <div className="rounded-[1.25rem] px-5 py-4 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">Net salary</p>
            <p className="mt-3 text-3xl font-medium text-white">{document.netSalaryFormatted}</p>
            <p className="mt-2 max-w-[13rem] text-xs leading-6 text-white">
              {document.netSalaryInWords}
            </p>
          </div>
        </div>

        <div
          className={cn(
            "mt-5 grid gap-4",
            printLikeMode ? "grid-cols-2" : "md:grid-cols-2",
          )}
        >
          <div className="rounded-[1.2rem] bg-[rgba(29,23,16,0.04)] p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Employee</p>
            <p className="mt-2 text-lg font-medium">{document.employeeName}</p>
            <div className="mt-3 space-y-1.5 text-sm text-[rgba(29,23,16,0.72)]">
              {document.employeeId ? <p>Employee ID: {document.employeeId}</p> : null}
              {document.department ? <p>Department: {document.department}</p> : null}
              {document.designation ? <p>Designation: {document.designation}</p> : null}
              {document.workLocation ? <p>Work location: {document.workLocation}</p> : null}
              {document.joiningDate ? <p>Joining date: {document.joiningDate}</p> : null}
              {document.pan ? <p>PAN: {document.pan}</p> : null}
              {document.uan ? <p>UAN: {document.uan}</p> : null}
            </div>
          </div>
          <div className="rounded-[1.2rem] bg-[rgba(29,23,16,0.04)] p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Period</p>
            <p className="mt-2 text-lg font-medium">{document.payPeriodLabel}</p>
            <div className="mt-3 space-y-1.5 text-sm text-[rgba(29,23,16,0.72)]">
              {document.payDate ? <p>Pay date: {document.payDate}</p> : null}
              {document.paymentMethod ? <p>Payment method: {document.paymentMethod}</p> : null}
              {document.visibility.showBankDetails && document.bankName ? (
                <p>Bank: {document.bankName}</p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {document.visibility.showAttendance ? (
        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            printLikeMode ? "grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-4",
          )}
        >
          {[
            ["Working days", document.workingDays],
            ["Paid days", document.paidDays],
            ["Leave days", document.leaveDays],
            ["Loss of pay", document.lossOfPayDays],
          ].map(([label, value]) =>
            value ? (
              <div
                key={label}
                className="rounded-[1.2rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-4"
              >
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                  {label}
                </p>
                <p className="mt-3 text-2xl font-medium">{value}</p>
              </div>
            ) : null,
          )}
        </section>
      ) : null}

      <section
        className={cn(
          "document-break-inside-avoid grid gap-4",
          printLikeMode ? "grid-cols-2" : "md:grid-cols-2",
        )}
      >
        <MoneyTable
          title="Earnings"
          rows={document.earnings}
          totalLabel="Total earnings"
          totalValue={document.totalEarningsFormatted}
        />
        <MoneyTable
          title="Deductions"
          rows={document.deductions}
          totalLabel="Total deductions"
          totalValue={document.totalDeductionsFormatted}
        />
      </section>

      {document.visibility.showBankDetails && (document.bankName || document.bankAccountNumber) ? (
        <section className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Disbursement details
          </p>
          <div
            className={cn(
              "mt-4 grid gap-4 text-sm text-[rgba(29,23,16,0.78)]",
              printLikeMode ? "grid-cols-2" : "sm:grid-cols-2",
            )}
          >
            {document.bankName ? <p>Bank: {document.bankName}</p> : null}
            {document.bankAccountNumber ? (
              <p>Account: {document.bankAccountNumber}</p>
            ) : null}
            {document.bankIfsc ? <p>IFSC: {document.bankIfsc}</p> : null}
          </div>
        </section>
      ) : null}

      {document.notes ? (
        <section className="document-break-inside-avoid rounded-[1.35rem] border border-dashed border-[rgba(29,23,16,0.14)] bg-[rgba(255,255,255,0.82)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
          <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]">{document.notes}</p>
        </section>
      ) : null}

      {document.visibility.showSignature ? (
        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            printLikeMode ? "grid-cols-2" : "md:grid-cols-2",
          )}
        >
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <p className="mt-4 text-sm font-medium text-[rgba(29,23,16,0.8)]">
              {document.preparedBy ? `Prepared by: ${document.preparedBy}` : "Prepared by"}
            </p>
          </div>
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <p className="mt-4 text-sm font-medium text-[rgba(29,23,16,0.8)]">Employee acknowledgement</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function RemoveRowButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[rgba(29,23,16,0.4)] transition-colors hover:bg-red-50 hover:text-red-500"
      aria-label="Remove row"
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

function AddRowButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-[var(--voucher-accent)] transition-opacity hover:opacity-75"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="16" />
        <line x1="8" y1="12" x2="16" y2="12" />
      </svg>
      {label}
    </button>
  );
}

function CorporateCleanEditor() {
  const { control } = useFormContext<SalarySlipFormValues>();
  const watchedValues = useWatch({ control }) as SalarySlipFormValues;
  const doc = normalizeSalarySlip(watchedValues);

  const { fields: earningFields, append: appendEarning, remove: removeEarning } = useFieldArray({ control, name: "earnings" });
  const { fields: deductionFields, append: appendDeduction, remove: removeDeduction } = useFieldArray({ control, name: "deductions" });

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.5rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.96)] p-6">
        <div className="flex items-start justify-between gap-6 border-b border-[rgba(29,23,16,0.08)] pb-5">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <DocumentBrandMark branding={doc.branding} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-[rgba(29,23,16,0.45)]">
                Monthly payroll summary
              </p>
              <h2 className="mt-3 text-[1.8rem] font-medium">
                <InlineTextField name="branding.companyName" placeholder="Company name" />
              </h2>
              <div className="mt-4 space-y-1.5 text-sm leading-6 text-[rgba(29,23,16,0.68)]">
                {doc.visibility.showAddress ? (
                  <InlineTextArea name="branding.address" placeholder="Address" />
                ) : null}
                {doc.visibility.showEmail ? (
                  <InlineTextField name="branding.email" placeholder="Email" />
                ) : null}
                {doc.visibility.showPhone ? (
                  <InlineTextField name="branding.phone" placeholder="Phone" />
                ) : null}
              </div>
            </div>
          </div>
          <div className="rounded-[1.25rem] px-5 py-4 text-white" style={{ backgroundColor: "var(--voucher-accent)" }}>
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-white">Net salary</p>
            <p className="mt-3 text-3xl font-medium text-white">{doc.netSalaryFormatted}</p>
            <p className="mt-2 max-w-[13rem] text-xs leading-6 text-white">
              {doc.netSalaryInWords}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="rounded-[1.2rem] bg-[rgba(29,23,16,0.04)] p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Employee</p>
            <div className="mt-2 text-lg font-medium">
              <InlineTextField name="employeeName" placeholder="Employee name" />
            </div>
            <div className="mt-3 space-y-1.5 text-sm text-[rgba(29,23,16,0.72)]">
              {doc.visibility.showEmployeeId ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Employee ID:</span>
                  <InlineTextField name="employeeId" placeholder="ID" />
                </div>
              ) : null}
              {doc.visibility.showDepartment ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Department:</span>
                  <InlineTextField name="department" placeholder="Department" />
                </div>
              ) : null}
              {doc.visibility.showDesignation ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Designation:</span>
                  <InlineTextField name="designation" placeholder="Designation" />
                </div>
              ) : null}
              {doc.visibility.showWorkLocation ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Work location:</span>
                  <InlineTextField name="workLocation" placeholder="Location" />
                </div>
              ) : null}
              {doc.visibility.showJoiningDate ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Joining date:</span>
                  <InlineTextField name="joiningDate" placeholder="Date" />
                </div>
              ) : null}
              {doc.visibility.showPan ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">PAN:</span>
                  <InlineTextField name="pan" placeholder="PAN" />
                </div>
              ) : null}
              {doc.visibility.showUan ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">UAN:</span>
                  <InlineTextField name="uan" placeholder="UAN" />
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-[1.2rem] bg-[rgba(29,23,16,0.04)] p-4">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Period</p>
            <div className="mt-2 text-lg font-medium">
              <InlineTextField name="payPeriodLabel" placeholder="Pay period" />
            </div>
            <div className="mt-3 space-y-1.5 text-sm text-[rgba(29,23,16,0.72)]">
              <div className="flex items-center gap-1">
                <span className="shrink-0">Pay date:</span>
                <InlineTextField name="payDate" placeholder="Date" />
              </div>
              {doc.visibility.showBankDetails ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Payment method:</span>
                  <InlineTextField name="paymentMethod" placeholder="Method" />
                </div>
              ) : null}
              {doc.visibility.showBankDetails ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Bank:</span>
                  <InlineTextField name="bankName" placeholder="Bank name" />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {doc.visibility.showAttendance ? (
        <section className="document-break-inside-avoid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Working days", doc.workingDays],
            ["Paid days", doc.paidDays],
            ["Leave days", doc.leaveDays],
            ["Loss of pay", doc.lossOfPayDays],
          ].map(([label, value]) =>
            value ? (
              <div
                key={label}
                className="rounded-[1.2rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-4"
              >
                <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                  {label}
                </p>
                <p className="mt-3 text-2xl font-medium">{value}</p>
              </div>
            ) : null,
          )}
        </section>
      ) : null}

      <section className="document-break-inside-avoid grid gap-4 md:grid-cols-2">
        {/* Earnings */}
        <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.94)] p-5">
          <div className="flex items-center justify-between gap-4 border-b border-[rgba(29,23,16,0.08)] pb-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Earnings
            </p>
            <p className="text-sm font-medium text-[rgba(29,23,16,0.7)]">{earningFields.length} items</p>
          </div>
          <div className="divide-y divide-[rgba(29,23,16,0.08)]">
            {earningFields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-3 text-sm">
                <InlineTextField name={`earnings.${index}.label`} placeholder="Earning label" />
                <InlineNumberField name={`earnings.${index}.amount`} placeholder="0" className="w-24 text-right" />
                {earningFields.length > 1 ? (
                  <RemoveRowButton onClick={() => removeEarning(index)} />
                ) : (
                  <span className="w-6" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-4 rounded-[1rem] bg-[rgba(29,23,16,0.04)] px-4 py-3 text-sm">
            <p className="font-medium text-[rgba(29,23,16,0.7)]">Total earnings</p>
            <p className="font-semibold text-[var(--voucher-ink)]">{doc.totalEarningsFormatted}</p>
          </div>
          <AddRowButton onClick={() => appendEarning({ label: "", amount: "" })} label="Add earning" />
        </div>

        {/* Deductions */}
        <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.94)] p-5">
          <div className="flex items-center justify-between gap-4 border-b border-[rgba(29,23,16,0.08)] pb-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Deductions
            </p>
            <p className="text-sm font-medium text-[rgba(29,23,16,0.7)]">{deductionFields.length} items</p>
          </div>
          <div className="divide-y divide-[rgba(29,23,16,0.08)]">
            {deductionFields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-3 text-sm">
                <InlineTextField name={`deductions.${index}.label`} placeholder="Deduction label" />
                <InlineNumberField name={`deductions.${index}.amount`} placeholder="0" className="w-24 text-right" />
                {deductionFields.length > 1 ? (
                  <RemoveRowButton onClick={() => removeDeduction(index)} />
                ) : (
                  <span className="w-6" />
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-4 rounded-[1rem] bg-[rgba(29,23,16,0.04)] px-4 py-3 text-sm">
            <p className="font-medium text-[rgba(29,23,16,0.7)]">Total deductions</p>
            <p className="font-semibold text-[var(--voucher-ink)]">{doc.totalDeductionsFormatted}</p>
          </div>
          <AddRowButton onClick={() => appendDeduction({ label: "", amount: "" })} label="Add deduction" />
        </div>
      </section>

      {doc.visibility.showBankDetails ? (
        <section className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Disbursement details
          </p>
          <div className="mt-4 grid gap-4 text-sm text-[rgba(29,23,16,0.78)] sm:grid-cols-2">
            <div className="flex items-center gap-1">
              <span className="shrink-0">Bank:</span>
              <InlineTextField name="bankName" placeholder="Bank name" />
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0">Account:</span>
              <InlineTextField name="bankAccountNumber" placeholder="Account number" />
            </div>
            <div className="flex items-center gap-1">
              <span className="shrink-0">IFSC:</span>
              <InlineTextField name="bankIfsc" placeholder="IFSC code" />
            </div>
          </div>
        </section>
      ) : null}

      {doc.visibility.showNotes ? (
        <section className="document-break-inside-avoid rounded-[1.35rem] border border-dashed border-[rgba(29,23,16,0.14)] bg-[rgba(255,255,255,0.82)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">Notes</p>
          <div className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]">
            <InlineTextArea name="notes" placeholder="Add notes..." />
          </div>
        </section>
      ) : null}

      {doc.visibility.showSignature ? (
        <section className="document-break-inside-avoid grid gap-4 md:grid-cols-2">
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-[rgba(29,23,16,0.8)]">
              <span className="shrink-0">Prepared by:</span>
              <InlineTextField name="preparedBy" placeholder="Name" />
            </div>
          </div>
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.92)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <p className="mt-4 text-sm font-medium text-[rgba(29,23,16,0.8)]">Employee acknowledgement</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
