"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import { saveSalarySlip, updateSalarySlip, releaseSalarySlip } from "@/app/app/docs/salary-slips/actions";
import { EmployeePicker } from "./employee-picker";
import { SalarySlipSaveBar } from "./salary-save-bar";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DocumentWorkspaceLayout,
  type WorkspaceExportDialog,
  type WorkspaceAction,
  type WorkspaceSectionMeta,
} from "@/components/foundation/document-workspace-layout";
import { FormSection } from "@/components/forms/form-section";
import { FieldShell } from "@/components/forms/field-shell";
import {
  ColorField,
  FileUploadField,
  TextAreaField,
  TextField,
  ToggleField,
} from "@/components/forms/input-primitives";
import { RepeaterSection } from "@/components/forms/repeater-section";
import { salarySlipDefaultValues, salarySlipTemplateOptions } from "@/features/docs/salary-slip/constants";
import { SalarySlipPreview } from "@/features/docs/salary-slip/components/salary-slip-preview";
import { SalarySlipDocumentFrame } from "@/features/docs/salary-slip/components/salary-slip-document-frame";
import { salarySlipFormSchema } from "@/features/docs/salary-slip/schema";
import type { SalarySlipDocument, SalarySlipFormValues } from "@/features/docs/salary-slip/types";
import { normalizeSalarySlip } from "@/features/docs/salary-slip/utils/normalize-salary-slip";
import { salarySlipTemplateRegistry } from "@/features/docs/salary-slip/templates";
import { DocumentPreviewSurface } from "@/components/document/document-preview-surface";
import {
  prepareDocumentExportDownload,
  startDocumentExportDownload,
} from "@/lib/browser/document-export-handoff";
import { cn } from "@/lib/utils";

interface WorkspaceEmployee {
  id: string;
  name: string;
  email: string | null;
  employeeId: string | null;
  designation: string | null;
  department: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIFSC: string | null;
  panNumber: string | null;
}

interface WorkspacePresetComponent {
  label: string;
  amount: number;
  type: "earning" | "deduction";
}

interface WorkspacePreset {
  id: string;
  name: string;
  components: WorkspacePresetComponent[];
}

interface WorkspaceProps {
  employees?: WorkspaceEmployee[];
  presets?: WorkspacePreset[];
  initialTemplateId?: string;
  initialAccentColor?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthNameToNumber(month: string): number {
  const idx = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === month.trim().toLowerCase(),
  );
  return idx >= 0 ? idx + 1 : new Date().getMonth() + 1;
}

