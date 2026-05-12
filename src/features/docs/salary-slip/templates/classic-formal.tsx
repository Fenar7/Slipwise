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

export function ClassicFormalSalarySlipTemplate({
  document,
  mode = "preview",
}: SalarySlipTemplateProps) {
  if (mode === "edit") {
    return <ClassicFormalEditor />;
  }

  const printLikeMode = mode !== "preview";

  const employeeFields: [string, string | undefined, boolean][] = [
    ["Employee Name", document.employeeName, true],
    ["Employee ID", document.employeeId, document.visibility.showEmployeeId],
    ["Department", document.department, document.visibility.showDepartment],
    ["Designation", document.designation, document.visibility.showDesignation],
    ["PAN", document.pan, document.visibility.showPan],
    ["UAN", document.uan, document.visibility.showUan],
    ["Pay Period", document.payPeriodLabel, true],
    ["Pay Date", document.payDate, true],
    ["Joining Date", document.joiningDate, document.visibility.showJoiningDate],
    ["Work Location", document.workLocation, document.visibility.showWorkLocation],
  ];

  const visibleFields = employeeFields.filter(([, value, visible]) => value && visible);

  const maxRows = Math.max(document.earnings.length, document.deductions.length);

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      {/* Outer bordered container */}
      <div className="border border-[rgba(29,23,16,0.3)]">
        {/* Top accent banner */}
        <div
          className="document-break-inside-avoid px-6 py-4 text-center text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          <div className="flex items-center justify-center gap-3">
            <DocumentBrandMark branding={document.branding} />
            <h1 className="text-xl font-bold uppercase tracking-wide text-white">
              {document.branding.companyName || "Slipwise"}
            </h1>
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-white">
            {document.visibility.showAddress && document.branding.address ? (
              <p>{document.branding.address}</p>
            ) : null}
            <p className="flex items-center justify-center gap-3">
              {document.visibility.showEmail && document.branding.email ? (
                <span>{document.branding.email}</span>
              ) : null}
              {document.visibility.showPhone && document.branding.phone ? (
                <span>{document.branding.phone}</span>
              ) : null}
            </p>
          </div>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-white">
            Salary Slip
          </p>
        </div>

        {/* Employee details table grid */}
        <div className="document-break-inside-avoid">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {Array.from({ length: Math.ceil(visibleFields.length / 2) }).map((_, rowIdx) => {
                const left = visibleFields[rowIdx * 2];
                const right = visibleFields[rowIdx * 2 + 1];
                return (
                  <tr key={rowIdx}>
                    {left ? (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 font-semibold text-[rgba(29,23,16,0.65)]">
                          {left[0]}
                        </td>
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)] px-3 py-2">
                          {left[1]}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)]" />
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)]" />
                      </>
                    )}
                    {right ? (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 font-semibold text-[rgba(29,23,16,0.65)]">
                          {right[0]}
                        </td>
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)] px-3 py-2">
                          {right[1]}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)]" />
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)]" />
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Earnings & Deductions side-by-side table */}
        <div className="document-break-inside-avoid">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                  style={{ borderRightWidth: "2px", borderRightColor: "rgba(29,23,16,0.35)" }}
                  colSpan={2}
                >
                  Earnings
                </th>
                <th
                  className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                  colSpan={2}
                >
                  Deductions
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, i) => {
                const earn = document.earnings[i];
                const ded = document.deductions[i];
                return (
                  <tr key={i}>
                    <td className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2 text-[rgba(29,23,16,0.82)]">
                      {earn?.label ?? ""}
                    </td>
                    <td
                      className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2 text-right font-medium"
                      style={{ borderRightWidth: "2px", borderRightColor: "rgba(29,23,16,0.35)" }}
                    >
                      {earn?.amountFormatted ?? ""}
                    </td>
                    <td className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2 text-[rgba(29,23,16,0.82)]">
                      {ded?.label ?? ""}
                    </td>
                    <td className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2 text-right font-medium">
                      {ded?.amountFormatted ?? ""}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr className="bg-[rgba(29,23,16,0.05)]">
                <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 font-semibold text-[rgba(29,23,16,0.7)]">
                  Total Earnings
                </td>
                <td
                  className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-right font-bold"
                  style={{ borderRightWidth: "2px", borderRightColor: "rgba(29,23,16,0.35)" }}
                >
                  {document.totalEarningsFormatted}
                </td>
                <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 font-semibold text-[rgba(29,23,16,0.7)]">
                  Total Deductions
                </td>
                <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-right font-bold">
                  {document.totalDeductionsFormatted}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Net salary row */}
        <div
          className="document-break-inside-avoid border-t border-[rgba(29,23,16,0.2)] text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-bold uppercase tracking-wide text-white">Net Salary</p>
            <p className="text-xl font-bold text-white">{document.netSalaryFormatted}</p>
          </div>
          <p className="border-t border-white/20 px-4 py-2 text-xs text-white">
            {document.netSalaryInWords}
          </p>
        </div>

        {/* Attendance row */}
        {document.visibility.showAttendance ? (
          <div className="document-break-inside-avoid">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    className="border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                    colSpan={4}
                  >
                    Attendance
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    ["Working Days", document.workingDays],
                    ["Paid Days", document.paidDays],
                    ["Leave Days", document.leaveDays],
                    ["Loss of Pay", document.lossOfPayDays],
                  ].map(([label, value]) => (
                    <td
                      key={label}
                      className="w-1/4 border border-[rgba(29,23,16,0.2)] px-3 py-2 text-center"
                    >
                      <span className="text-xs text-[rgba(29,23,16,0.55)]">{label}</span>
                      <br />
                      <span className="font-semibold">{value || "—"}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Bank details row */}
        {document.visibility.showBankDetails && (document.bankName || document.bankAccountNumber) ? (
          <div className="document-break-inside-avoid">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    className="border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                    colSpan={4}
                  >
                    Bank Details
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {document.bankName ? (
                    <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                      <span className="text-xs text-[rgba(29,23,16,0.55)]">Bank</span>
                      <br />
                      {document.bankName}
                    </td>
                  ) : null}
                  {document.bankAccountNumber ? (
                    <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                      <span className="text-xs text-[rgba(29,23,16,0.55)]">Account No.</span>
                      <br />
                      {document.bankAccountNumber}
                    </td>
                  ) : null}
                  {document.bankIfsc ? (
                    <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                      <span className="text-xs text-[rgba(29,23,16,0.55)]">IFSC</span>
                      <br />
                      {document.bankIfsc}
                    </td>
                  ) : null}
                  {document.paymentMethod ? (
                    <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                      <span className="text-xs text-[rgba(29,23,16,0.55)]">Payment Method</span>
                      <br />
                      {document.paymentMethod}
                    </td>
                  ) : null}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Notes */}
        {document.visibility.showNotes && document.notes ? (
          <div className="document-break-inside-avoid border-t border-[rgba(29,23,16,0.2)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.55)]">
              Notes
            </p>
            <p className="mt-1 text-sm leading-6 text-[rgba(29,23,16,0.8)]">{document.notes}</p>
          </div>
        ) : null}

        {/* Signature section */}
        {document.visibility.showSignature ? (
          <div
            className={cn(
              "document-break-inside-avoid border-t border-[rgba(29,23,16,0.2)]",
              printLikeMode ? "grid grid-cols-2" : "grid md:grid-cols-2",
            )}
          >
            <div className="border-r border-[rgba(29,23,16,0.2)] px-6 py-5">
              <div className="mt-8 border-b border-[rgba(29,23,16,0.4)]" />
              <p className="mt-2 text-xs text-[rgba(29,23,16,0.6)]">
                {document.preparedBy
                  ? `Prepared by: ${document.preparedBy}`
                  : "Authorized Signatory"}
              </p>
            </div>
            <div className="px-6 py-5">
              <div className="mt-8 border-b border-[rgba(29,23,16,0.4)]" />
              <p className="mt-2 text-xs text-[rgba(29,23,16,0.6)]">
                Employee Signature
              </p>
            </div>
          </div>
        ) : null}
      </div>
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
      className="mt-2 inline-flex items-center gap-1.5 text-[0.82rem] font-medium text-[var(--voucher-accent)] transition-opacity hover:opacity-75"
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

function ClassicFormalEditor() {
  const { control } = useFormContext<SalarySlipFormValues>();
  const watchedValues = useWatch({ control }) as SalarySlipFormValues;
  const doc = normalizeSalarySlip(watchedValues);

  const { fields: earningFields, append: appendEarning, remove: removeEarning } = useFieldArray({ control, name: "earnings" });
  const { fields: deductionFields, append: appendDeduction, remove: removeDeduction } = useFieldArray({ control, name: "deductions" });

  const visibleEditableFields: [string, React.ReactNode][] = [
    ["Employee Name", <InlineTextField key="employeeName" name="employeeName" placeholder="Name" />],
    ...(doc.visibility.showEmployeeId ? [["Employee ID", <InlineTextField key="employeeId" name="employeeId" placeholder="ID" />] as [string, React.ReactNode]] : []),
    ...(doc.visibility.showDepartment ? [["Department", <InlineTextField key="department" name="department" placeholder="Department" />] as [string, React.ReactNode]] : []),
    ...(doc.visibility.showDesignation ? [["Designation", <InlineTextField key="designation" name="designation" placeholder="Designation" />] as [string, React.ReactNode]] : []),
    ...(doc.visibility.showPan ? [["PAN", <InlineTextField key="pan" name="pan" placeholder="PAN" />] as [string, React.ReactNode]] : []),
    ...(doc.visibility.showUan ? [["UAN", <InlineTextField key="uan" name="uan" placeholder="UAN" />] as [string, React.ReactNode]] : []),
    ["Pay Period", <InlineTextField key="payPeriodLabel" name="payPeriodLabel" placeholder="Period" />],
    ["Pay Date", <InlineTextField key="payDate" name="payDate" placeholder="Date" />],
    ...(doc.visibility.showJoiningDate ? [["Joining Date", <InlineTextField key="joiningDate" name="joiningDate" placeholder="Date" />] as [string, React.ReactNode]] : []),
    ...(doc.visibility.showWorkLocation ? [["Work Location", <InlineTextField key="workLocation" name="workLocation" placeholder="Location" />] as [string, React.ReactNode]] : []),
  ];

  const maxRows = Math.max(earningFields.length, deductionFields.length);

  return (
    <div className="space-y-0 text-[var(--voucher-ink)]">
      <div className="border border-[rgba(29,23,16,0.3)]">
        {/* Top accent banner */}
        <div
          className="document-break-inside-avoid px-6 py-4 text-center text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          <div className="flex items-center justify-center gap-3">
            <DocumentBrandMark branding={doc.branding} />
            <h1 className="text-xl font-bold uppercase tracking-wide text-white">
              <InlineTextField name="branding.companyName" placeholder="Company name" className="text-white placeholder:text-white" />
            </h1>
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-white">
            {doc.visibility.showAddress ? (
              <div className="mx-auto max-w-sm">
                <InlineTextArea name="branding.address" placeholder="Address" className="text-center text-white placeholder:text-white" />
              </div>
            ) : null}
            <p className="flex items-center justify-center gap-3">
              {doc.visibility.showEmail ? (
                <InlineTextField name="branding.email" placeholder="Email" className="text-white placeholder:text-white" />
              ) : null}
              {doc.visibility.showPhone ? (
                <InlineTextField name="branding.phone" placeholder="Phone" className="text-white placeholder:text-white" />
              ) : null}
            </p>
          </div>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.3em] text-white">Salary Slip</p>
        </div>

        {/* Employee details table */}
        <div className="document-break-inside-avoid">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {Array.from({ length: Math.ceil(visibleEditableFields.length / 2) }).map((_, rowIdx) => {
                const left = visibleEditableFields[rowIdx * 2];
                const right = visibleEditableFields[rowIdx * 2 + 1];
                return (
                  <tr key={rowIdx}>
                    {left ? (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 font-semibold text-[rgba(29,23,16,0.65)]">
                          {left[0]}
                        </td>
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)] px-3 py-2">
                          {left[1]}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)]" />
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)]" />
                      </>
                    )}
                    {right ? (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 font-semibold text-[rgba(29,23,16,0.65)]">
                          {right[0]}
                        </td>
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)] px-3 py-2">
                          {right[1]}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="w-[18%] border border-[rgba(29,23,16,0.2)]" />
                        <td className="w-[32%] border border-[rgba(29,23,16,0.2)]" />
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Earnings & Deductions table */}
        <div className="document-break-inside-avoid">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th
                  className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                  style={{ borderRightWidth: "2px", borderRightColor: "rgba(29,23,16,0.35)" }}
                  colSpan={2}
                >
                  Earnings
                </th>
                <th
                  className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                  colSpan={2}
                >
                  Deductions
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: maxRows }).map((_, i) => {
                const hasEarning = i < earningFields.length;
                const hasDeduction = i < deductionFields.length;
                return (
                  <tr key={i}>
                    <td className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2">
                      {hasEarning ? (
                        <InlineTextField name={`earnings.${i}.label`} placeholder="Label" />
                      ) : null}
                    </td>
                    <td
                      className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2"
                      style={{ borderRightWidth: "2px", borderRightColor: "rgba(29,23,16,0.35)" }}
                    >
                      {hasEarning ? (
                        <div className="flex items-center justify-end gap-1">
                          <InlineNumberField name={`earnings.${i}.amount`} placeholder="0" className="text-right" />
                          {earningFields.length > 1 ? (
                            <RemoveRowButton onClick={() => removeEarning(i)} />
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2">
                      {hasDeduction ? (
                        <InlineTextField name={`deductions.${i}.label`} placeholder="Label" />
                      ) : null}
                    </td>
                    <td className="w-[25%] border border-[rgba(29,23,16,0.2)] px-3 py-2">
                      {hasDeduction ? (
                        <div className="flex items-center justify-end gap-1">
                          <InlineNumberField name={`deductions.${i}.amount`} placeholder="0" className="text-right" />
                          {deductionFields.length > 1 ? (
                            <RemoveRowButton onClick={() => removeDeduction(i)} />
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-[rgba(29,23,16,0.05)]">
                <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 font-semibold text-[rgba(29,23,16,0.7)]">
                  Total Earnings
                </td>
                <td
                  className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-right font-bold"
                  style={{ borderRightWidth: "2px", borderRightColor: "rgba(29,23,16,0.35)" }}
                >
                  {doc.totalEarningsFormatted}
                </td>
                <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 font-semibold text-[rgba(29,23,16,0.7)]">
                  Total Deductions
                </td>
                <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2.5 text-right font-bold">
                  {doc.totalDeductionsFormatted}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="flex items-center gap-6 px-3 py-1.5">
            <AddRowButton onClick={() => appendEarning({ label: "", amount: "" })} label="Add earning" />
            <AddRowButton onClick={() => appendDeduction({ label: "", amount: "" })} label="Add deduction" />
          </div>
        </div>

        {/* Net salary row */}
        <div
          className="document-break-inside-avoid border-t border-[rgba(29,23,16,0.2)] text-white"
          style={{ backgroundColor: "var(--voucher-accent)" }}
        >
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-bold uppercase tracking-wide text-white">Net Salary</p>
            <p className="text-xl font-bold text-white">{doc.netSalaryFormatted}</p>
          </div>
          <p className="border-t border-white/20 px-4 py-2 text-xs text-white">
            {doc.netSalaryInWords}
          </p>
        </div>

        {/* Attendance row */}
        {doc.visibility.showAttendance ? (
          <div className="document-break-inside-avoid">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    className="border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                    colSpan={4}
                  >
                    Attendance
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    ["Working Days", doc.workingDays],
                    ["Paid Days", doc.paidDays],
                    ["Leave Days", doc.leaveDays],
                    ["Loss of Pay", doc.lossOfPayDays],
                  ].map(([label, value]) => (
                    <td
                      key={label}
                      className="w-1/4 border border-[rgba(29,23,16,0.2)] px-3 py-2 text-center"
                    >
                      <span className="text-xs text-[rgba(29,23,16,0.55)]">{label}</span>
                      <br />
                      <span className="font-semibold">{value || "—"}</span>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Bank details row */}
        {doc.visibility.showBankDetails ? (
          <div className="document-break-inside-avoid">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th
                    className="border border-[rgba(29,23,16,0.2)] bg-[rgba(29,23,16,0.04)] px-3 py-2 text-left font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.6)]"
                    colSpan={4}
                  >
                    Bank Details
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                    <span className="text-xs text-[rgba(29,23,16,0.55)]">Bank</span>
                    <InlineTextField name="bankName" placeholder="Bank name" />
                  </td>
                  <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                    <span className="text-xs text-[rgba(29,23,16,0.55)]">Account No.</span>
                    <InlineTextField name="bankAccountNumber" placeholder="Account number" />
                  </td>
                  <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                    <span className="text-xs text-[rgba(29,23,16,0.55)]">IFSC</span>
                    <InlineTextField name="bankIfsc" placeholder="IFSC code" />
                  </td>
                  <td className="border border-[rgba(29,23,16,0.2)] px-3 py-2">
                    <span className="text-xs text-[rgba(29,23,16,0.55)]">Payment Method</span>
                    <InlineTextField name="paymentMethod" placeholder="Method" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Notes */}
        {doc.visibility.showNotes ? (
          <div className="document-break-inside-avoid border-t border-[rgba(29,23,16,0.2)] px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-[rgba(29,23,16,0.55)]">
              Notes
            </p>
            <InlineTextArea name="notes" placeholder="Add notes..." className="mt-1 text-sm leading-6 text-[rgba(29,23,16,0.8)]" />
          </div>
        ) : null}

        {/* Signature section */}
        {doc.visibility.showSignature ? (
          <div className="document-break-inside-avoid grid border-t border-[rgba(29,23,16,0.2)] md:grid-cols-2">
            <div className="border-r border-[rgba(29,23,16,0.2)] px-6 py-5">
              <div className="mt-8 border-b border-[rgba(29,23,16,0.4)]" />
              <div className="mt-2 flex items-center gap-1 text-xs text-[rgba(29,23,16,0.6)]">
                <span className="shrink-0">Prepared by:</span>
                <InlineTextField name="preparedBy" placeholder="Name" />
              </div>
            </div>
            <div className="px-6 py-5">
              <div className="mt-8 border-b border-[rgba(29,23,16,0.4)]" />
              <p className="mt-2 text-xs text-[rgba(29,23,16,0.6)]">Employee Signature</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
