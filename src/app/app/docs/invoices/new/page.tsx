import type { Metadata } from "next";
import { InvoiceBrandingWrapper } from "./branding-wrapper";
import { listCustomers } from "@/app/app/data/actions";
import { listInventoryItems } from "@/app/app/inventory/items/actions";
import { resolveInvoiceAutofill } from "@/app/app/docs/invoices/autofill-resolver";

export const metadata: Metadata = {
  title: "Invoice Studio",
  description: "Create and export professional invoices.",
};

interface PageProps {
  searchParams: Promise<{ template?: string; customerId?: string }>;
}

export default async function NewInvoicePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const [customersResult, inventoryResult, autofill] = await Promise.all([
    listCustomers({ limit: 200 }).catch(() => ({ customers: [] })),
    listInventoryItems({ pageSize: 100 }).catch(() => ({ success: false as const, error: "Inventory unavailable" })),
    resolveInvoiceAutofill({
      customerId: params.customerId || undefined,
      templateParam: params.template || undefined,
    }).catch(() => null),
  ]);
  return (
    <InvoiceBrandingWrapper
      initialTemplateId={autofill?.templateId}
      initialAutofill={autofill ?? undefined}
      customers={customersResult.customers}
      inventoryItems={inventoryResult.success ? inventoryResult.data.items : []}
    />
  );
}