function PresetApplyButton({ presets }: { presets: WorkspacePreset[] }) {
  const { control } = useFormContext<SalarySlipFormValues>();
  const { replace: replaceEarnings } = useFieldArray({ control, name: "earnings" });
  const { replace: replaceDeductions } = useFieldArray({ control, name: "deductions" });
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const applyPreset = (preset: WorkspacePreset) => {
    const earnings = preset.components.filter((c) => c.type === "earning");
    const deductions = preset.components.filter((c) => c.type === "deduction");
    replaceEarnings(earnings.map((c) => ({ label: c.label, amount: String(c.amount) })));
    replaceDeductions(deductions.map((c) => ({ label: c.label, amount: String(c.amount) })));
    setIsOpen(false);
  };

  if (presets.length === 0) return null;

  return (
    <div ref={ref} className="relative mb-4">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-soft)] bg-[var(--surface-soft)] px-3 py-2 text-sm text-[var(--foreground-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        Apply preset
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border border-[var(--border-soft)] bg-white shadow-lg">
          <div className="max-h-48 overflow-y-auto py-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
              >
                <div className="font-medium text-slate-900">{preset.name}</div>
                <div className="text-xs text-slate-400">
                  {preset.components.length} components
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 p-2">
            <a
              href="/app/data/salary-presets/new"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-slate-50 rounded-lg"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Manage presets
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

type SalarySlipActionState =
  | { status: "idle" }
  | { status: "pending"; action: "print" | "pdf" | "png" }
  | { status: "success"; action: "pdf" | "png"; downloadUrl: string }
  | { status: "error"; action?: "pdf" | "png"; message: string };

const salaryWorkspaceSections: WorkspaceSectionMeta[] = [
  { id: "salary-setup", label: "Setup" },
  { id: "salary-employee", label: "Employee" },
  { id: "salary-period", label: "Period" },
  { id: "salary-compensation", label: "Pay" },
  { id: "salary-disbursement", label: "Disbursement" },
  { id: "salary-visibility", label: "Visibility" },
];

function rowInputClass() {
  return cn(
    "w-full rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-sm text-[var(--foreground)] shadow-[0_10px_24px_rgba(34,34,34,0.035)] outline-none transition-colors focus:border-[var(--accent)] focus:shadow-[0_0_0_4px_var(--accent-soft)]",
  );
}

function SalaryLineItemsEditor({
  name,
  title,
  description,
  emptyLabel,
}: {
  name: "earnings" | "deductions";
  title: string;
  description: string;
  emptyLabel: string;
}) {
  const { control, register } = useFormContext<SalarySlipFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  return (
    <RepeaterSection
      title={title}
      description={description}
      actionLabel={`Add ${emptyLabel}`}
      onAdd={() => append({ label: "", amount: "" })}
    >
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="rounded-[1.1rem] border border-[var(--border-soft)] bg-[var(--surface-soft)] p-4"
        >
          <div className="flex flex-wrap items-end gap-4">
            <FieldShell
              label={`${emptyLabel} label`}
              htmlFor={`${name}-${index}-label`}
              className="min-w-[8rem] flex-1"
            >
              <input
                id={`${name}-${index}-label`}
                {...register(`${name}.${index}.label` as const)}
                className={rowInputClass()}
                placeholder={name === "earnings" ? "Basic salary" : "Provident fund"}
              />
            </FieldShell>
            <FieldShell
              label="Amount"
              htmlFor={`${name}-${index}-amount`}
              className="w-[9rem] shrink-0"
            >
              <input
                id={`${name}-${index}-amount`}
                type="number"
                {...register(`${name}.${index}.amount` as const)}
                className={rowInputClass()}
                placeholder="0"
              />
            </FieldShell>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={fields.length === 1 && name === "earnings"}
              className="slipwise-btn slipwise-btn-inline-muted inline-flex h-[3rem] shrink-0 items-center justify-center px-4 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ))}
    </RepeaterSection>
  );
}

function SalarySlipPanel({ employees = [], presets = [], initialTemplateId }: WorkspaceProps) {
  const { control, getValues, setValue, trigger, reset } = useFormContextSafe();
  const values = useWatch({ control }) as SalarySlipFormValues;
  const [selectedTemplateId, setSelectedTemplateId] = useState<SalarySlipFormValues["templateId"]>(
    initialTemplateId ? (initialTemplateId as SalarySlipFormValues["templateId"]) : (getValues("templateId") ?? "corporate-clean")
  );
  const previewDocumentWithTemplate = normalizeSalarySlip({
    ...values,
    templateId: selectedTemplateId,
  });
  const [actionState, setActionState] = useState<SalarySlipActionState>({
    status: "idle",
  });
  const [linkedDbEmployeeId, setLinkedDbEmployeeId] = useState<string | undefined>(undefined);
  const [savedId, setSavedId] = useState<string | undefined>(undefined);
  const [slipNumber, setSlipNumber] = useState<string | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);

  async function buildSaveInput() {
    const formValues = getValues();
    const components = [
      ...formValues.earnings.map((e) => ({
        label: e.label,
        amount: parseFloat(e.amount) || 0,
        type: "earning" as const,
      })),
      ...formValues.deductions.map((d) => ({
        label: d.label,
        amount: parseFloat(d.amount) || 0,
        type: "deduction" as const,
      })),
    ];
    return {
      employeeId: linkedDbEmployeeId,
      month: monthNameToNumber(formValues.month),
      year: parseInt(formValues.year) || new Date().getFullYear(),
      formData: formValues as Record<string, unknown>,
      components,
    };
  }

  async function handleSaveDraft() {
    setIsSaving(true);
    try {
      const input = await buildSaveInput();
      if (savedId) {
        const result = await updateSalarySlip(savedId, input);
        if (result.success) {
          reset(getValues(), { keepValues: true });
          toast.success("Salary slip saved");
        } else {
          toast.error(result.error || "Failed to save salary slip");
        }
      } else {
        const result = await saveSalarySlip(input, "draft");
        if (result.success) {
          setSavedId(result.data.id);
          setSlipNumber(result.data.slipNumber);
          reset(getValues(), { keepValues: true });
          toast.success("Salary slip saved");
        } else {
          toast.error(result.error || "Failed to save salary slip");
        }
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRelease() {
    setIsSaving(true);
    try {
      const isValid = await trigger();
      if (!isValid) {
        toast.error("Complete the required salary slip fields before releasing.");
        return;
      }

      const input = await buildSaveInput();
      if (savedId) {
        const updateResult = await updateSalarySlip(savedId, input);
        if (!updateResult.success) {
          toast.error(updateResult.error || "Failed to save salary slip");
          return;
        }
        const releaseResult = await releaseSalarySlip(savedId);
        if (releaseResult.success) {
          reset(getValues(), { keepValues: true });
          toast.success("Salary slip released");
        } else {
          toast.error(releaseResult.error || "Failed to release salary slip");
        }
      } else {
        const result = await saveSalarySlip(input, "released");
        if (result.success) {
          setSavedId(result.data.id);
          setSlipNumber(result.data.slipNumber);
          reset(getValues(), { keepValues: true });
          toast.success("Salary slip released");
        } else {
          toast.error(result.error || "Failed to release salary slip");
        }
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }

  async function prepareDocument() {
    const isValid = await trigger();

    if (!isValid) {
      setActionState({
        status: "error",
        message: "Complete the required salary slip fields before exporting.",
      });
      return null;
    }

    return normalizeSalarySlip({
      ...getValues(),
      templateId: selectedTemplateId,
    });
  }

  async function handleDownload(format: "pdf" | "png") {
    const document = await prepareDocument();

    if (!document) {
      return;
    }

    setActionState({ status: "pending", action: format });

    try {
      const payload = JSON.stringify({ document });
      const downloadUrl = await prepareDocumentExportDownload({
        sessionEndpoint: "/api/export/salary-slip/session",
        payload,
        format,
        fallbackErrorMessage: `Unable to prepare the salary slip ${format.toUpperCase()} export.`,
      });
      setActionState({ status: "success", action: format, downloadUrl });
    } catch (error) {
      setActionState({
        status: "error",
        action: format,
        message:
          error instanceof Error
            ? error.message
            : `Unable to export the salary slip as ${format.toUpperCase()}.`,
      });
    }
  }

  async function handlePrint() {
    const document = await prepareDocument();

    if (!document) {
      return;
    }

    const printWindow = window.open(
      "about:blank",
      "_blank",
      "popup=yes,width=1060,height=1320",
    );

    if (!printWindow) {
      setActionState({
        status: "error",
        message: "Allow popups to open the salary slip print surface.",
      });
      return;
    }

    setActionState({ status: "pending", action: "print" });

    try {
      const response = await fetch("/api/export/salary-slip/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ document }),
      });

      if (!response.ok) {
        throw new Error("Unable to prepare the salary slip print surface.");
      }

      const payload = (await response.json()) as { printUrl?: string };

      if (!payload.printUrl) {
        throw new Error("Unable to prepare the salary slip print surface.");
      }

      printWindow.location.href = payload.printUrl;
      setActionState({ status: "idle" });
    } catch (error) {
      printWindow.close();
      setActionState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to prepare the salary slip print surface.",
      });
    }
  }

  return (
    <>
    <DocumentWorkspaceLayout
      eyebrow="Salary slip workspace"
      title="Salary Slip Generator"
      description="Prepare payroll documents in a cleaner workspace with structured employee data, live preview, and export actions that stay close to the final output."
      actions={[
        { id: "home", label: "Back to home", href: "/", variant: "secondary" },
        {
          id: "print",
          label:
            actionState.status === "pending" && actionState.action === "print"
              ? "Preparing print"
              : "Print salary slip",
          onClick: handlePrint,
          disabled: actionState.status === "pending",
          variant: "secondary",
        },
        {
          id: "pdf",
          label:
            actionState.status === "pending" && actionState.action === "pdf"
              ? "Exporting PDF"
              : "Export PDF",
          onClick: () => handleDownload("pdf"),
          disabled: actionState.status === "pending",
          variant: "primary",
        },
        {
          id: "png",
          label:
            actionState.status === "pending" && actionState.action === "png"
              ? "Exporting PNG"
              : "Export PNG",
          onClick: () => handleDownload("png"),
          disabled: actionState.status === "pending",
          variant: "subtle",
        },
      ] satisfies WorkspaceAction[]}
      errorMessage={actionState.status === "error" ? actionState.message : undefined}
      exportDialog={
        actionState.status === "pending" && actionState.action !== "print"
          ? ({
              state: "pending",
              format: actionState.action,
              onClose: () => setActionState({ status: "idle" }),
            } satisfies WorkspaceExportDialog)
          : actionState.status === "success"
            ? ({
                state: "success",
                format: actionState.action,
                onClose: () => setActionState({ status: "idle" }),
                onRetry: () => {
                  startDocumentExportDownload(actionState.downloadUrl);
                },
              } satisfies WorkspaceExportDialog)
            : actionState.status === "error" && actionState.action
              ? ({
                  state: "error",
                  format: actionState.action,
                  errorMessage: actionState.message,
                  onClose: () => setActionState({ status: "idle" }),
                  onRetry: () => {
                    if (actionState.action) {
                      void handleDownload(actionState.action);
                    }
                  },
              } satisfies WorkspaceExportDialog)
            : undefined
      }
      builderEyebrow="Salary controls"
      builderTitle="Build the payroll document"
      builderDescription="Move through setup, employee data, pay details, and visibility controls while the preview stays available on the right."
      sections={salaryWorkspaceSections}
      previewEyebrow="Preview"
      previewTitle="Live A4 document"
      previewDescription="Review the salary slip while you edit. Payroll rows, attendance context, and optional blocks rebalance immediately."
      builderContent={
        <>
          <div id="salary-setup" className="scroll-mt-28">
              <FormSection
                eyebrow="Template"
                title="Template and branding"
                description="Switch between salary slip layouts without resetting the form."
              >
                <FieldShell label="Salary slip template">
                  <div className="grid gap-3">
                    {salarySlipTemplateOptions.map((template) => {
                      const active = template.id === selectedTemplateId;

                      return (
                        <button
                          key={template.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setSelectedTemplateId(template.id);
                            setValue("templateId", template.id, {
                              shouldDirty: true,
                              shouldTouch: true,
                              shouldValidate: true,
                            });
                          }}
                          className={cn(
                            "rounded-[1.05rem] border px-4 py-3 text-left shadow-[0_12px_28px_rgba(34,34,34,0.04)] transition-colors",
                            active
                              ? "border-[var(--accent)] bg-white"
                              : "border-[var(--border-soft)] bg-white/88 hover:bg-white",
                          )}
                        >
                          <span className="block text-sm font-medium text-[var(--foreground)]">
                            {template.name}
                          </span>
                          <span className="mt-1 block text-xs leading-6 text-[var(--muted-foreground)]">
                            {template.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </FieldShell>
                <div className="rounded-[1rem] border border-[var(--border-soft)] bg-white px-4 py-3 text-sm leading-7 text-[var(--muted-foreground)]">
                  {
                    salarySlipTemplateOptions.find(
                      (template) => template.id === selectedTemplateId,
                    )?.description
                  }
                </div>
                <TextField<SalarySlipFormValues>
                  name="branding.companyName"
                  label="Company name"
                  placeholder="Northfield Trading Co."
                />
                <TextAreaField<SalarySlipFormValues>
                  name="branding.address"
                  label="Address"
                  rows={3}
                  placeholder="18 Market Road, Kozhikode"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="branding.email"
                    label="Email"
                    placeholder="accounts@example.com"
                  />
                  <TextField<SalarySlipFormValues>
                    name="branding.phone"
                    label="Phone"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField<SalarySlipFormValues>
                    name="branding.accentColor"
                    label="Accent color"
                  />
                  <FileUploadField<SalarySlipFormValues>
                    name="branding.logoDataUrl"
                    label="Logo upload"
                    hint="Session-only asset for the live preview."
                  />
                </div>
              </FormSection>
          </div>

          <div id="salary-employee" className="scroll-mt-28">
              <FormSection
                eyebrow="Employee"
                title="Employee details"
                description="Define the person and role this salary slip belongs to."
              >
                <EmployeePicker
                  employees={employees}
                  onSelect={setLinkedDbEmployeeId}
                />
                <TextField<SalarySlipFormValues>
                  name="employeeName"
                  label="Employee name"
                  required
                  placeholder="Arun Dev"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="employeeId"
                    label="Employee ID"
                    placeholder="EMP-041"
                  />
                  <TextField<SalarySlipFormValues>
                    name="designation"
                    label="Designation"
                    placeholder="Site Coordinator"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="department"
                    label="Department"
                    placeholder="Operations"
                  />
                  <TextField<SalarySlipFormValues>
                    name="workLocation"
                    label="Work location"
                    placeholder="Kozhikode HQ"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="pan"
                    label="PAN"
                    placeholder="FJTPD2148Q"
                  />
                  <TextField<SalarySlipFormValues>
                    name="uan"
                    label="UAN"
                    placeholder="100458732145"
                  />
                </div>
                <TextField<SalarySlipFormValues>
                  name="joiningDate"
                  label="Joining date"
                  type="date"
                />
              </FormSection>
          </div>

          <div id="salary-period" className="scroll-mt-28">
              <FormSection
                eyebrow="Period"
                title="Pay period and attendance"
                description="Attendance values are informational here and do not drive payroll proration."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="month"
                    label="Month"
                    required
                    placeholder="March"
                  />
                  <TextField<SalarySlipFormValues>
                    name="year"
                    label="Year"
                    required
                    type="number"
                    placeholder="2026"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="payDate"
                    label="Pay date"
                    type="date"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="workingDays"
                    label="Working days"
                    type="number"
                    placeholder="31"
                  />
                  <TextField<SalarySlipFormValues>
                    name="paidDays"
                    label="Paid days"
                    type="number"
                    placeholder="30"
                  />
                  <TextField<SalarySlipFormValues>
                    name="leaveDays"
                    label="Leave days"
                    type="number"
                    placeholder="1"
                  />
                  <TextField<SalarySlipFormValues>
                    name="lossOfPayDays"
                    label="Loss of pay"
                    type="number"
                    placeholder="0"
                  />
                </div>
              </FormSection>
          </div>

          <div id="salary-compensation" className="scroll-mt-28">
              <FormSection
                eyebrow="Compensation"
                title="Earnings and deductions"
                description="Totals and net salary update instantly from the repeatable rows below."
              >
                <PresetApplyButton presets={presets} />
                <SalaryLineItemsEditor
                  name="earnings"
                  title="Earnings"
                  description="Add every earning component that contributes to the gross salary."
                  emptyLabel="earning"
                />
                <SalaryLineItemsEditor
                  name="deductions"
                  title="Deductions"
                  description="List deductions such as provident fund, tax, or salary advances."
                  emptyLabel="deduction"
                />
              </FormSection>
          </div>

          <div id="salary-disbursement" className="scroll-mt-28">
              <FormSection
                eyebrow="Disbursement"
                title="Notes and signature"
                description="This section controls how the pay note and acknowledgement appear in the preview."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="paymentMethod"
                    label="Payment method"
                    placeholder="Bank transfer"
                  />
                  <TextField<SalarySlipFormValues>
                    name="bankName"
                    label="Bank name"
                    placeholder="Federal Bank"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<SalarySlipFormValues>
                    name="bankAccountNumber"
                    label="Account number"
                    placeholder="XXXX2841"
                  />
                  <TextField<SalarySlipFormValues>
                    name="bankIfsc"
                    label="IFSC"
                    placeholder="FDRL0001220"
                  />
                </div>
                <TextAreaField<SalarySlipFormValues>
                  name="notes"
                  label="Notes"
                  rows={3}
                  placeholder="Salary credited after attendance review."
                />
                <TextField<SalarySlipFormValues>
                  name="preparedBy"
                  label="Prepared by"
                  placeholder="Anita Thomas"
                />
              </FormSection>
          </div>

          <div id="salary-visibility" className="scroll-mt-28">
              <FormSection
                eyebrow="Visibility"
                title="Show or hide optional blocks"
                description="These controls let the preview collapse optional payroll details cleanly."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showAddress"
                    label="Address"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showEmail"
                    label="Email"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showPhone"
                    label="Phone"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showEmployeeId"
                    label="Employee ID"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showDepartment"
                    label="Department"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showDesignation"
                    label="Designation"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showPan"
                    label="PAN"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showUan"
                    label="UAN"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showBankDetails"
                    label="Bank details"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showJoiningDate"
                    label="Joining date"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showWorkLocation"
                    label="Work location"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showAttendance"
                    label="Attendance summary"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showNotes"
                    label="Notes"
                  />
                  <ToggleField<SalarySlipFormValues>
                    name="visibility.showSignature"
                    label="Signature area"
                  />
                </div>
              </FormSection>
          </div>
        </>
      }
      previewContent={<SalarySlipPreview document={previewDocumentWithTemplate} />}
      documentEditorContent={<SalarySlipEditableCanvas document={previewDocumentWithTemplate} />}
    />
    <SalarySlipSaveBar
      onSaveDraft={handleSaveDraft}
      onRelease={handleRelease}
      isSaving={isSaving}
      savedId={savedId}
      slipNumber={slipNumber}
    />
    </>
  );
}

function useFormContextSafe() {
  return useFormContext<SalarySlipFormValues>();
}

function SalarySlipEditableCanvas({ document }: { document: SalarySlipDocument }) {
  const template = salarySlipTemplateRegistry[document.templateId];
  return (
    <DocumentPreviewSurface title={document.title} templateName={template?.name ?? "Salary Slip"}>
      <SalarySlipDocumentFrame document={document} mode="edit" />
    </DocumentPreviewSurface>
  );
}

export function SalarySlipWorkspace({ employees = [], presets = [], initialTemplateId, initialAccentColor }: WorkspaceProps) {
  const methods = useForm<SalarySlipFormValues>({
    resolver: zodResolver(salarySlipFormSchema),
    defaultValues: { ...salarySlipDefaultValues, branding: { ...salarySlipDefaultValues.branding, accentColor: initialAccentColor ?? salarySlipDefaultValues.branding.accentColor } },
    mode: "onChange",
  });

  return (
    <FormProvider {...methods}>
      <SalarySlipPanel employees={employees} presets={presets} initialTemplateId={initialTemplateId} />
    </FormProvider>
  );
}
