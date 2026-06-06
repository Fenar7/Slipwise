import { Suspense } from "react";
import { listEmployees, deleteEmployee } from "../actions";
import { DataTable } from "../components/data-table";
import { PageHeader } from "../components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Briefcase } from "lucide-react";

export const metadata = {
  title: "Employees | Slipwise",
};

async function EmployeesTable({ search, page }: { search?: string; page: number }) {
  const { employees, total, totalPages } = await listEmployees({ search, page, limit: 20 });

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Employees" value={total} icon={Briefcase} />
      </div>
      <DataTable
        data={employees}
        columns={[
          { key: "name", label: "Name", render: (row) => <span className="font-medium">{row.name}</span> },
          { key: "email", label: "Email" },
          { key: "employeeId", label: "Employee ID" },
          { key: "designation", label: "Designation" },
          {
            key: "department",
            label: "Department",
            width: "140px",
            render: (row) =>
              row.department ? (
                <StatusBadge variant="neutral">{String(row.department)}</StatusBadge>
              ) : (
                "—"
              ),
          },
        ]}
        entityType="employee"
        editPath="/app/data/employees"
        deleteAction={deleteEmployee}
        total={total}
        page={page}
        totalPages={totalPages}
      />
    </>
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
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <PageHeader
        title="Employees"
        description="Manage your employees for payslips and payroll"
        addLink="/app/data/employees/new"
        addLabel="Add Employee"
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-soft)] border-t-[var(--brand-primary)]" />
            Loading…
          </div>
        }
      >
        <EmployeesTable search={params.search} page={page} />
      </Suspense>
    </div>
  );
}
