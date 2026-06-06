import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerWithRelations } from "../../actions";
import { CustomerForm } from "../../components/customer-form";
import { RelatedRecords } from "../../components/related-records";
import {
  DetailLayout,
  DetailRailCard,
  DetailTopBar,
  MetadataField,
} from "@/components/layout/detail-layout";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowLeft, ArrowUpRight, Plus, Receipt, Quote } from "lucide-react";

export const metadata = {
  title: "Customer | Slipwise",
};

const LIFECYCLE_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  PROSPECT: "neutral",
  QUALIFIED: "info",
  NEGOTIATION: "warning",
  WON: "success",
  ACTIVE: "success",
  AT_RISK: "warning",
  CHURNED: "danger",
};

function formatCurrency(amount?: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCustomerWithRelations(id);

  if (!data) {
    notFound();
  }

  const { customer, recentInvoices, recentQuotes } = data;
  const stage = customer.lifecycleStage ?? "PROSPECT";

  const relatedItems = [
    ...recentInvoices.map((inv) => ({
      id: inv.id,
      title: inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : "Invoice",
      subtitle: formatCurrency(Number(inv.totalAmount)),
      status: inv.status,
      href: `/app/docs/invoices/${inv.id}`,
      date: inv.createdAt,
    })),
    ...recentQuotes.map((q) => ({
      id: q.id,
      title: q.quoteNumber ? `Quote ${q.quoteNumber}` : "Quote",
      subtitle: formatCurrency(Number(q.totalAmount)),
      status: q.status,
      href: `/app/docs/quotes/${q.id}`,
      date: q.createdAt,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <DetailLayout
        topBar={
          <DetailTopBar
            title={customer.name}
            subtitle={customer.email ?? undefined}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/app/data/customers"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </Link>
                <Link
                  href={`/app/crm/customers/${customer.id}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--brand-primary)] px-3 py-2 text-xs font-medium text-white transition-colors hover:opacity-90"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  CRM View
                </Link>
              </div>
            }
          />
        }
        rail={
          <>
            <DetailRailCard title="Customer Info">
              <dl className="space-y-3">
                {customer.email && <MetadataField label="Email" value={customer.email} />}
                {customer.phone && <MetadataField label="Phone" value={customer.phone} />}
                {customer.gstin && <MetadataField label="GSTIN" value={customer.gstin} />}
                {customer.taxId && <MetadataField label="Tax ID" value={customer.taxId} />}
                {customer.industry && <MetadataField label="Industry" value={customer.industry} />}
                {customer.segment && <MetadataField label="Segment" value={customer.segment} />}
                {customer.source && <MetadataField label="Source" value={customer.source} />}
                {customer.address && (
                  <MetadataField label="Address" value={<span className="whitespace-pre-line text-xs leading-relaxed">{customer.address}</span>} />
                )}
              </dl>
            </DetailRailCard>

            <DetailRailCard title="CRM Summary">
              <dl className="space-y-3">
                <MetadataField
                  label="Lifecycle Stage"
                  value={
                    <StatusBadge variant={LIFECYCLE_VARIANTS[stage] ?? "neutral"}>
                      {stage.replace(/_/g, " ")}
                    </StatusBadge>
                  }
                />
                <MetadataField label="Total Invoiced" value={formatCurrency(Number(customer.totalInvoiced))} />
                <MetadataField label="Total Paid" value={formatCurrency(Number(customer.totalPaid))} />
                <MetadataField label="Lifetime Value" value={formatCurrency(Number(customer.lifetimeValue))} />
                <MetadataField
                  label="Invoices"
                  value={
                    <Link href={`/app/docs/invoices?customerId=${customer.id}`} className="text-[var(--brand-primary)] hover:underline">
                      {customer._count.invoices}
                    </Link>
                  }
                />
                <MetadataField
                  label="Quotes"
                  value={
                    <Link href={`/app/docs/quotes?customerId=${customer.id}`} className="text-[var(--brand-primary)] hover:underline">
                      {customer._count.quotes}
                    </Link>
                  }
                />
                <MetadataField label="Notes" value={customer._count.crmNotes} />
              </dl>
            </DetailRailCard>

            <DetailRailCard title="Quick Actions">
              <div className="flex flex-col gap-2">
                <Link
                  href={`/app/docs/invoices/new?customerId=${customer.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  New Invoice
                </Link>
                <Link
                  href={`/app/docs/quotes/new?customerId=${customer.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <Quote className="h-3.5 w-3.5" />
                  New Quote
                </Link>
              </div>
            </DetailRailCard>

            {customer.defaultTagAssignments && customer.defaultTagAssignments.length > 0 && (
              <DetailRailCard title="Default Tags">
                <div className="flex flex-wrap gap-1.5">
                  {customer.defaultTagAssignments.map((assignment) => {
                    const tag = assignment.tag;
                    const isArchived = "isArchived" in tag ? Boolean((tag as { isArchived?: boolean }).isArchived) : false;
                    return (
                      <span
                        key={tag.id}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${isArchived ? "opacity-50 line-through" : ""}`}
                        style={{
                          borderColor: tag.color ?? "var(--border-soft)",
                          backgroundColor: tag.color ? `${tag.color}18` : "var(--surface-subtle)",
                          color: tag.color ?? "var(--text-secondary)",
                        }}
                      >
                        {tag.name}
                      </span>
                    );
                  })}
                </div>
              </DetailRailCard>
            )}
          </>
        }
      >
        <div className="space-y-6">
          <div className="slipwise-panel p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Edit Customer</h2>
            <CustomerForm customer={customer} />
          </div>

          <RelatedRecords
            title="Recent Documents"
            items={relatedItems}
            emptyMessage="No invoices or quotes yet."
            action={{ href: `/app/docs/invoices?customerId=${customer.id}`, label: "View all →" }}
          />
        </div>
      </DetailLayout>
    </div>
  );
}
