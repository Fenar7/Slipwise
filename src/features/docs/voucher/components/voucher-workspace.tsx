"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FormProvider,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldShell } from "@/components/forms/field-shell";
import { FormSection } from "@/components/forms/form-section";
import {
  ColorField,
  FileUploadField,
  SelectField,
  TextAreaField,
  TextField,
  ToggleField,
} from "@/components/forms/input-primitives";
import {
  DocumentWorkspaceLayout,
  type WorkspaceExportDialog,
  type WorkspaceAction,
  type WorkspaceSectionMeta,
} from "@/components/foundation/document-workspace-layout";
import {
  voucherDefaultValues,
  voucherTemplateOptions,
} from "@/features/docs/voucher/constants";
import { VoucherPreview } from "@/features/docs/voucher/components/voucher-preview";
import { VoucherDocumentFrame } from "@/features/docs/voucher/components/voucher-document-frame";
import { VendorPicker } from "@/features/docs/voucher/components/vendor-picker";
import { TagPicker } from "@/components/tags/tag-picker";
import { getVoucherTags, getVendorDefaultTags } from "@/lib/tags/assignment-service";
import { MultiLineVoucherEditor } from "@/features/docs/voucher/components/multi-line-voucher-editor";
import { VoucherSaveBar } from "@/features/docs/voucher/components/voucher-save-bar";
import { voucherFormSchema } from "@/features/docs/voucher/schema";
import type { VoucherDocument, VoucherFormValues } from "@/features/docs/voucher/types";
import { voucherTemplateRegistry } from "@/features/docs/voucher/templates";
import { normalizeVoucher } from "@/features/docs/voucher/utils/normalize-voucher";
import {
  prepareDocumentExportDownload,
  startDocumentExportDownload,
} from "@/lib/browser/document-export-handoff";
import { normalizeMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { DocumentPreviewSurface } from "@/components/document/document-preview-surface";
import {
  saveVoucher,
  updateVoucher,
  type VoucherInput,
} from "@/app/app/docs/vouchers/actions";

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  gstin: string | null;
}

type VoucherActionState =
  | { status: "idle" }
  | { status: "pending"; action: "print" | "pdf" | "png" }
  | { status: "success"; action: "pdf" | "png"; downloadUrl: string }
  | { status: "error"; action?: "pdf" | "png"; message: string };

const voucherWorkspaceSections: WorkspaceSectionMeta[] = [
  { id: "voucher-setup", label: "Setup" },
  { id: "voucher-branding", label: "Brand" },
  { id: "voucher-details", label: "Details" },
  { id: "voucher-tags", label: "Tags" },
  { id: "voucher-approvals", label: "Approvals" },
  { id: "voucher-visibility", label: "Visibility" },
];

function buildLines(values: VoucherFormValues): VoucherInput["lines"] {
  if (values.isMultiLine && values.lineItems?.length) {
    return values.lineItems.map((item) => ({
      description: item.description,
      date: item.date || undefined,
      time: item.time || undefined,
      amount: normalizeMoney(item.amount),
      category: item.category || undefined,
    }));
  }
  return [{ description: values.purpose, amount: normalizeMoney(values.amount) }];
}

