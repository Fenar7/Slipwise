"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DocumentWorkspaceLayout,
  type WorkspaceExportDialog,
  type WorkspaceAction,
  type WorkspaceSectionMeta,
} from "@/components/foundation/document-workspace-layout";
import { FieldShell } from "@/components/forms/field-shell";
import { FormSection } from "@/components/forms/form-section";
import {
  ColorField,
  FileUploadField,
  TextAreaField,
  TextField,
  ToggleField,
} from "@/components/forms/input-primitives";
import { InvoicePreview } from "@/features/docs/invoice/components/invoice-preview";
import { InvoiceDocumentFrame } from "@/features/docs/invoice/components/invoice-document-frame";
import { DocumentPreviewSurface } from "@/components/document/document-preview-surface";
import { invoiceTemplateRegistry } from "@/features/docs/invoice/templates";
import { invoiceDefaultValues, invoiceTemplateOptions } from "@/features/docs/invoice/constants";
import { invoiceFormSchema } from "@/features/docs/invoice/schema";
import type { InvoiceFormValues } from "@/features/docs/invoice/types";
import type { InvoiceDocument, InvoiceTemplateId } from "@/features/docs/invoice/types";
import { normalizeInvoice } from "@/features/docs/invoice/utils/normalize-invoice";
import {
  prepareDocumentExportDownload,
  startDocumentExportDownload,
} from "@/lib/browser/document-export-handoff";
import { normalizeMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CustomerPicker } from "./customer-picker";
import { TagPicker } from "@/components/tags/tag-picker";
import { getInvoiceTags, getCustomerDefaultTags } from "@/lib/tags/assignment-service";
import { InvoiceSaveBar } from "./invoice-save-bar";
import {
  saveInvoice,
  updateInvoice,
  issueInvoice,
} from "@/app/app/docs/invoices/actions";

type InvoiceActionState =
  | { status: "idle" }
  | { status: "pending"; action: "print" | "pdf" | "png" }
  | { status: "success"; action: "pdf" | "png"; downloadUrl: string }
  | { status: "error"; action?: "pdf" | "png"; message: string };

const invoiceWorkspaceSections: WorkspaceSectionMeta[] = [
  { id: "invoice-setup", label: "Setup" },
  { id: "invoice-client", label: "Client" },
  { id: "invoice-meta", label: "Meta" },
  { id: "invoice-tags", label: "Tags" },
  { id: "invoice-billing", label: "Billing" },
  { id: "invoice-footer", label: "Footer" },
  { id: "invoice-visibility", label: "Visibility" },
];


function InvoiceEditableCanvas({ document }: { document: InvoiceDocument }) {
  const template = invoiceTemplateRegistry[document.templateId];
  return (
    <DocumentPreviewSurface title={document.title} templateName={template?.name ?? "Invoice"}>
      <InvoiceDocumentFrame document={document} mode="edit" />
    </DocumentPreviewSurface>
  );
}


