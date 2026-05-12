import { FileText, AlertCircle, CheckCircle2, TrendingUp } from "lucide-react";

interface KpiRowProps {
  counts: {
    invoice: number;
    voucher: number;
    salarySlip: number;
    total: number;
  };
  kpis: {
    pay: {
      invoicesIssued: number;
      totalDue: number;
      overdue: number;
      paidThisMonth: number;
    };
  };
}

function formatCurrency(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(1)}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n}`;
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border bg-white p-4 transition-colors hover:border-[#DC2626]"
      style={{ borderColor: "#E0E0E0" }}
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        style={{ background: iconBg, color: iconColor }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium" style={{ color: "#79747E" }}>{label}</p>
        <p className="text-lg font-bold tracking-tight" style={{ color: "#1C1B1F" }}>{value}</p>
        {sub && <p className="text-[11px] mt-0.5" style={{ color: "#79747E" }}>{sub}</p>}
      </div>
    </div>
  );
}

export function KpiRow({ counts, kpis }: KpiRowProps) {
  const outstanding = Math.max(0, kpis.pay.totalDue - kpis.pay.paidThisMonth);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label="Total Documents"
        value={String(counts.total)}
        sub={`${counts.invoice} inv · ${counts.voucher} vch · ${counts.salarySlip} slips`}
        icon={FileText}
        iconBg="#F5F5F5"
        iconColor="#49454F"
      />
      <KpiCard
        label="Outstanding"
        value={formatCurrency(outstanding)}
        sub={kpis.pay.overdue > 0 ? `${formatCurrency(kpis.pay.overdue)} overdue` : "All caught up"}
        icon={AlertCircle}
        iconBg="#FEF2F2"
        iconColor="#DC2626"
      />
      <KpiCard
        label="Collected This Month"
        value={formatCurrency(kpis.pay.paidThisMonth)}
        sub={`${kpis.pay.invoicesIssued} invoices issued`}
        icon={CheckCircle2}
        iconBg="#ECFDF5"
        iconColor="#16A34A"
      />
      <KpiCard
        label="Total Revenue"
        value={formatCurrency(kpis.pay.totalDue + kpis.pay.paidThisMonth)}
        sub="Lifetime invoiced"
        icon={TrendingUp}
        iconBg="#EFF6FF"
        iconColor="#2563EB"
      />
    </div>
  );
}
