import { notFound } from "next/navigation";
import Link from "next/link";
import { getCustomerTimeline } from "../../actions";
import { CrmTimeline } from "../../components/crm-timeline";
import { CrmNoteForm } from "../../components/crm-note-form";
import { LifecycleSelectClient } from "../../components/lifecycle-select-client";
import {
  DetailLayout,
  DetailRailCard,
  DetailTopBar,
  MetadataField,
} from "@/components/layout/detail-layout";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ArrowLeft, ArrowUpRight, Receipt, Quote } from "lucide-react";

function formatINR(amount?: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default async function CustomerCrmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCustomerTimeline(id);

  if (!data) {
    notFound();
  }

  const { customer, events } = data;

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
                  href="/app/crm"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <ArrowLeft className="h-3 w-3" />
                  CRM
                </Link>
                <Link
                  href={`/app/data/customers/${customer.id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <ArrowUpRight className="h-3 w-3" />
                  Master Data
                </Link>
              </div>
            }
          />
        }
        rail={
          <>
            <DetailRailCard title="CRM Controls">
              <LifecycleSelectClient
                customerId={customer.id}
                initialStage={customer.lifecycleStage ?? "PROSPECT"}
              />
            </DetailRailCard>

            <DetailRailCard title="Summary">
              <dl className="space-y-3">
                {customer.email && <MetadataField label="Email" value={customer.email} />}
                {customer.phone && <MetadataField label="Phone" value={customer.phone} />}
                {customer.gstin && <MetadataField label="GSTIN" value={customer.gstin} />}
                <MetadataField label="Total Invoiced" value={formatINR(Number(customer.totalInvoiced))} />
                <MetadataField label="Total Paid" value={formatINR(Number(customer.totalPaid))} />
                <MetadataField label="Lifetime Value" value={formatINR(Number(customer.lifetimeValue))} />
                <MetadataField
                  label="Invoices"
                  value={
                    <Link href={`/app/docs/invoices?customerId=${customer.id}`} className="text-[var(--brand-primary)] hover:underline">
                      View
                    </Link>
                  }
                />
                <MetadataField
                  label="Quotes"
                  value={
                    <Link href={`/app/docs/quotes?customerId=${customer.id}`} className="text-[var(--brand-primary)] hover:underline">
                      View
                    </Link>
                  }
                />
                {customer.nextFollowUpAt && (
                  <MetadataField
                    label="Next Follow-up"
                    value={new Date(customer.nextFollowUpAt).toLocaleDateString("en-IN")}
                  />
                )}
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

            {customer.tags.length > 0 && (
              <DetailRailCard title="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {customer.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-md bg-[var(--surface-subtle)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </DetailRailCard>
            )}
          </>
        }
      >
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Total Invoiced" value={formatINR(Number(customer.totalInvoiced))} />
            <KpiCard label="Total Paid" value={formatINR(Number(customer.totalPaid))} />
            <KpiCard label="Lifetime Value" value={formatINR(Number(customer.lifetimeValue))} />
            <KpiCard label="Open Quotes" value={customer._count.quotes} />
          </div>

          <CrmNoteForm
            entityType="customer"
            entityId={customer.id}
            placeholder="Meeting notes, call summary, follow-up action…"
          />
          <CrmTimeline events={events} />
        </div>
      </DetailLayout>
    </div>
  );
}
