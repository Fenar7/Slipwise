"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Settings, Palette, FileText, CheckCircle, Eye, Tag } from "lucide-react";
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
import { MultiLineVoucherEditor } from "@/features/docs/voucher/components/multi-line-voucher-editor";
import { VoucherSaveBar } from "@/features/docs/voucher/components/voucher-save-bar";
import { TagPicker } from "@/features/tags/components/tag-picker";
import { trackTagApplied } from "@/lib/tags/telemetry";
import { getSuggestedTags, type SuggestedTag } from "@/lib/tags/suggestion-service";
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
import { resolveVoucherAutofill, type VoucherAutofillPayload } from "@/app/app/docs/vouchers/autofill-resolver";
import { StaleDataBanner } from "@/components/foundation/stale-data-banner";
import { VOUCHER_MANAGED_FIELDS } from "@/app/app/docs/shared/defaulting/managed-fields";
import { staleLabel } from "@/app/app/docs/shared/defaulting/stale-detection";
import type { StaleInfo, BaselineMetadata } from "@/app/app/docs/shared/defaulting/types";

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
  initialAutofill,
}: {
  voucherId?: string;
  vendors: Vendor[];
  initialTemplateId?: string;
  initialAutofill?: VoucherAutofillPayload | null;
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


  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(voucherId);
  const [savedNumber, setSavedNumber] = useState<string | undefined>(
    voucherId ? values.voucherNumber : undefined
  );
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedTag[]>([]);

  const overriddenRef = useRef<Set<string>>(new Set());
  const lastAutofillRef = useRef<Record<string, unknown>>({});
  const [staleInfo, setStaleInfo] = useState<StaleInfo | null>(null);
  const baselineRef = useRef<BaselineMetadata | null>(null);

  const checkStaleAgainst = useCallback((payload: VoucherAutofillPayload) => {
    if (!baselineRef.current) return;
    const b = baselineRef.current;
    const entityChanged = b.entityFingerprint !== null && b.entityId === payload.baseline.entityId
      ? b.entityFingerprint !== payload.baseline.entityFingerprint
      : false;
    const orgChanged = b.orgDefaultsFingerprint !== null
      ? b.orgDefaultsFingerprint !== payload.baseline.orgDefaultsFingerprint
      : false;
    if (entityChanged && orgChanged) {
      setStaleInfo({ stale: true, source: "both", label: staleLabel("both") });
    } else if (entityChanged) {
      setStaleInfo({ stale: true, source: "entity", label: staleLabel("entity") });
    } else if (orgChanged) {
      setStaleInfo({ stale: true, source: "orgDefaults", label: staleLabel("orgDefaults") });
    }
  }, []);

  const managedFieldWriters: Record<string, (p: VoucherAutofillPayload) => void> = useMemo(() => ({
    counterpartyName: (p) => setValue("counterpartyName", p.counterpartyName),
    notes: (p) => setValue("notes", p.notes),
    approvedBy: (p) => setValue("approvedBy", p.approvedBy),
    receivedBy: (p) => setValue("receivedBy", p.receivedBy),
    paymentMode: (p) => setValue("paymentMode", p.paymentMode),
    "branding.companyName": (p) => setValue("branding.companyName", p.branding.companyName),
    "branding.address": (p) => setValue("branding.address", p.branding.address),
    "branding.email": (p) => setValue("branding.email", p.branding.email),
    "branding.phone": (p) => setValue("branding.phone", p.branding.phone),
    "branding.accentColor": (p) => setValue("branding.accentColor", p.branding.accentColor),
    templateId: (p) => { setSelectedTemplateId(p.templateId as VoucherFormValues["templateId"]); setValue("templateId", p.templateId as VoucherFormValues["templateId"]); },
    date: (p) => setValue("date", p.date),
    vendorId: (p) => setValue("vendorId", p.vendorId || undefined),
  }), [setValue]);

  const loadSuggestions = async (vendorId: string) => {
    try {
      const result = await getSuggestedTags({ counterpartyId: vendorId, counterpartyType: "vendor", documentType: "voucher", limit: 8 });
      setSuggestions(result.filter((s) => s.source !== "default"));
    } catch { setSuggestions([]); }
  };

  const hydrateFromAutofill = useCallback((payload: VoucherAutofillPayload, respectOverrides = true) => {
    if (!respectOverrides) {
      for (const key of VOUCHER_MANAGED_FIELDS) {
        const writer = managedFieldWriters[key];
        if (writer) writer(payload);
      }
    } else {
      setValue("vendorId", payload.vendorId || undefined);
      for (const key of VOUCHER_MANAGED_FIELDS) {
        if (key === "vendorId") continue;
        if (overriddenRef.current.has(key)) continue;
        const writer = managedFieldWriters[key];
        if (writer) writer(payload);
      }
    }
    lastAutofillRef.current = { counterpartyName: payload.counterpartyName, notes: payload.notes, approvedBy: payload.approvedBy, receivedBy: payload.receivedBy, paymentMode: payload.paymentMode, date: payload.date, templateId: payload.templateId };
    if (payload.baseline) baselineRef.current = payload.baseline;
  }, [managedFieldWriters, setValue]);

  const handleVendorChange = useCallback(async (vendorId: string) => {
    try {
      const payload = await resolveVoucherAutofill({ vendorId });
      checkStaleAgainst(payload);
      hydrateFromAutofill(payload, true);
    } catch { /* keep current */ }
    loadSuggestions(vendorId);
  }, [hydrateFromAutofill, checkStaleAgainst]);

  const handleVendorClear = useCallback(async () => {
    try {
      const payload = await resolveVoucherAutofill({});
      hydrateFromAutofill(payload, true);
      setStaleInfo(null);
    } catch { /* keep current */ }
    setSuggestions([]);
  }, [hydrateFromAutofill]);

  const didHydrateRef = useRef(false);
  useEffect(() => {
    if (initialAutofill && !didHydrateRef.current) {
      didHydrateRef.current = true;
      hydrateFromAutofill(initialAutofill, false);
    }
  }, [initialAutofill, hydrateFromAutofill]);

  useEffect(() => {
    for (const key of VOUCHER_MANAGED_FIELDS) {
      if (overriddenRef.current.has(key)) continue;
      const lastVal = lastAutofillRef.current[key];
      if (lastVal === undefined) continue;
      if ((values as Record<string, unknown>)[key] !== lastVal) {
        overriddenRef.current.add(key);
      }
    }
  }, [values]);

  const handleRefreshDefaults = useCallback(async () => {
    const vid = getValues("vendorId");
    try {
      const payload = await resolveVoucherAutofill({ vendorId: vid || undefined });
      baselineRef.current = payload.baseline;
      hydrateFromAutofill(payload, true);
      setStaleInfo(null);
      toast.success("Defaults refreshed");
    } catch { toast.error("Could not refresh defaults"); }
  }, [getValues, hydrateFromAutofill]);

  const handleReapplyAll = useCallback(async () => {
    const vid = getValues("vendorId");
    try {
      const payload = await resolveVoucherAutofill({ vendorId: vid || undefined });
      overriddenRef.current = new Set();
      baselineRef.current = payload.baseline;
      hydrateFromAutofill(payload, false);
      setStaleInfo(null);
      toast.success("All defaults reapplied");
    } catch { toast.error("Could not reapply defaults"); }
  }, [getValues, hydrateFromAutofill]);

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
          if (tagIds.length > 0) trackTagApplied("voucher", tagIds.length);
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
      <StaleDataBanner
        visible={staleInfo !== null}
        label={staleInfo?.label ?? ""}
        onRefresh={handleRefreshDefaults}
        onReapplyAll={handleReapplyAll}
        className="mx-4 mt-2"
      />
      <DocumentWorkspaceLayout
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
        sections={voucherWorkspaceSections}
        builderContent={
          <>
            <div id="voucher-setup" className="scroll-mt-28">
                <FormSection
                  icon={<Settings className="h-4 w-4" />}

                  title="Template and voucher mode"
                  description="Switch layouts or voucher type without losing the entered form state."
                >
                  {/* Type indicator banner */}
                  <div className={cn("rounded-md px-3 py-2 text-sm font-medium", typeBannerClass)}>
                    {isPayment
                      ? "Payment Voucher — money going out"
                      : "Receipt Voucher — money coming in"}
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
                              overriddenRef.current.add("templateId");
                              setValue("templateId", template.id, {
                                shouldDirty: true,
                                shouldTouch: true,
                                shouldValidate: true,
                              });
                            }}
                            className={cn(
                              "rounded-md px-4 py-3 text-left transition-colors",
                              active
                                ? "bg-[var(--surface-subtle)]"
                                : "hover:bg-[var(--surface-subtle)]",
                            )}
                          >
                            <span className="block text-sm font-medium text-[var(--foreground)]">
                              {template.name}
                            </span>
                            <span className="mt-1 block text-xs text-[var(--muted-foreground)]">
                              {template.description}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </FieldShell>
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
                  icon={<Palette className="h-4 w-4" />}

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
                  icon={<FileText className="h-4 w-4" />}

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
                      onTagPrefill={setTagIds}
                      onVendorSelect={handleVendorChange}
                      onClearVendor={handleVendorClear}
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
                icon={<Tag className="h-4 w-4" />}

                title="Document Tags"
                description="Categorise this voucher for reporting and analytics."
              >
                <TagPicker
                  selectedIds={tagIds}
                  onChange={setTagIds}
                  placeholder="Search or create tags..."
                  allowCreate
                />
                {suggestions.length > 0 && (
                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-[var(--muted-foreground)]">Suggestions</p>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s.id} type="button"
                          onClick={() => { if (!tagIds.includes(s.id)) setTagIds([...tagIds, s.id]); }}
                          disabled={tagIds.includes(s.id)}
                          className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs font-medium transition-colors hover:border-solid hover:bg-[var(--surface-soft)] disabled:opacity-30 disabled:cursor-default"
                          style={{ borderColor: s.color ?? "var(--border-soft)", color: s.color ?? "var(--muted-foreground)" }}
                          title={s.source === "recent" ? `Used ${s.usageCount} times with this vendor` : "Popular in your organisation"}
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </FormSection>
            </div>

            <div id="voucher-approvals" className="scroll-mt-28">
                <FormSection
                  icon={<CheckCircle className="h-4 w-4" />}

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
                  icon={<Eye className="h-4 w-4" />}

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
  initialAccentColor,
  initialAutofill,
}: {
  voucherId?: string;
  initialValues?: Partial<VoucherFormValues>;
  vendors?: Vendor[];
  initialTemplateId?: string;
  initialAccentColor?: string;
  initialAutofill?: VoucherAutofillPayload | null;
}) {
  const methods = useForm<VoucherFormValues>({
    resolver: zodResolver(voucherFormSchema),
    defaultValues: initialValues
      ? { ...voucherDefaultValues, templateId: initialTemplateId ?? voucherDefaultValues.templateId, branding: { ...voucherDefaultValues.branding, accentColor: initialAccentColor ?? voucherDefaultValues.branding.accentColor }, ...initialValues }
      : { ...voucherDefaultValues, templateId: initialTemplateId ?? voucherDefaultValues.templateId, branding: { ...voucherDefaultValues.branding, accentColor: initialAccentColor ?? voucherDefaultValues.branding.accentColor } },
    mode: "onChange",
  });

  return (
    <FormProvider {...methods}>
      <VoucherPanel voucherId={voucherId} vendors={vendors} initialTemplateId={initialTemplateId} initialAutofill={initialAutofill} />
    </FormProvider>
  );
}
