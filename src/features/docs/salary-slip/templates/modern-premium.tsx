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
      className="document-break-inside-avoid rounded-[1.25rem] border px-4 py-4"
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

export function ModernPremiumSalarySlipTemplate({
  document,
  mode = "preview",
}: SalarySlipTemplateProps) {
  if (mode === "edit") {
    return <ModernPremiumEditor />;
  }

  const printLikeMode = mode !== "preview";

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,241,232,0.96))] p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <DocumentBrandMark branding={document.branding} />
            <div>
              <p className="text-[0.68rem] uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                Salary Slip
              </p>
              <h2 className="mt-3 text-[2rem] font-medium">{document.employeeName}</h2>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.7)]">
                {document.payPeriodLabel}
                {document.payDate ? ` · Paid on ${document.payDate}` : ""}
              </p>
            </div>
          </div>
          <div className="max-w-[15rem] text-right text-sm leading-7 text-[rgba(29,23,16,0.72)]">
            <p className="font-medium text-[var(--voucher-ink)]">
              {document.branding.companyName || "Slipwise"}
            </p>
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

        <div
          className={cn(
            "mt-6 grid gap-4",
            printLikeMode
              ? "grid-cols-[1.15fr_0.85fr]"
              : "md:grid-cols-[1.15fr_0.85fr]",
          )}
        >
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-white/88 p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Employee profile
            </p>
            <div
              className={cn(
                "mt-4 grid gap-3 text-sm text-[rgba(29,23,16,0.78)]",
                printLikeMode ? "grid-cols-2" : "sm:grid-cols-2",
              )}
            >
              {document.employeeId ? <p>Employee ID: {document.employeeId}</p> : null}
              {document.department ? <p>Department: {document.department}</p> : null}
              {document.designation ? <p>Designation: {document.designation}</p> : null}
              {document.workLocation ? <p>Location: {document.workLocation}</p> : null}
              {document.joiningDate ? <p>Joined: {document.joiningDate}</p> : null}
              {document.pan ? <p>PAN: {document.pan}</p> : null}
              {document.uan ? <p>UAN: {document.uan}</p> : null}
              {document.paymentMethod ? <p>Mode: {document.paymentMethod}</p> : null}
              {document.bankName ? <p>Bank: {document.bankName}</p> : null}
              {document.bankAccountNumber ? (
                <p>Account: {document.bankAccountNumber}</p>
              ) : null}
              {document.bankIfsc ? <p>IFSC: {document.bankIfsc}</p> : null}
            </div>
          </div>
          <div className="grid gap-3">
            <SummaryCard label="Earnings" value={document.totalEarningsFormatted} />
            <SummaryCard label="Deductions" value={document.totalDeductionsFormatted} />
            <SummaryCard label="Net salary" value={document.netSalaryFormatted} accent />
          </div>
        </div>
      </section>

      <section
        className={cn(
          "grid gap-4",
          printLikeMode
            ? "grid-cols-[1.05fr_0.95fr]"
            : "lg:grid-cols-[1.05fr_0.95fr]",
        )}
      >
        <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Earnings and deductions
          </p>
          <div
            className={cn(
              "mt-4 grid gap-4",
              printLikeMode ? "grid-cols-2" : "sm:grid-cols-2",
            )}
          >
            <div>
              <p className="text-sm font-medium text-[rgba(29,23,16,0.72)]">Earnings</p>
              <div className="mt-3 divide-y divide-[rgba(29,23,16,0.08)]">
                {document.earnings.map((row) => (
                  <div key={`earn-${row.label}`} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
                    <p>{row.label}</p>
                    <p className="font-medium">{row.amountFormatted}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[rgba(29,23,16,0.72)]">Deductions</p>
              <div className="mt-3 divide-y divide-[rgba(29,23,16,0.08)]">
                {document.deductions.map((row) => (
                  <div key={`ded-${row.label}`} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
                    <p>{row.label}</p>
                    <p className="font-medium">{row.amountFormatted}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Net salary in words
            </p>
            <p className="mt-4 text-lg leading-8 text-[rgba(29,23,16,0.84)]">
              {document.netSalaryInWords}
            </p>
          </div>

          {document.visibility.showAttendance ? (
            <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Attendance summary
              </p>
              <div
                className={cn(
                  "mt-4 grid gap-3 text-sm text-[rgba(29,23,16,0.78)]",
                  printLikeMode ? "grid-cols-2" : "sm:grid-cols-2",
                )}
              >
                {document.workingDays ? <p>Working days: {document.workingDays}</p> : null}
                {document.paidDays ? <p>Paid days: {document.paidDays}</p> : null}
                {document.leaveDays ? <p>Leave days: {document.leaveDays}</p> : null}
                {document.lossOfPayDays ? <p>Loss of pay: {document.lossOfPayDays}</p> : null}
              </div>
            </div>
          ) : null}

          {document.notes ? (
            <div className="document-break-inside-avoid rounded-[1.35rem] border border-dashed border-[rgba(29,23,16,0.14)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Notes
              </p>
              <p className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]">{document.notes}</p>
            </div>
          ) : null}
        </div>
      </section>

      {document.visibility.showSignature ? (
        <section
          className={cn(
            "document-break-inside-avoid grid gap-4",
            printLikeMode ? "grid-cols-2" : "md:grid-cols-2",
          )}
        >
          <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <p className="mt-4 text-sm font-medium">
              {document.preparedBy ? `Prepared by: ${document.preparedBy}` : "Prepared by"}
            </p>
          </div>
          <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <p className="mt-4 text-sm font-medium">Employee acknowledgement</p>
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

function ModernPremiumEditor() {
  const { control } = useFormContext<SalarySlipFormValues>();
  const watchedValues = useWatch({ control }) as SalarySlipFormValues;
  const doc = normalizeSalarySlip(watchedValues);

  const { fields: earningFields, append: appendEarning, remove: removeEarning } = useFieldArray({ control, name: "earnings" });
  const { fields: deductionFields, append: appendDeduction, remove: removeDeduction } = useFieldArray({ control, name: "deductions" });

  return (
    <div className="space-y-6 text-[var(--voucher-ink)]">
      <section className="document-break-inside-avoid rounded-[1.6rem] border border-[rgba(29,23,16,0.08)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,241,232,0.96))] p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <DocumentBrandMark branding={doc.branding} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.68rem] uppercase tracking-[0.32em] text-[rgba(29,23,16,0.45)]">
                Salary Slip
              </p>
              <h2 className="mt-3 text-[2rem] font-medium">
                <InlineTextField name="employeeName" placeholder="Employee name" />
              </h2>
              <div className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.7)]">
                <InlineTextField name="payPeriodLabel" placeholder="Pay period" />
                <InlineTextField name="payDate" placeholder="Pay date" />
              </div>
            </div>
          </div>
          <div className="min-w-0 max-w-[15rem] text-right text-sm leading-7 text-[rgba(29,23,16,0.72)]">
            <div className="font-medium text-[var(--voucher-ink)]">
              <InlineTextField name="branding.companyName" placeholder="Company name" className="text-right" />
            </div>
            {doc.visibility.showAddress ? (
              <InlineTextArea name="branding.address" placeholder="Address" className="text-right" />
            ) : null}
            {doc.visibility.showEmail ? (
              <InlineTextField name="branding.email" placeholder="Email" className="text-right" />
            ) : null}
            {doc.visibility.showPhone ? (
              <InlineTextField name="branding.phone" placeholder="Phone" className="text-right" />
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-white/88 p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Employee profile
            </p>
            <div className="mt-4 grid gap-3 text-sm text-[rgba(29,23,16,0.78)] sm:grid-cols-2">
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
                  <span className="shrink-0">Location:</span>
                  <InlineTextField name="workLocation" placeholder="Location" />
                </div>
              ) : null}
              {doc.visibility.showJoiningDate ? (
                <div className="flex items-center gap-1">
                  <span className="shrink-0">Joined:</span>
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
              {doc.visibility.showBankDetails ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="shrink-0">Mode:</span>
                    <InlineTextField name="paymentMethod" placeholder="Payment mode" />
                  </div>
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
                </>
              ) : null}
            </div>
          </div>
          <div className="grid gap-3">
            <SummaryCard label="Earnings" value={doc.totalEarningsFormatted} />
            <SummaryCard label="Deductions" value={doc.totalDeductionsFormatted} />
            <SummaryCard label="Net salary" value={doc.netSalaryFormatted} accent />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
          <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
            Earnings and deductions
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-[rgba(29,23,16,0.72)]">Earnings</p>
              <div className="mt-3 divide-y divide-[rgba(29,23,16,0.08)]">
                {earningFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-3 text-sm">
                    <InlineTextField name={`earnings.${index}.label`} placeholder="Earning label" />
                    <InlineNumberField name={`earnings.${index}.amount`} placeholder="0" className="w-20 text-right font-medium" />
                    {earningFields.length > 1 ? (
                      <RemoveRowButton onClick={() => removeEarning(index)} />
                    ) : (
                      <span className="w-6" />
                    )}
                  </div>
                ))}
              </div>
              <AddRowButton onClick={() => appendEarning({ label: "", amount: "" })} label="Add earning" />
            </div>
            <div>
              <p className="text-sm font-medium text-[rgba(29,23,16,0.72)]">Deductions</p>
              <div className="mt-3 divide-y divide-[rgba(29,23,16,0.08)]">
                {deductionFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-3 text-sm">
                    <InlineTextField name={`deductions.${index}.label`} placeholder="Deduction label" />
                    <InlineNumberField name={`deductions.${index}.amount`} placeholder="0" className="w-20 text-right font-medium" />
                    {deductionFields.length > 1 ? (
                      <RemoveRowButton onClick={() => removeDeduction(index)} />
                    ) : (
                      <span className="w-6" />
                    )}
                  </div>
                ))}
              </div>
              <AddRowButton onClick={() => appendDeduction({ label: "", amount: "" })} label="Add deduction" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
              Net salary in words
            </p>
            <p className="mt-4 text-lg leading-8 text-[rgba(29,23,16,0.84)]">
              {doc.netSalaryInWords}
            </p>
          </div>

          {doc.visibility.showAttendance ? (
            <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Attendance summary
              </p>
              <div className="mt-4 grid gap-3 text-sm text-[rgba(29,23,16,0.78)] sm:grid-cols-2">
                {doc.workingDays ? <p>Working days: {doc.workingDays}</p> : null}
                {doc.paidDays ? <p>Paid days: {doc.paidDays}</p> : null}
                {doc.leaveDays ? <p>Leave days: {doc.leaveDays}</p> : null}
                {doc.lossOfPayDays ? <p>Loss of pay: {doc.lossOfPayDays}</p> : null}
              </div>
            </div>
          ) : null}

          {doc.visibility.showNotes ? (
            <div className="document-break-inside-avoid rounded-[1.35rem] border border-dashed border-[rgba(29,23,16,0.14)] bg-[rgba(255,255,255,0.88)] p-5">
              <p className="text-[0.68rem] uppercase tracking-[0.25em] text-[rgba(29,23,16,0.45)]">
                Notes
              </p>
              <InlineTextArea name="notes" placeholder="Add notes..." className="mt-3 text-sm leading-7 text-[rgba(29,23,16,0.8)]" />
            </div>
          ) : null}
        </div>
      </section>

      {doc.visibility.showSignature ? (
        <section className="document-break-inside-avoid grid gap-4 md:grid-cols-2">
          <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <div className="mt-4 flex items-center gap-1 text-sm font-medium">
              <span className="shrink-0">Prepared by:</span>
              <InlineTextField name="preparedBy" placeholder="Name" />
            </div>
          </div>
          <div className="document-break-inside-avoid rounded-[1.35rem] border border-[rgba(29,23,16,0.08)] bg-[rgba(255,255,255,0.95)] p-5">
            <div className="h-16 border-b border-dashed border-[rgba(29,23,16,0.16)]" />
            <p className="mt-4 text-sm font-medium">Employee acknowledgement</p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
