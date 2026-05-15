import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  Receipt,
  FileCheck,
  Wallet,
  Globe,
} from "lucide-react";
import type { ClientDetail } from "./client-detail-mock-data";

function formatCurrency(amount: number) {
  if (amount === 0) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

interface ClientDetailSummaryProps {
  client: ClientDetail;
}

export function ClientDetailSummary({ client }: ClientDetailSummaryProps) {
  const hasOverdue = client.recentInvoices.some((i) => i.status === "OVERDUE");

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <KpiCard
        label="Outstanding"
        value={formatCurrency(client.outstandingBalance)}
        icon={Wallet}
        trend={
          hasOverdue
            ? { value: "Has overdue", direction: "down" }
            : undefined
        }
      />
      <KpiCard
        label="Total Invoiced"
        value={formatCurrency(client.totalInvoiced)}
        icon={Receipt}
      />
      <KpiCard
        label="Total Paid"
        value={formatCurrency(client.totalPaid)}
        icon={FileCheck}
      />
      <KpiCard
        label="Lifetime Value"
        value={formatCurrency(client.lifetimeValue)}
        icon={Wallet}
      />
      <KpiCard
        label="Invoices"
        value={client.invoiceCount}
        icon={Receipt}
      />
      <KpiCard
        label="Portal Access"
        value={client.portalEnabled ? `${client.portalAccessCount}` : "Disabled"}
        icon={Globe}
        trend={
          client.portalEnabled
            ? { value: "Active", direction: "up" }
            : { value: "Not enabled", direction: "neutral" }
        }
      />
    </div>
  );
}
