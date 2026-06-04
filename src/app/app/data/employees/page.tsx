import { Suspense } from "react";
import { listEmployees } from "../actions";
import { DataTable } from "../components/data-table";
import { PageHeader } from "../components/page-header";

export const metadata = {
  title: "Employees | Slipwise",
};

async function EmployeesTable({ search, page }: { search?: string; page: number }) {
  const { employees, total, totalPages } = await listEmployees({ search, page, limit: 20 });
  
  return (
    <DataTable
      data={employees}
      columns={[
        { key: "name", label: "Name" },
        { key: "email", label: "Email" },
        { key: "employeeId", label: "Employee ID" },
        { key: "designation", label: "Designation" },
      ]}
      entityType="employee"
      editPath="/app/data/employees"
      total={total}
      page={page}
      totalPages={totalPages}
    />
  );
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  
  return (
    <div>
      <PageHeader
        title="Employees"
        description="Manage your employees for payslips"
        addLink="/app/data/employees/new"
        addLabel="Add Employee"
      />
      
      <Suspense fallback={<div className="py-8 text-center text-slate-500">Loading...</div>}>
        <EmployeesTable search={params.search} page={page} />
      </Suspense>
    </div>
  );
}