function InvoiceLineItemsEditor({
  inventoryItems = [],
}: {
  inventoryItems?: Array<{
    id: string;
    sku: string;
    name: string;
    totalAvailable: number;
    trackInventory: boolean;
  }>;
}) {
  const { control, register, setFocus } = useFormContext<InvoiceFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  const addRow = () => {
    append({
      description: "",
      inventoryItemId: "",
      quantity: "1",
      unitPrice: "",
      taxRate: "18",
      discountAmount: "0",
    });
    setTimeout(() => {
      setFocus(`lineItems.${fields.length}.description`);
    }, 50);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-soft)]">
            <th className="pb-2 text-left text-xs font-medium text-slate-500 pr-3 min-w-[200px]">Description</th>
            <th className="pb-2 text-left text-xs font-medium text-slate-500 min-w-[180px] pr-2">Inventory</th>
            <th className="pb-2 text-right text-xs font-medium text-slate-500 w-16 pr-2">Qty</th>
            <th className="pb-2 text-right text-xs font-medium text-slate-500 w-24 pr-2">Rate</th>
            <th className="pb-2 text-right text-xs font-medium text-slate-500 w-16 pr-2">Tax%</th>
            <th className="pb-2 text-right text-xs font-medium text-slate-500 w-20 pr-2">Disc</th>
            <th className="pb-2 w-6"></th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field, index) => (
            <tr key={field.id} className="border-b border-[var(--border-soft)]/50">
              <td className="py-1.5 pr-3">
                <input
                  {...register(`lineItems.${index}.description`)}
                  placeholder="Description"
                  className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
                />
              </td>
              <td className="py-1.5 pr-2">
                <select
                  {...register(`lineItems.${index}.inventoryItemId`)}
                  className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
                >
                  <option value="">Not linked</option>
                  {inventoryItems
                    .filter((item) => item.trackInventory)
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.sku}) - {item.totalAvailable} available
                      </option>
                    ))}
                </select>
              </td>
              <td className="py-1.5 pr-2">
                <input
                  {...register(`lineItems.${index}.quantity`)}
                  type="number"
                  placeholder="1"
                  className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  {...register(`lineItems.${index}.unitPrice`)}
                  type="number"
                  placeholder="0.00"
                  className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  {...register(`lineItems.${index}.taxRate`)}
                  type="number"
                  placeholder="0"
                  className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
                />
              </td>
              <td className="py-1.5 pr-2">
                <input
                  {...register(`lineItems.${index}.discountAmount`)}
                  type="number"
                  placeholder="0"
                  onKeyDown={(e) => {
                    if (e.key === "Tab" && !e.shiftKey && index === fields.length - 1) {
                      e.preventDefault();
                      addRow();
                    }
                  }}
                  className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm focus:border-[var(--accent)] focus:bg-white focus:outline-none"
                />
              </td>
              <td className="py-1.5 pl-1">
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        onClick={addRow}
        className="mt-3 flex items-center gap-1 text-sm text-[var(--accent)] hover:opacity-80"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add line item
      </button>
    </div>
  );
}

interface InvoicePanelProps {
  customers?: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    gstin: string | null;
  }>;
  inventoryItems?: Array<{
    id: string;
    sku: string;
    name: string;
    totalAvailable: number;
    trackInventory: boolean;
  }>;
  tagIds?: string[];
  onTagIdsChange?: (tagIds: string[]) => void;
}

