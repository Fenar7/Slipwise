import { notFound } from "next/navigation";
import Link from "next/link";
import { getVendorTimeline } from "../../actions";
import { CrmTimeline } from "../../components/crm-timeline";
import { CrmNoteForm } from "../../components/crm-note-form";
import { ComplianceSelectClient } from "../../components/compliance-select-client";
import {
  DetailLayout,
  DetailRailCard,
  DetailTopBar,
  MetadataField,
} from "@/components/layout/detail-layout";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ArrowLeft, ArrowUpRight, Receipt } from "lucide-react";

function formatINR(amount?: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default async function VendorCrmPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getVendorTimeline(id);

  if (!data) {
    notFound();
  }

  const { vendor, events } = data;

  return (
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <DetailLayout
        topBar={
          <DetailTopBar
            title={vendor.name}
            subtitle={vendor.email ?? undefined}
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
                  href={`/app/data/vendors/${vendor.id}`}
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
              <ComplianceSelectClient
                vendorId={vendor.id}
                initialStatus={vendor.complianceStatus ?? "PENDING"}
              />
            </DetailRailCard>

            <DetailRailCard title="Finance">
              <dl className="space-y-3">
                <MetadataField label="Total Billed" value={formatINR(Number(vendor.totalBilled))} />
                <MetadataField label="Total Paid" value={formatINR(Number(vendor.totalPaid))} />
                <MetadataField label="Payment Terms" value={`${vendor.paymentTermsDays} days`} />
                <MetadataField label="Rating" value={vendor.rating != null ? `${vendor.rating} / 5` : "—"} />
                <MetadataField
                  label="Bills"
                  value={
                    <Link href={`/app/books/vendor-bills?vendorId=${vendor.id}`} className="text-[var(--brand-primary)] hover:underline">
                      View
                    </Link>
                  }
                />
                <MetadataField label="Purchase Orders" value="—" />
              </dl>
            </DetailRailCard>

            <DetailRailCard title="Quick Actions">
              <div className="flex flex-col gap-2">
                <Link
                  href={`/app/books/vendor-bills/new?vendorId=${vendor.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <Receipt className="h-3.5 w-3.5" />
                  New Bill
                </Link>
              </div>
            </DetailRailCard>

            <DetailRailCard title="Vendor Info">
              <dl className="space-y-3">
                {vendor.email && <MetadataField label="Email" value={vendor.email} />}
                {vendor.phone && <MetadataField label="Phone" value={vendor.phone} />}
                {vendor.gstin && <MetadataField label="GSTIN" value={vendor.gstin} />}
                {vendor.category && <MetadataField label="Category" value={vendor.category} />}
              </dl>
            </DetailRailCard>

            {vendor.tags.length > 0 && (
              <DetailRailCard title="Tags">
                <div className="flex flex-wrap gap-1.5">
                  {vendor.tags.map((tag) => (
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
            <KpiCard label="Total Billed" value={formatINR(Number(vendor.totalBilled))} />
            <KpiCard label="Total Paid" value={formatINR(Number(vendor.totalPaid))} />
            <KpiCard label="Payment Terms" value={`${vendor.paymentTermsDays}d`} />
            <KpiCard label="Rating" value={vendor.rating != null ? `${vendor.rating}/5` : "—"} />
          </div>

          <CrmNoteForm
            entityType="vendor"
            entityId={vendor.id}
            placeholder="Meeting notes, call log, compliance update…"
          />
          <CrmTimeline events={events} />
        </div>
      </DetailLayout>
    </div>
  );
}
