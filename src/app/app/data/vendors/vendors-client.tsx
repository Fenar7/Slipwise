"use client";

import Link from "next/link";
import { DataTable } from "../components/data-table";
import { deleteVendor } from "../actions";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowUpRight } from "lucide-react";
import type { Vendor } from "@prisma/client";

const COMPLIANCE_VARIANTS: Record<string, "default" | "success" | "warning" | "danger" | "info" | "neutral"> = {
  PENDING: "warning",
  VERIFIED: "success",
  SUSPENDED: "danger",
  BLOCKED: "danger",
};

interface VendorsClientTableProps {
  vendors: any[]; // Decimals are already serialized to numbers
  total: number;
  page: number;
  totalPages: number;
}

export function VendorsClientTable({ vendors, total, page, totalPages }: VendorsClientTableProps) {
  return (
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
  );
}
