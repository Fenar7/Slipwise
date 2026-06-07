import { notFound } from "next/navigation";
import Link from "next/link";
import { getVendorWithRelations } from "../../actions";
import { VendorForm } from "../../components/vendor-form";
import { RelatedRecords } from "../../components/related-records";
import {
  DetailLayout,
  DetailRailCard,
  DetailTopBar,
  MetadataField,
} from "@/components/layout/detail-layout";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowLeft, ArrowUpRight, Receipt } from "lucide-react";

export const metadata = {
  title: "Vendor | Slipwise",
};

const COMPLIANCE_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  PENDING: "warning",
  VERIFIED: "success",
  SUSPENDED: "danger",
  BLOCKED: "danger",
};

function formatCurrency(amount?: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default async function VendorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getVendorWithRelations(id);

  if (!data) {
    notFound();
  }

  const { vendor, recentBills, recentPurchaseOrders } = data;
  const compliance = vendor.complianceStatus ?? "PENDING";

  const relatedItems = [
    ...recentBills.map((b) => ({
      id: b.id,
      title: b.billNumber ? `Bill ${b.billNumber}` : "Bill",
      subtitle: formatCurrency(Number(b.totalAmount)),
      status: b.status,
      href: `/app/books/vendor-bills/${b.id}`,
      date: b.createdAt,
    })),
    ...recentPurchaseOrders.map((po) => ({
      id: po.id,
      title: po.poNumber ? `PO ${po.poNumber}` : "Purchase Order",
      subtitle: formatCurrency(Number(po.totalAmount)),
      status: po.status,
      date: po.createdAt,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
                  href="/app/data/vendors"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back
                </Link>
                <Link
                  href={`/app/crm/vendors/${vendor.id}`}
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
            <DetailRailCard title="Vendor Info">
              <dl className="space-y-3">
                {vendor.email && <MetadataField label="Email" value={vendor.email} />}
                {vendor.phone && <MetadataField label="Phone" value={vendor.phone} />}
                {vendor.gstin && <MetadataField label="GSTIN" value={vendor.gstin} />}
                {vendor.taxId && <MetadataField label="Tax ID" value={vendor.taxId} />}
                {vendor.category && <MetadataField label="Category" value={vendor.category} />}
                {vendor.address && (
                  <MetadataField label="Address" value={<span className="whitespace-pre-line text-xs leading-relaxed">{vendor.address}</span>} />
                )}
              </dl>
            </DetailRailCard>

            <DetailRailCard title="Compliance & Finance">
              <dl className="space-y-3">
                <MetadataField
                  label="Compliance"
                  value={
                    <StatusBadge variant={COMPLIANCE_VARIANTS[compliance] ?? "neutral"}>
                      {compliance.replace(/_/g, " ")}
                    </StatusBadge>
                  }
                />
                <MetadataField label="Total Billed" value={formatCurrency(Number(vendor.totalBilled))} />
                <MetadataField label="Total Paid" value={formatCurrency(Number(vendor.totalPaid))} />
                <MetadataField label="Payment Terms" value={`${vendor.paymentTermsDays} days`} />
                <MetadataField label="Rating" value={vendor.rating != null ? `${vendor.rating} / 5` : "—"} />
                <MetadataField
                  label="Bills"
                  value={
                    <Link href={`/app/books/vendor-bills?vendorId=${vendor.id}`} className="text-[var(--brand-primary)] hover:underline">
                      {vendor._count.bills}
                    </Link>
                  }
                />
                <MetadataField label="Purchase Orders" value={vendor._count.purchaseOrders} />
                <MetadataField label="Notes" value={vendor._count.crmNotes} />
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

            {vendor.defaultTagAssignments && vendor.defaultTagAssignments.length > 0 && (
              <DetailRailCard title="Default Tags">
                <div className="flex flex-wrap gap-1.5">
                  {vendor.defaultTagAssignments.map((assignment) => {
                    const tag = assignment.tag;
                    const isArchived = (tag as any).isArchived;
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
            <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Edit Vendor</h2>
            <VendorForm vendor={vendor} />
          </div>

          <RelatedRecords
            title="Recent Documents"
            items={relatedItems}
            emptyMessage="No bills or purchase orders yet."
            action={{ href: `/app/books/vendor-bills?vendorId=${vendor.id}`, label: "View all →" }}
          />
        </div>
      </DetailLayout>
    </div>
  );
}
