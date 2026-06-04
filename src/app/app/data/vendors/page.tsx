import { Suspense } from "react";
import { listVendors } from "../actions";
import { DataTable } from "../components/data-table";
import { PageHeader } from "../components/page-header";

export const metadata = {
  title: "Vendors | Slipwise",
};

async function VendorsTable({ search, page }: { search?: string; page: number }) {
  const { vendors, total, totalPages } = await listVendors({ search, page, limit: 20 });
  
  return (
    <DataTable
      data={vendors}
      columns={[
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "gstin", label: "GSTIN" },
      ]}
      entityType="vendor"
      editPath="/app/data/vendors"
      total={total}
      page={page}
      totalPages={totalPages}
    />
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
    <div>
      <PageHeader
        title="Vendors"
        description="Manage your vendors for expenses"
        addLink="/app/data/vendors/new"
        addLabel="Add Vendor"
      />
      
      <Suspense fallback={<div className="py-8 text-center text-slate-500">Loading...</div>}>
        <VendorsTable search={params.search} page={page} />
      </Suspense>
    </div>
  );
}
