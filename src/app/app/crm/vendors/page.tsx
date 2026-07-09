import { Suspense } from "react";
import { listVendors } from "@/app/app/data/actions";
import { PageHeader } from "@/app/app/data/components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Building2 } from "lucide-react";
import { VendorsClientTable } from "@/app/app/data/vendors/vendors-client";

export const metadata = {
  title: "Vendors | CRM | Slipwise",
};

async function VendorsTable({ search, page }: { search?: string; page: number }) {
  const { vendors, total, totalPages } = await listVendors({ search, page, limit: 20 });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Vendors" value={total} icon={Building2} />
      </div>
      <VendorsClientTable
        vendors={vendors}
        total={total}
        page={page}
        totalPages={totalPages}
      />
    </>
  );
}

export default async function CrmVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);

  return (
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <PageHeader
        title="CRM Vendors"
        description="View and manage vendor relationships"
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
