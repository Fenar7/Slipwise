import { notFound } from "next/navigation";
import Link from "next/link";
import { getSalarySlip, releaseSalarySlip, archiveSalarySlip } from "../actions";
import { DocumentAttachments } from "@/components/docs/document-attachments";
import { getDocAttachments } from "@/app/app/docs/attachment-actions";
import { getDocumentTimelineForPage } from "@/lib/document-events";
import { DocumentTimeline } from "@/components/docs/document-timeline";
import { DocumentActionBar } from "@/components/docs/document-action-bar";

export const metadata = {
  title: "Salary Slip Details | Slipwise",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default async function SalarySlipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [slip, attachments, events] = await Promise.all([
    getSalarySlip(id),
    getDocAttachments(id, "salary_slip"),
    getDocumentTimelineForPage("salary_slip", id).catch(() => []),
  ]);

  if (!slip) {
    notFound();
  }

  const earnings = slip.components.filter((c) => c.type === "earning");
  const deductions = slip.components.filter((c) => c.type === "deduction");

  const statusVariant = slip.status === "released" ? "success" : "neutral";

  return (
    <div className="min-h-screen bg-[var(--surface-base)]">
      <div className="mx-auto max-w-4xl px-3 py-5 sm:px-4 lg:px-5 lg:py-7 space-y-5">
        <DocumentActionBar
          backHref="/app/docs/salary-slips"
          backLabel="Salary Slips"
          documentType="Salary Slip"
          documentNumber={slip.slipNumber}
          title={`${MONTHS[slip.month - 1]} ${slip.year}`}
          status={slip.status}
          statusVariant={statusVariant}
          primaryActions={[
            {
              id: "print",
              label: "Print",
              icon: "print",
              variant: "secondary",
              href: `/app/docs/salary-slips/print?id=${slip.id}`,
            },
            {
              id: "export",
              label: "Export PDF",
              icon: "download",
              variant: "secondary",
              href: `/app/docs/salary-slips/print?id=${slip.id}&format=pdf`,
            },
          ]}
          secondaryActions={[
            ...(slip.status === "draft"
              ? [
                  {
                    id: "release",
                    label: "Release",
                    icon: "release" as const,
                    variant: "primary" as const,
                    formAction: async () => {
                      "use server";
                      await releaseSalarySlip(id);
                    },
                  },
                  {
                    id: "archive",
                    label: "Archive",
                    icon: "archive" as const,
                    variant: "danger" as const,
                    formAction: async () => {
                      "use server";
                      await archiveSalarySlip(id);
                    },
                  },
                ]
              : []),
            {
              id: "new",
              label: "Create New",
              icon: "duplicate",
              variant: "subtle",
              href: "/app/docs/salary-slips/new",
            },
          ]}
          contextMeta={[
            { label: "Employee", value: slip.employee?.name ?? "—" },
            { label: "Period", value: `${MONTHS[slip.month - 1]} ${slip.year}` },
            { label: "Net Pay", value: formatCurrency(slip.netPay) },
          ]}
        />

        <div className="rounded-2xl border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
          {/* Employee Info */}
          {slip.employee && (
            <div className="mb-6 rounded-xl bg-[var(--surface-subtle)] p-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Employee</h2>
              <Link
                href={`/app/data/employees/${slip.employee.id}`}
                className="mt-1 inline-block text-lg font-semibold text-[var(--brand-primary)] hover:underline"
              >
                {slip.employee.name}
              </Link>
              {slip.employee.email && (
                <p className="text-sm text-[var(--text-secondary)]">{slip.employee.email}</p>
              )}
            </div>
          )}

          {/* Compensation Breakdown */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Earnings */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Earnings</h3>
              <div className="space-y-2.5">
                {earnings.map((comp) => (
                  <div key={comp.id} className="flex justify-between text-sm">
                    <span className="text-[var(--text-secondary)]">{comp.label}</span>
                    <span className="font-medium text-[var(--text-primary)]">{formatCurrency(comp.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Deductions */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Deductions</h3>
              <div className="space-y-2.5">
                {deductions.length > 0 ? (
                  deductions.map((comp) => (
                    <div key={comp.id} className="flex justify-between text-sm">
                      <span className="text-[var(--text-secondary)]">{comp.label}</span>
                      <span className="font-medium text-[var(--state-danger)]">-{formatCurrency(comp.amount)}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">No deductions</p>
                )}
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className="mt-6 border-t border-[var(--border-default)] pt-5">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--text-secondary)]">Gross Pay</span>
              <span className="font-medium text-[var(--text-primary)]">{formatCurrency(slip.grossPay)}</span>
            </div>
            <div className="mt-3 flex justify-between items-baseline">
              <span className="text-lg font-semibold text-[var(--text-primary)]">Net Pay</span>
              <span className="text-xl font-bold text-[var(--state-success)]">{formatCurrency(slip.netPay)}</span>
            </div>
          </div>
        </div>

        <DocumentAttachments docId={slip.id} docType="salary_slip" attachments={attachments} />

        {/* Timeline */}
        <div className="rounded-xl border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
          <DocumentTimeline events={events} title="History" />
        </div>
      </div>
    </div>
  );
}
