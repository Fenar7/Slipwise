"use client";

import Link from "next/link";
import { DataTable } from "../components/data-table";
import { deleteCustomer } from "../actions";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowUpRight } from "lucide-react";
import type { Customer } from "@prisma/client";

const LIFECYCLE_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  PROSPECT: "neutral",
  QUALIFIED: "info",
  NEGOTIATION: "warning",
  WON: "success",
  ACTIVE: "success",
  AT_RISK: "warning",
  CHURNED: "danger",
};

interface CustomersClientTableProps {
  customers: any[]; // Decimals are already serialized to numbers
  total: number;
  page: number;
  totalPages: number;
}

export function CustomersClientTable({ customers, total, page, totalPages }: CustomersClientTableProps) {
  return (
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
  );
}