function InvoicePanel({ customers = [], inventoryItems = [], tagIds = [], onTagIdsChange }: InvoicePanelProps) {
  const { control, getValues, setValue, trigger } = useFormContextSafe();
  const values = useWatch({ control }) as InvoiceFormValues;
  const [selectedTemplateId, setSelectedTemplateId] = useState<InvoiceFormValues["templateId"]>(() => getValues("templateId") ?? "professional");
  const previewDocument = normalizeInvoice({
    ...values,
    templateId: selectedTemplateId,
  });
  const [actionState, setActionState] = useState<InvoiceActionState>({
    status: "idle",
  });

  async function prepareDocument() {
    const isValid = await trigger();

    if (!isValid) {
      setActionState({
        status: "error",
        message: "Complete the required invoice fields before exporting.",
      });
      return null;
    }

    return normalizeInvoice({
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
        sessionEndpoint: "/api/export/invoice/session",
        payload,
        format,
        fallbackErrorMessage: `Unable to prepare the invoice ${format.toUpperCase()} export.`,
      });
      setActionState({ status: "success", action: format, downloadUrl });
    } catch (error) {
      setActionState({
        status: "error",
        action: format,
        message:
          error instanceof Error
            ? error.message
            : `Unable to export the invoice as ${format.toUpperCase()}.`,
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
        message: "Allow popups to open the invoice print surface.",
      });
      return;
    }

    setActionState({ status: "pending", action: "print" });

    try {
      const response = await fetch("/api/export/invoice/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ document }),
      });

      if (!response.ok) {
        throw new Error("Unable to prepare the invoice print surface.");
      }

      const payload = (await response.json()) as { printUrl?: string };

      if (!payload.printUrl) {
        throw new Error("Unable to prepare the invoice print surface.");
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
            : "Unable to prepare the invoice print surface.",
      });
    }
  }

  return (
    <DocumentWorkspaceLayout
      eyebrow="Invoice workspace"
      title="Invoice Generator"
      description="Build client-ready invoices in a cleaner billing workspace with structured details, live preview, and export actions that stay easy to reach."
      actions={[
        { id: "home", label: "Back to home", href: "/", variant: "secondary" },
        {
          id: "print",
          label:
            actionState.status === "pending" && actionState.action === "print"
              ? "Preparing print"
              : "Print invoice",
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
      builderEyebrow="Invoice controls"
      builderTitle="Build the invoice"
      builderDescription="Move from setup through client details, billing rows, and footer controls while keeping the live document visible."
      sections={invoiceWorkspaceSections}
      previewEyebrow="Preview"
      previewTitle="Live A4 document"
      previewDescription="Review the invoice while you edit. Branding, line items, taxes, and payment summary update immediately."
      builderContent={
        <>
          <div id="invoice-setup" className="scroll-mt-28">
              <FormSection
                eyebrow="Template"
                title="Template and branding"
                description="Switch invoice layouts without resetting the form or recalculating totals incorrectly."
              >
                <FieldShell label="Invoice template">
                  <div className="grid gap-3">
                    {invoiceTemplateOptions.map((template) => {
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
                <TextField<InvoiceFormValues>
                  name="branding.companyName"
                  label="Business name"
                  placeholder="Northfield Trading Co."
                />
                <TextAreaField<InvoiceFormValues>
                  name="branding.address"
                  label="Business address"
                  rows={3}
                  placeholder="18 Market Road, Kozhikode"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="branding.email"
                    label="Business email"
                    placeholder="accounts@example.com"
                  />
                  <TextField<InvoiceFormValues>
                    name="branding.phone"
                    label="Business phone"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="website"
                    label="Website"
                    placeholder="www.northfield.example"
                  />
                  <TextField<InvoiceFormValues>
                    name="businessTaxId"
                    label="Tax ID / GSTIN"
                    placeholder="GSTIN 32ABCDE1234F1Z6"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <ColorField<InvoiceFormValues>
                    name="branding.accentColor"
                    label="Accent color"
                  />
                  <FileUploadField<InvoiceFormValues>
                    name="branding.logoDataUrl"
                    label="Logo upload"
                    hint="Session-only asset for the live preview."
                  />
                </div>
              </FormSection>
          </div>

          <div id="invoice-client" className="scroll-mt-28">
              <FormSection
                eyebrow="Client"
                title="Client details"
                description="Control how the client block appears in the invoice preview."
              >
                <CustomerPicker
                  customers={customers}
                  onSelect={(customer) => {
                    if (onTagIdsChange && tagIds.length === 0) {
                      getCustomerDefaultTags(customer.id).then((result) => {
                        if (result.success && result.data.length > 0) {
                          const defaultIds = result.data.map((t) => t.id);
                          if (!defaultIds.some((id) => tagIds.includes(id))) {
                            onTagIdsChange([...tagIds, ...defaultIds]);
                          }
                        }
                      });
                    }
                  }}
                />
                <TextField<InvoiceFormValues>
                  name="clientName"
                  label="Client name"
                  required
                  placeholder="Axis PeopleX Pvt. Ltd."
                />
                <TextAreaField<InvoiceFormValues>
                  name="clientAddress"
                  label="Client address"
                  rows={3}
                  placeholder="4th Floor, Grand Square, Kochi"
                />
                <TextAreaField<InvoiceFormValues>
                  name="shippingAddress"
                  label="Shipping address"
                  rows={3}
                  placeholder="Warehouse Bay 3, Marine Drive, Kochi"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="clientEmail"
                    label="Client email"
                    placeholder="finance@example.com"
                  />
                  <TextField<InvoiceFormValues>
                    name="clientPhone"
                    label="Client phone"
                    placeholder="+91 98470 12000"
                  />
                </div>
                <TextField<InvoiceFormValues>
                  name="clientTaxId"
                  label="Client tax ID / GSTIN"
                  placeholder="GSTIN 32AAACA1122R1ZV"
                />
              </FormSection>
          </div>

          <div id="invoice-meta" className="scroll-mt-28">
              <FormSection
                eyebrow="Meta"
                title="Invoice metadata"
                description="Dates and payment tracking stay separate from the line-item math."
              >
                <TextField<InvoiceFormValues>
                  name="invoiceNumber"
                  label="Invoice number"
                  placeholder="Assigned when issued"
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="invoiceDate"
                    label="Invoice date"
                    required
                    type="date"
                  />
                  <TextField<InvoiceFormValues>
                    name="dueDate"
                    label="Due date"
                    type="date"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="placeOfSupply"
                    label="Place of supply"
                    placeholder="Kerala"
                  />
                  <TextField<InvoiceFormValues>
                    name="amountPaid"
                    label="Amount paid"
                    type="number"
                    placeholder="15000"
                  />
                </div>
              </FormSection>
          </div>

          <div id="invoice-tags" className="scroll-mt-28">
            <FormSection
              eyebrow="Tags"
              title="Document tags"
              description="Add tags to categorize this invoice. Tags are internal and not shown on the PDF."
            >
              <TagPicker
                value={tagIds}
                onChange={onTagIdsChange ?? (() => {})}
                placeholder="Add tags..."
              />
            </FormSection>
          </div>

          <div id="invoice-billing" className="scroll-mt-28">
              <FormSection
                eyebrow="Billing"
                title="Line items and totals"
                description="Each line supports quantity, discount, and tax without leaving the form."
              >
                <InvoiceLineItemsEditor inventoryItems={inventoryItems} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="extraCharges"
                    label="Extra charges"
                    type="number"
                    placeholder="1500"
                  />
                  <TextField<InvoiceFormValues>
                    name="invoiceLevelDiscount"
                    label="Invoice-level discount"
                    type="number"
                    placeholder="500"
                  />
                </div>
              </FormSection>
          </div>

          <div id="invoice-footer" className="scroll-mt-28">
              <FormSection
                eyebrow="Footer"
                title="Notes, terms, bank details, and signature"
                description="Optional payment and approval information stays grouped here."
              >
                <TextAreaField<InvoiceFormValues>
                  name="notes"
                  label="Notes"
                  rows={3}
                  placeholder="Thank you for the continued engagement."
                />
                <TextAreaField<InvoiceFormValues>
                  name="terms"
                  label="Terms"
                  rows={3}
                  placeholder="Payment due within 7 days."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="bankName"
                    label="Bank name"
                    placeholder="Federal Bank"
                  />
                  <TextField<InvoiceFormValues>
                    name="bankAccountNumber"
                    label="Account number"
                    placeholder="122001004281"
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField<InvoiceFormValues>
                    name="bankIfsc"
                    label="IFSC"
                    placeholder="FDRL0001220"
                  />
                  <TextField<InvoiceFormValues>
                    name="authorizedBy"
                    label="Authorized by"
                    placeholder="Anita Thomas"
                  />
                </div>
              </FormSection>
          </div>

          <div id="invoice-visibility" className="scroll-mt-28">
              <FormSection
                eyebrow="Visibility"
                title="Optional sections"
                description="Hide optional business, client, and footer blocks without affecting totals."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showAddress"
                    label="Business address"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showEmail"
                    label="Business email"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showPhone"
                    label="Business phone"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showWebsite"
                    label="Business website"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showBusinessTaxId"
                    label="Business tax ID"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showClientAddress"
                    label="Client address"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showClientEmail"
                    label="Client email"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showClientPhone"
                    label="Client phone"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showClientTaxId"
                    label="Client tax ID"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showShippingAddress"
                    label="Shipping address"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showDueDate"
                    label="Due date"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showPlaceOfSupply"
                    label="Place of supply"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showNotes"
                    label="Notes"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showTerms"
                    label="Terms"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showBankDetails"
                    label="Bank details"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showSignature"
                    label="Signature"
                  />
                  <ToggleField<InvoiceFormValues>
                    name="visibility.showPaymentSummary"
                    label="Payment summary"
                  />
                </div>
              </FormSection>
          </div>
        </>
      }
      previewContent={<InvoicePreview document={previewDocument} />}
      documentEditorContent={<InvoiceEditableCanvas document={previewDocument} />}
    />
  );
}

function useFormContextSafe() {
  return useFormContext<InvoiceFormValues>();
}

import type { ExistingInvoice } from "@/app/app/docs/invoices/new/branding-wrapper";

interface InvoiceWorkspaceProps {
  existingInvoice?: ExistingInvoice | null;
  initialTemplateId?: string;
  customers?: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    gstin: string | null;
  }>;
  inventoryItems?: Array<{
    id: string;
    sku: string;
    name: string;
    totalAvailable: number;
    trackInventory: boolean;
  }>;
}

export function InvoiceWorkspace({
  existingInvoice,
  initialTemplateId,
  customers = [],
  inventoryItems = [],
}: InvoiceWorkspaceProps) {
  const baseValues = existingInvoice
    ? convertInvoiceToFormValues(existingInvoice)
    : invoiceDefaultValues;
  const defaultValues = initialTemplateId && !existingInvoice
    ? { ...baseValues, templateId: initialTemplateId as InvoiceTemplateId }
    : baseValues;

  const methods = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues,
    mode: "onChange",
  });

  const [savedId, setSavedId] = useState<string | undefined>(
    existingInvoice?.id
  );
  const [savedInvoiceNumber, setSavedInvoiceNumber] = useState<string | undefined>(
    existingInvoice?.invoiceNumber
  );
  const [isSaving, setIsSaving] = useState(false);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [tagIdsLoaded, setTagIdsLoaded] = useState(false);

  useEffect(() => {
    if (existingInvoice?.id && !tagIdsLoaded) {
      getInvoiceTags(existingInvoice.id).then((result) => {
        if (result.success) {
          setTagIds(result.data.map((t) => t.id));
        }
        setTagIdsLoaded(true);
      });
    } else if (!existingInvoice?.id) {
      setTagIdsLoaded(true);
    }
  }, [existingInvoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveDraft = async (): Promise<string | undefined> => {
    setIsSaving(true);
    try {
      const values = methods.getValues();
      const lineItems = values.lineItems.map((item) => ({
        description: item.description,
        inventoryItemId: item.inventoryItemId || undefined,
        quantity: parseFloat(item.quantity) || 1,
        unitPrice: normalizeMoney(item.unitPrice),
        taxRate: parseFloat(item.taxRate) || 0,
        discount: normalizeMoney(item.discountAmount),
      }));
      const result = savedId
        ? await updateInvoice(savedId, {
            invoiceDate: values.invoiceDate,
            dueDate: values.dueDate || undefined,
            notes: values.notes || undefined,
            formData: values as Record<string, unknown>,
            lineItems,
            tagIds,
          })
        : await saveInvoice(
            {
              invoiceDate: values.invoiceDate,
              dueDate: values.dueDate || undefined,
              notes: values.notes || undefined,
              formData: values as Record<string, unknown>,
              lineItems,
              tagIds,
            },
            "DRAFT"
          );
      if (result.success) {
        setSavedId(result.data.id);
        if (!savedId && "invoiceNumber" in result.data) {
          setSavedInvoiceNumber(
            (result.data as { id: string; invoiceNumber: string }).invoiceNumber
          );
        }
        methods.reset(values);
        toast.success("Invoice saved successfully");
        return result.data.id;
      } else {
        toast.error(result.error || "Failed to save invoice");
      }
    } catch (err) {
      toast.error("An unexpected error occurred");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
    return undefined;
  };

  const handleIssue = async () => {
    const id = await handleSaveDraft();
    const targetId = id ?? savedId;
    if (targetId) {
      setIsSaving(true);
      try {
        const result = await issueInvoice(targetId);
        if (result.success) {
          const issuedNumber = result.data.invoiceNumber;
          methods.setValue("invoiceNumber", issuedNumber, {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });
          setSavedInvoiceNumber(issuedNumber);
          toast.success("Invoice issued successfully");
        } else {
          toast.error(result.error || "Failed to issue invoice");
        }
      } catch (err) {
        toast.error("An unexpected error occurred");
        console.error(err);
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <FormProvider {...methods}>
      <InvoicePanel 
        customers={customers} 
        inventoryItems={inventoryItems} 
        tagIds={tagIds}
        onTagIdsChange={setTagIds}
      />
      <InvoiceSaveBar
        onSaveDraft={() => void handleSaveDraft()}
        onIssue={() => void handleIssue()}
        isSaving={isSaving}
        savedId={savedId}
        invoiceNumber={savedInvoiceNumber}
      />
    </FormProvider>
  );
}

function convertInvoiceToFormValues(invoice: ExistingInvoice): InvoiceFormValues {
  const formData = invoice.formData as Record<string, unknown> | null;
  
  if (formData && typeof formData === "object" && "templateId" in formData) {
    // Override invoiceNumber from the DB row — the DB row is
    // authoritative after issue (Sprint 4.2).  formData may still
    // carry the stale draft placeholder from Sprint 4.1.
    return {
      ...(formData as InvoiceFormValues),
      invoiceNumber: invoice.invoiceNumber ?? "",
    };
  }
  
  // Otherwise, construct from database fields with defaults
  return {
    ...invoiceDefaultValues,
    invoiceNumber: invoice.invoiceNumber ?? "",
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate || "",
    notes: invoice.notes || "",
    clientName: invoice.customer?.name || "",
    lineItems: invoice.lineItems.map((item) => ({
      description: item.description,
      inventoryItemId: item.inventoryItemId || "",
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      taxRate: String(item.taxRate),
      discountAmount: String(item.discount),
    })),
  };
}
