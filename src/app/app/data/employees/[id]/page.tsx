import { notFound } from "next/navigation";
import Link from "next/link";
import { getEmployeeWithRelations } from "../../actions";
import { EmployeeForm } from "../../components/employee-form";
import { RelatedRecords } from "../../components/related-records";
import {
  DetailLayout,
  DetailRailCard,
  DetailTopBar,
  MetadataField,
} from "@/components/layout/detail-layout";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";

export const metadata = {
  title: "Employee | Slipwise",
};

function formatCurrency(amount?: number | null) {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}

export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getEmployeeWithRelations(id);

  if (!data) {
    notFound();
  }

  const { employee, recentSalarySlips } = data;

  const relatedItems = recentSalarySlips.map((slip) => ({
    id: slip.id,
    title: `Payslip ${slip.slipNumber}`,
    subtitle: formatCurrency(slip.netPay),
    status: slip.status,
    href: `/app/docs/salary-slips/${slip.id}`,
    date: slip.createdAt,
  }));

  return (
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <DetailLayout
        topBar={
          <DetailTopBar
            title={employee.name}
            subtitle={employee.designation ?? undefined}
            actions={
              <Link
                href="/app/data/employees"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </Link>
            }
          />
        }
        rail={
          <>
            <DetailRailCard title="Employee Info">
              <dl className="space-y-3">
                {employee.email && <MetadataField label="Email" value={employee.email} />}
                {employee.employeeId && <MetadataField label="Employee ID" value={employee.employeeId} />}
                {employee.designation && <MetadataField label="Designation" value={employee.designation} />}
                {employee.department && (
                  <MetadataField
                    label="Department"
                    value={<StatusBadge variant="neutral">{employee.department}</StatusBadge>}
                  />
                )}
              </dl>
            </DetailRailCard>

            <DetailRailCard title="Bank Details">
              <dl className="space-y-3">
                {employee.bankName && <MetadataField label="Bank" value={employee.bankName} />}
                {employee.bankAccount && <MetadataField label="Account" value={employee.bankAccount} />}
                {employee.bankIFSC && <MetadataField label="IFSC" value={employee.bankIFSC} />}
                {employee.panNumber && <MetadataField label="PAN" value={employee.panNumber} />}
              </dl>
            </DetailRailCard>

            <DetailRailCard title="Payroll Summary">
              <dl className="space-y-3">
                <MetadataField
                  label="Salary Slips"
                  value={
                    <Link href={`/app/docs/salary-slips?employeeId=${employee.id}`} className="text-[var(--brand-primary)] hover:underline">
                      {employee._count.salarySlips}
                    </Link>
                  }
                />
              </dl>
            </DetailRailCard>

            <DetailRailCard title="Quick Actions">
              <div className="flex flex-col gap-2">
                <Link
                  href={`/app/docs/salary-slips/new?employeeId=${employee.id}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  New Salary Slip
                </Link>
              </div>
            </DetailRailCard>
          </>
        }
      >
        <div className="space-y-6">
          <div className="slipwise-panel p-5">
            <h2 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Edit Employee</h2>
            <EmployeeForm employee={employee} />
          </div>

          <RelatedRecords
            title="Recent Payslips"
            items={relatedItems}
            emptyMessage="No payslips yet."
            action={{ href: `/app/docs/salary-slips?employeeId=${employee.id}`, label: "View all →" }}
          />
        </div>
      </DetailLayout>
    </div>
  );
}
