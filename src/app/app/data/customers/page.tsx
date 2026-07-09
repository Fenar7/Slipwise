import { Suspense } from "react";
import Link from "next/link";
import { listCustomers, deleteCustomer } from "../actions";
import { DataTable } from "../components/data-table";
import { PageHeader } from "../components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Users, ArrowUpRight } from "lucide-react";

import { CustomersClientTable } from "./customers-client";

export const metadata = {
  title: "Customers | Slipwise",
};

async function CustomersTable({ search, page }: { search?: string; page: number }) {
  const { customers, total, totalPages } = await listCustomers({ search, page, limit: 20 });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Customers" value={total} icon={Users} />
      </div>
      <CustomersClientTable
        customers={customers}
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