function VoucherPanel({
  voucherId,
  vendors,
  initialTemplateId,
}: {
  voucherId?: string;
  vendors: Vendor[];
  initialTemplateId?: string;
}) {
  const { control, getValues, setValue, trigger } = useFormContextSafe();
  const values = useWatch({ control }) as VoucherFormValues;
  const isPayment = values.voucherType === "payment";
  const isMultiLine = values.isMultiLine ?? false;
  const [selectedTemplateId, setSelectedTemplateId] = useState<VoucherFormValues["templateId"]>(
    initialTemplateId ? (initialTemplateId as VoucherFormValues["templateId"]) : (getValues("templateId") ?? "minimal-office")
  );
  const visibility = values.visibility;
  const previewDocument = normalizeVoucher({
    ...values,
    templateId: selectedTemplateId,
  });
  const [actionState, setActionState] = useState<VoucherActionState>({
    status: "idle",
  });
  const isEditing = Boolean(voucherId);

  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(voucherId);
  const [savedNumber, setSavedNumber] = useState<string | undefined>(
    voucherId ? values.voucherNumber : undefined
  );
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagIdsLoaded, setTagIdsLoaded] = useState(false);

  useEffect(() => {
    if (voucherId && !tagIdsLoaded) {
      getVoucherTags(voucherId).then((result) => {
        if (result.success) {
          setTagIds(result.data.map((t) => t.id));
        }
        setTagIdsLoaded(true);
      });
    } else if (!voucherId) {
      setTagIdsLoaded(true);
    }
  }, [voucherId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync multi-line total → amount field so preview stays live
  useEffect(() => {
    const lineItems = values.lineItems ?? [];
    if (isMultiLine && lineItems.length > 0) {
      const total = lineItems.reduce(
        (sum, item) => sum + normalizeMoney(item.amount),
        0
      );
      setValue("amount", total.toFixed(2));
    }
  }, [isMultiLine, setValue, values.lineItems]);

  const handleSaveDraft = useCallback(async () => {
    setIsSaving(true);
    try {
      const currentValues = getValues();
      const input: VoucherInput = {
        vendorId: currentValues.vendorId,
        voucherDate: currentValues.date,
        type: currentValues.voucherType,
        isMultiLine: currentValues.isMultiLine,
        formData: currentValues as Record<string, unknown>,
        lines: buildLines(currentValues),
        tagIds,
      };
      if (savedId) {
        const result = await updateVoucher(savedId, input);
        if (result.success) {
          toast.success("Voucher saved");
        } else {
          toast.error(result.error || "Failed to save voucher");
        }
      } else {
        const result = await saveVoucher(input, "draft");
        if (result.success) {
          setSavedId(result.data.id);
          setSavedNumber(result.data.voucherNumber);
          toast.success("Voucher saved");
        } else {
          toast.error(result.error || "Failed to save voucher");
        }
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [getValues, savedId]);

  const handleApprove = useCallback(async () => {
    setIsSaving(true);
    try {
      const isValid = await trigger();
      if (!isValid) {
        toast.error("Complete the required voucher fields before approving.");
        return;
      }

      const currentValues = getValues();
      const input: VoucherInput = {
        vendorId: currentValues.vendorId,
        voucherDate: currentValues.date,
        type: currentValues.voucherType,
        isMultiLine: currentValues.isMultiLine,
        status: "approved",
        formData: currentValues as Record<string, unknown>,
        lines: buildLines(currentValues),
        tagIds,
      };
      if (savedId) {
        const result = await updateVoucher(savedId, input);
        if (result.success) {
          if (result.data.voucherNumber) {
            setSavedNumber(result.data.voucherNumber);
            setValue("voucherNumber", result.data.voucherNumber);
          }
          toast.success("Voucher approved");
        } else {
          toast.error(result.error || "Failed to approve voucher");
        }
      } else {
        const result = await saveVoucher(input, "approved");
        if (result.success) {
          setSavedId(result.data.id);
          setSavedNumber(result.data.voucherNumber);
          toast.success("Voucher approved");
        } else {
          toast.error(result.error || "Failed to approve voucher");
        }
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  }, [getValues, savedId, setValue, trigger]);

  async function prepareDocument() {
    const isValid = await trigger();

    if (!isValid) {
      setActionState({
        status: "error",
        message: "Complete the required voucher fields before exporting.",
      });
      return null;
    }

    return normalizeVoucher({
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
        sessionEndpoint: "/api/export/session",
        payload,
        format,
        fallbackErrorMessage: `Unable to prepare the voucher ${format.toUpperCase()} export.`,
      });
      setActionState({ status: "success", action: format, downloadUrl });
    } catch (error) {
      setActionState({
        status: "error",
        action: format,
        message:
          error instanceof Error
            ? error.message
            : `Unable to export the voucher as ${format.toUpperCase()}.`,
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
        message: "Allow popups to open the voucher print surface.",
      });
      return;
    }

    setActionState({ status: "pending", action: "print" });

    try {
      const response = await fetch("/api/export/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ document }),
      });

      if (!response.ok) {
        throw new Error("Unable to prepare the voucher print surface.");
      }

      const payload = (await response.json()) as { printUrl?: string };

      if (!payload.printUrl) {
        throw new Error("Unable to prepare the voucher print surface.");
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
            : "Unable to prepare the voucher print surface.",
      });
    }
  }

  // Visual accent classes driven by voucher type
  const typeBannerClass = isPayment
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : "bg-green-50 border-green-200 text-green-700";

  return (
    <>
      <DocumentWorkspaceLayout
        eyebrow="Voucher workspace"
        title={isEditing ? "Edit Voucher" : "Voucher Generator"}
        description={
          isEditing
            ? "Update the voucher details and export when ready."
            : "Create payment and receipt vouchers in a cleaner workspace with live preview, structured input, and export actions that stay close to the document."
        }
        actions={[
          { id: "home", label: "Back to vault", href: "/app/docs/vouchers", variant: "secondary" },
          {
            id: "print",
            label:
              actionState.status === "pending" && actionState.action === "print"
                ? "Preparing print"
                : "Print voucher",
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
        builderEyebrow="Voucher controls"
        builderTitle="Build the document"
        builderDescription="Move from setup to core details, approvals, and visibility without losing the live preview on the right."
        sections={voucherWorkspaceSections}
        previewEyebrow="Preview"
        previewTitle="Live A4 document"
        previewDescription="Review the final voucher while you edit. Template, branding, and field visibility update immediately."
        builderContent={
          <>
            <div id="voucher-setup" className="scroll-mt-28">
                <FormSection
                  eyebrow="Template"
                  title="Template and voucher mode"
                  description="Switch layouts or voucher type without losing the entered form state."
                >
                  {/* Type indicator banner */}
                  <div className={cn("rounded-lg border px-3 py-2 text-sm font-medium", typeBannerClass)}>
                    {isPayment
                      ? "💸 Payment Voucher — money going out"
                      : "💰 Receipt Voucher — money coming in"}
                  </div>

                  <FieldShell label="Voucher template">
                    <div className="grid gap-3">
                      {voucherTemplateOptions.map((template) => {
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
                      voucherTemplateOptions.find(
                        (template) => template.id === selectedTemplateId,
                      )?.description
                    }
                  </div>
                  <SelectField<VoucherFormValues>
                    name="voucherType"
                    label="Voucher type"
                    required
                    options={[
                      { value: "payment", label: "Payment voucher" },
                      { value: "receipt", label: "Receipt voucher" },
                    ]}
                  />
                </FormSection>
            </div>

            <div id="voucher-branding" className="scroll-mt-28">
                <FormSection
                  eyebrow="Branding"
                  title="Business identity"
                  description="Logo and accent color apply instantly to the live preview."
                >
                  <TextField<VoucherFormValues>
                    name="branding.companyName"
                    label="Company name"
                    placeholder="Northfield Trading Co."
                  />
                  <TextAreaField<VoucherFormValues>
                    name="branding.address"
                    label="Address"
                    rows={3}
                    placeholder="18 Market Road, Kozhikode"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField<VoucherFormValues>
                      name="branding.email"
                      label="Email"
                      placeholder="accounts@example.com"
                    />
                    <TextField<VoucherFormValues>
                      name="branding.phone"
                      label="Phone"
                      placeholder="+91 98765 43210"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField<VoucherFormValues>
                      name="branding.accentColor"
                      label="Accent color"
                    />
                    <FileUploadField<VoucherFormValues>
                      name="branding.logoDataUrl"
                      label="Logo upload"
                      hint="Session-only asset for the preview."
                    />
                  </div>
                </FormSection>
            </div>

            <div id="voucher-details" className="scroll-mt-28">
                <FormSection
                  eyebrow="Voucher details"
                  title="Core voucher information"
                  description="These fields drive the document content and validation."
                >
                  {/* Enter key focus-next container */}
                  <div
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        e.target instanceof HTMLInputElement
                      ) {
                        e.preventDefault();
                        const focusables = Array.from(
                          e.currentTarget.querySelectorAll<
                            HTMLInputElement | HTMLSelectElement
                          >("input, select")
                        );
                        const idx = focusables.indexOf(
                          e.target as HTMLInputElement
                        );
                        if (idx >= 0 && idx < focusables.length - 1) {
                          focusables[idx + 1].focus();
                        }
                      }
                    }}
                    className="space-y-4"
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <TextField<VoucherFormValues>
                        name="voucherNumber"
                        label="Voucher number"
                        placeholder="Assigned when approved"
                      />
                      <TextField<VoucherFormValues>
                        name="date"
                        label="Date"
                        required
                        type="date"
                      />
                    </div>

                    {/* Vendor picker — pre-fills counterpartyName */}
                    <VendorPicker
                      vendors={vendors}
                      label={isPayment ? "Select vendor" : "Select from"}
                      onSelect={(vendor) => {
                        if (tagIds.length === 0) {
                          getVendorDefaultTags(vendor.id).then((result) => {
                            if (result.success && result.data.length > 0) {
                              const defaultIds = result.data.map((t) => t.id);
                              if (!defaultIds.some((id) => tagIds.includes(id))) {
                                setTagIds([...tagIds, ...defaultIds]);
                              }
                            }
                          });
                        }
                      }}
                    />

                    <TextField<VoucherFormValues>
                      name="counterpartyName"
                      label={isPayment ? "Paid to" : "Received from"}
                      required
                      placeholder={isPayment ? "Rahul Menon" : "Priya Nair"}
                    />

                    {/* Entry mode toggle */}
                    <FieldShell label="Entry mode">
                      <div className="flex rounded-lg border border-[var(--border-soft)] bg-[var(--surface-soft)] p-1 gap-1">
                        <button
                          type="button"
                          onClick={() => setValue("isMultiLine", false, { shouldDirty: true })}
                          className={cn(
                            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                            !isMultiLine
                              ? "bg-white shadow-sm text-[var(--foreground)]"
                              : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                          )}
                        >
                          Single Entry
                        </button>
                        <button
                          type="button"
                          onClick={() => setValue("isMultiLine", true, { shouldDirty: true })}
                          className={cn(
                            "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                            isMultiLine
                              ? "bg-white shadow-sm text-[var(--foreground)]"
                              : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                          )}
                        >
                          Multi-line (Grouped)
                        </button>
                      </div>
                    </FieldShell>

                    {isMultiLine ? (
                      <MultiLineVoucherEditor />
                    ) : (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <TextField<VoucherFormValues>
                          name="amount"
                          label="Amount"
                          required
                          type="number"
                          placeholder="1850"
                        />
                        {visibility.showPaymentMode ? (
                          <TextField<VoucherFormValues>
                            name="paymentMode"
                            label="Payment mode"
                            placeholder="Cash / Bank transfer"
                          />
                        ) : null}
                      </div>
                    )}

                    {visibility.showReferenceNumber ? (
                      <TextField<VoucherFormValues>
                        name="referenceNumber"
                        label="Reference number"
                        placeholder="REF-8831"
                      />
                    ) : null}
                    <TextAreaField<VoucherFormValues>
                      name="purpose"
                      label="Purpose / narration"
                      required
                      rows={4}
                      placeholder="Travel reimbursement for site visit."
                    />
                    {visibility.showNotes ? (
                      <TextAreaField<VoucherFormValues>
                        name="notes"
                        label="Notes / remarks"
                        rows={3}
                        placeholder="Settled after manager approval."
                      />
                    ) : null}
                  </div>
                </FormSection>
            </div>

            <div id="voucher-tags" className="scroll-mt-28">
              <FormSection
                eyebrow="Tags"
                title="Document tags"
                description="Add tags to categorize this voucher. Tags are internal and not shown on the PDF."
              >
                <TagPicker
                  value={tagIds}
                  onChange={setTagIds}
                  placeholder="Add tags..."
                />
              </FormSection>
            </div>

            <div id="voucher-approvals" className="scroll-mt-28">
                <FormSection
                  eyebrow="Approvals"
                  title="Signature and authorization"
                  description="Only the enabled blocks appear in the preview."
                >
                  {visibility.showApprovedBy ? (
                    <TextField<VoucherFormValues>
                      name="approvedBy"
                      label="Approved by"
                      placeholder="Anita Thomas"
                    />
                  ) : null}
                  {visibility.showReceivedBy ? (
                    <TextField<VoucherFormValues>
                      name="receivedBy"
                      label="Received by"
                      placeholder="Rahul Menon"
                    />
                  ) : null}
                </FormSection>
            </div>

            <div id="voucher-visibility" className="scroll-mt-28">
                <FormSection
                  eyebrow="Visibility"
                  title="Show or hide optional fields"
                  description="These toggles immediately rebalance the preview layout."
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ToggleField<VoucherFormValues>
                      name="visibility.showAddress"
                      label="Address"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showEmail"
                      label="Email"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showPhone"
                      label="Phone"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showPaymentMode"
                      label="Payment mode"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showReferenceNumber"
                      label="Reference number"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showNotes"
                      label="Notes"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showApprovedBy"
                      label="Approved by"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showReceivedBy"
                      label="Received by"
                    />
                    <ToggleField<VoucherFormValues>
                      name="visibility.showSignatureArea"
                      label="Signature area"
                    />
                  </div>
                </FormSection>
            </div>
          </>
        }
        previewContent={<VoucherPreview document={previewDocument} />}
        documentEditorContent={<VoucherEditableCanvas document={previewDocument} />}
      />
      <VoucherSaveBar
        onSaveDraft={handleSaveDraft}
        onApprove={handleApprove}
        isSaving={isSaving}
        savedId={savedId}
        voucherNumber={savedNumber}
        voucherType={values.voucherType}
      />
    </>
  );
}

function useFormContextSafe() {
  return useFormContext<VoucherFormValues>();
}

function VoucherEditableCanvas({ document }: { document: VoucherDocument }) {
  const template = voucherTemplateRegistry[document.templateId];
  return (
    <DocumentPreviewSurface
      title={document.title}
      templateName={template?.name ?? "Voucher"}
    >
      <VoucherDocumentFrame document={document} mode="edit" />
    </DocumentPreviewSurface>
  );
}

export function VoucherWorkspace({
  voucherId,
  initialValues,
  vendors = [],
  initialTemplateId,
}: {
  voucherId?: string;
  initialValues?: Partial<VoucherFormValues>;
  vendors?: Vendor[];
  initialTemplateId?: string;
}) {
  const methods = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: initialValues
      ? { ...voucherDefaultValues, ...initialValues }
      : voucherDefaultValues,
    mode: "onChange",
  });

  return (
    <FormProvider {...methods}>
      <VoucherPanel voucherId={voucherId} vendors={vendors} initialTemplateId={initialTemplateId} />
    </FormProvider>
  );
}
