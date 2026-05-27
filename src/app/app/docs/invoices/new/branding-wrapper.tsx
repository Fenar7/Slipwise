"use client";
import { useOrgBranding } from "@/hooks/use-org-branding";
import { InvoiceWorkspace } from "@/features/docs/invoice/components/invoice-workspace";
import type { InvoiceAutofillPayload } from "@/app/app/docs/invoices/autofill-resolver";

export type ExistingInvoice = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  status: string;
  notes: string | null;
  formData: unknown;
  totalAmount: number;
  customerId: string | null;
  lineItems: Array<{
    id: string;
    description: string;
    inventoryItemId: string | null;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    discount: number;
    amount: number;
    sortOrder: number;
  }>;
  customer: {
    id: string;
    name: string;
  } | null;
  tagAssignments?: Array<{
    tag: {
      id: string;
      name: string;
      slug: string;
      color: string | null;
    };
  }>;
};

interface InvoiceBrandingWrapperProps {
  existingInvoice?: ExistingInvoice | null;
  initialTemplateId?: string;
  initialAutofill?: InvoiceAutofillPayload;
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

export function InvoiceBrandingWrapper({
  existingInvoice,
  initialTemplateId,
  initialAutofill,
  customers = [],
  inventoryItems = [],
}: InvoiceBrandingWrapperProps) {
  const branding = useOrgBranding();

  return (
    <div
      style={
        {
          "--brand-accent": branding.accentColor,
          "--brand-font": branding.fontFamily,
          "--brand-font-color": branding.fontColor,
        } as React.CSSProperties
      }
    >
      <InvoiceWorkspace
        existingInvoice={existingInvoice}
        initialTemplateId={initialTemplateId}
        initialAccentColor={branding.accentColor}
        initialAutofill={initialAutofill}
        customers={customers}
        inventoryItems={inventoryItems}
      />
    </div>
  );
}
