import Link from "next/link";
import { Suspense } from "react";
import { listSalaryPresets, deleteSalaryPreset } from "../salary-preset-actions";
import { PageHeader } from "../components/page-header";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { ContentPanel } from "@/components/dashboard/dashboard-section";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { Layers, ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Salary Presets | Slipwise",
};

const LIMIT = 20;

async function PresetsList({ page }: { page: number }) {
  const offset = (page - 1) * LIMIT;
  const { presets, total } = await listSalaryPresets({ limit: LIMIT, offset });
  const totalPages = Math.ceil(total / LIMIT);

  if (presets.length === 0) {
    return (
      <ContentPanel>
        <TableEmpty
          message="No presets yet"
          description="Create reusable salary component packages for quick slip generation."
          icon={<Layers className="h-8 w-8 text-[var(--text-muted)]" />}
        />
      </ContentPanel>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {presets.map((preset) => {
          const earnings = preset.components.filter((c) => c.type === "earning");
          const deductions = preset.components.filter((c) => c.type === "deduction");
          const totalEarnings = earnings.reduce((s, c) => s + c.amount, 0);
          const totalDeductions = deductions.reduce((s, c) => s + c.amount, 0);

          return (
            <div
              key={preset.id}
              className="slipwise-panel flex flex-col gap-4 p-5 transition-shadow hover:shadow-md sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  {preset.name}
                </h3>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                  <span className="text-[var(--state-success)]">
                    Earnings: {earnings.length} items · ₹
                    {totalEarnings.toLocaleString("en-IN")}
                  </span>
                  <span className="text-[var(--state-danger)]">
                    Deductions: {deductions.length} items · ₹
                    {totalDeductions.toLocaleString("en-IN")}
                  </span>
                  <span className="font-medium text-[var(--text-secondary)]">
                    Net: ₹{(totalEarnings - totalDeductions).toLocaleString("en-IN")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {preset.components.slice(0, 6).map((c, i) => (
                    <StatusBadge
                      key={i}
                      variant={c.type === "earning" ? "success" : "danger"}
                    >
                      {c.label}
                    </StatusBadge>
                  ))}
                  {preset.components.length > 6 && (
                    <span className="inline-flex items-center rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                      +{preset.components.length - 6} more
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3 sm:ml-4">
                <Link
                  href={`/app/data/salary-presets/${preset.id}`}
                  className="text-sm font-medium text-[var(--brand-primary)] hover:text-[var(--brand-primary)] hover:underline transition-colors"
                >
                  Edit
                </Link>
                <form
                  action={async () => {
                    "use server";
                    await deleteSalaryPreset(preset.id);
                  }}
                >
                  <button
                    type="submit"
                    className="text-sm font-medium text-[var(--state-danger)] hover:underline"
                  >
                    Delete
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-[var(--text-muted)]">
            Showing{" "}
            <span className="font-medium text-[var(--text-secondary)]">
              {offset + 1}–{Math.min(offset + LIMIT, total)}
            </span>{" "}
            of{" "}
            <span className="font-medium text-[var(--text-secondary)]">{total}</span>
          </p>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}`}
                className="inline-flex items-center rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                <ChevronLeft className="mr-1 h-3 w-3" />
                Previous
              </Link>
            )}
            <span className="px-2 text-xs font-medium text-[var(--text-muted)]">
              {page} / {totalPages}
            </span>
            {page < totalPages && (
              <Link
                href={`?page=${page + 1}`}
                className="inline-flex items-center rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-subtle)]"
              >
                Next
                <ChevronRight className="ml-1 h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default async function SalaryPresetsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));

  // Fetch total for KPI (reuses same query with small limit)
  const { total } = await listSalaryPresets({ limit: 1, offset: 0 });

  return (
    <div className="mx-auto max-w-[var(--container-content,80rem)]">
      <PageHeader
        title="Salary Presets"
        description="Reusable salary component packages for quick slip generation"
        addLink="/app/data/salary-presets/new"
        addLabel="Create Preset"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total Presets" value={total} icon={Layers} />
        </div>
      </PageHeader>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
            <div className="mr-2 h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-soft)] border-t-[var(--brand-primary)]" />
            Loading…
          </div>
        }
      >
        <PresetsList page={page} />
      </Suspense>
    </div>
  );
}
