import { Suspense } from "react";
import Link from "next/link";
import { listVendors, deleteVendor } from "../actions";
import { DataTable } from "../components/data-table";
import { PageHeader } from "../components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Building2, ArrowUpRight } from "lucide-react";

export const metadata = {
  title: "Vendors | Slipwise",
};

const COMPLIANCE_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  PENDING: "warning",
  VERIFIED: "success",
  SUSPENDED: "danger",
  BLOCKED: "danger",
};

async function VendorsTable({ search, page }: { search?: string; page: number }) {
  const { vendors, total, totalPages } = await listVendors({ search, page, limit: 20 });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Vendors" value={total} icon={Building2} />
      </div>
      <DataTable
        data={vendors}
        columns={[
          {
            key: "name",
            label: "Name",
            render: (row) => (
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.name}</span>
                <Link
                  href={`/app/crm/vendors/${row.id}`}
                  className="inline-flex items-center text-[var(--text-muted)] hover:text-[var(--brand-primary)] transition-colors"
                  title="Open CRM view"
                >
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            ),
          },
          { key: "email", label: "Email" },
          { key: "phone", label: "Phone" },
          { key: "gstin", label: "GSTIN" },
          {
            key: "complianceStatus",
            label: "Status",
            width: "120px",
            render: (row) => {
              const status = row.complianceStatus ?? "PENDING";
              return (
                <StatusBadge variant={COMPLIANCE_VARIANTS[status] ?? "neutral"}>
                  {String(status).replace(/_/g, " ")}
                </StatusBadge>
              );
            },
          },
        ]}
        entityType="vendor"
        editPath="/app/data/vendors"
        deleteAction={deleteVendor}
        total={total}
        page={page}
        totalPages={totalPages}
      />
    </>
  );
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  return (
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <PageHeader
        title="Vendors"
        description="Manage your vendors for expenses and purchase orders"
        addLink="/app/data/vendors/new"
        addLabel="Add Vendor"
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-soft)] border-t-[var(--brand-primary)]" />
            Loading…
          </div>
        }
      >
        <VendorsTable search={params.search} page={page} />
      </Suspense>
    </div>
  );
}
