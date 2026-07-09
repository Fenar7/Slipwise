"use client";

import { DataTable } from "../components/data-table";
import { deleteEmployee } from "../actions";
import { StatusBadge } from "@/components/dashboard/status-badge";

interface EmployeesClientTableProps {
  employees: any[]; // Decimals are already serialized to numbers
  total: number;
  page: number;
  totalPages: number;
}

export function EmployeesClientTable({ employees, total, page, totalPages }: EmployeesClientTableProps) {
  return (
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
  );
}
