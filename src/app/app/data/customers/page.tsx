import { Suspense } from "react";
import Link from "next/link";
import { listCustomers, deleteCustomer } from "../actions";
import { DataTable } from "../components/data-table";
import { PageHeader } from "../components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Users, ArrowUpRight } from "lucide-react";

export const metadata = {
  title: "Customers | Slipwise",
};

const LIFECYCLE_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  PROSPECT: "neutral",
  QUALIFIED: "info",
  NEGOTIATION: "warning",
  WON: "success",
  ACTIVE: "success",
  AT_RISK: "warning",
  CHURNED: "danger",
};

async function CustomersTable({ search, page }: { search?: string; page: number }) {
  const { customers, total, totalPages } = await listCustomers({ search, page, limit: 20 });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Customers" value={total} icon={Users} />
      </div>
      <DataTable
        data={customers}
        columns={[
          {
            key: "name",
            label: "Name",
            render: (row) => (
              <div className="flex items-center gap-2">
                <span className="font-medium">{row.name}</span>
                <Link
                  href={`/app/crm/customers/${row.id}`}
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
            key: "lifecycleStage",
            label: "Stage",
            width: "120px",
            render: (row) => {
              const stage = row.lifecycleStage ?? "PROSPECT";
              return (
                <StatusBadge variant={LIFECYCLE_VARIANTS[stage] ?? "neutral"}>
                  {String(stage).replace(/_/g, " ")}
                </StatusBadge>
              );
            },
          },
        ]}
        entityType="customer"
        editPath="/app/data/customers"
        deleteAction={deleteCustomer}
        total={total}
        page={page}
        totalPages={totalPages}
      />
    </>
  );
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  return (
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <PageHeader
        title="Customers"
        description="Manage your customers for invoices and quotes"
        addLink="/app/data/customers/new"
        addLabel="Add Customer"
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-soft)] border-t-[var(--brand-primary)]" />
            Loading…
          </div>
        }
      >
        <CustomersTable search={params.search} page={page} />
      </Suspense>
    </div>
  );
}
