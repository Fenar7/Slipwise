import { notFound } from "next/navigation";
import Link from "next/link";
import { getInvoice, getInvoiceTimeline, getInvoicePayments } from "../actions";
import { InvoiceBrandingWrapper, type ExistingInvoice } from "../new/branding-wrapper";
import { listCustomers } from "@/app/app/data/actions";
import { InvoiceDetailClient } from "./invoice-detail-client";
import { DocumentAttachments } from "@/components/docs/document-attachments";
import { getDocAttachments } from "@/app/app/docs/attachment-actions";
import { listInventoryItems } from "@/app/app/inventory/items/actions";
import { DetailLayout, DetailRailCard } from "@/components/layout/detail-layout";
import { DocumentActionBar } from "@/components/docs/document-action-bar";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { getInvoiceTags } from "@/lib/tags/assignment-service";
import { TagChips } from "@/components/tags/tag-chips";

export const metadata = {
  title: "Edit Invoice | Slipwise",
};

const INVOICE_STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  ISSUED: "info",
  VIEWED: "info",
  DUE: "warning",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  OVERDUE: "danger",
  DISPUTED: "danger",
  CANCELLED: "neutral",
  REISSUED: "info",
};

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [invoice, customersResult, inventoryResult, events, payments, attachments, tagsResult] = await Promise.all([
    getInvoice(id),
    listCustomers({ limit: 200 }).catch(() => ({ customers: [] })),
    listInventoryItems({ pageSize: 100 }).catch(() => ({ success: false as const, error: "Inventory unavailable" })),
    getInvoiceTimeline(id),
    getInvoicePayments(id),
    getDocAttachments(id, "invoice"),
    getInvoiceTags(id).catch(() => ({ success: false as const, error: "" })),
  ]);

  if (!invoice) {
    notFound();
  }

  const statusVariant = INVOICE_STATUS_VARIANTS[invoice.status] ?? "neutral";

  return (
    <DetailLayout
      topBar={
        <DocumentActionBar
          backHref="/app/docs/invoices"
          backLabel="Invoices"
          documentType="Invoice"
          documentNumber={invoice.invoiceNumber ?? invoice.id}
          status={invoice.status}
          statusVariant={statusVariant}
          primaryActions={[
            {
              id: "print",
              label: "Print",
              icon: "print",
              variant: "secondary",
              href: `/app/docs/invoices/print?id=${invoice.id}`,
            },
            {
              id: "export",
              label: "Export PDF",
              icon: "download",
              variant: "secondary",
              href: `/app/docs/invoices/print?id=${invoice.id}&format=pdf`,
            },
          ]}
          secondaryActions={[
            {
              id: "preview",
              label: "Preview",
              icon: "preview",
              variant: "subtle",
              href: `/app/docs/invoices/print?id=${invoice.id}&preview=1`,
            },
          ]}
          contextMeta={[
            { label: "Customer", value: invoice.customer?.name ?? "—" },
            { label: "Date", value: new Date(invoice.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
            { label: "Total", value: new Intl.NumberFormat("en-IN", { style: "currency", currency: invoice.displayCurrency ?? "INR", minimumFractionDigits: 0 }).format(invoice.totalAmount) },
          ]}
        />
      }
      rail={
        <>
          {invoice.customer && (
            <DetailRailCard title="Customer">
              ...
            </DetailRailCard>
          )}
          {tagsResult.success && tagsResult.data.length > 0 && (
            <DetailRailCard title="Tags">
              <TagChips tags={tagsResult.data} />
            </DetailRailCard>
          )}
          <DetailRailCard>
            <InvoiceDetailClient
              invoiceId={invoice.id}
              status={invoice.status}
              events={events}
              invoiceSummary={{
                totalAmount: invoice.totalAmount,
                amountPaid: invoice.amountPaid,
                remainingAmount: invoice.remainingAmount,
                lastPaymentAt: invoice.lastPaymentAt?.toISOString() ?? null,
                lastPaymentMethod: invoice.lastPaymentMethod,
                paymentPromiseDate: invoice.paymentPromiseDate ?? null,
                razorpayPaymentLinkUrl: invoice.razorpayPaymentLinkUrl,
                paymentLinkStatus: invoice.paymentLinkStatus,
                paymentLinkExpiresAt: invoice.paymentLinkExpiresAt?.toISOString() ?? null,
                paymentLinkLastEventAt: invoice.paymentLinkLastEventAt?.toISOString() ?? null,
              }}
              payments={payments.map((p) => ({
                id: p.id,
                amount: p.amount,
                paidAt: p.paidAt.toISOString(),
                method: p.method,
                note: p.note,
                source: p.source,
                status: p.status,
                externalPaymentId: p.externalPaymentId,
                paymentMethodDisplay: p.paymentMethodDisplay,
                plannedNextPaymentDate: p.plannedNextPaymentDate,
              }))}
            />
          </DetailRailCard>
          <DocumentAttachments docId={invoice.id} docType="invoice" attachments={attachments} />
        </>
      }
    >
      <InvoiceBrandingWrapper
        existingInvoice={invoice as ExistingInvoice}
        customers={customersResult.customers}
        inventoryItems={inventoryResult.success ? inventoryResult.data.items : []}
      />
    </DetailLayout>
  );
}
