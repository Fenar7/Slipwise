"use client";

import Link from "next/link";
import { ArrowRight, FileText, Receipt, Banknote, FileSpreadsheet } from "lucide-react";

interface VaultRow {
  id: string;
  docType: string;
  documentNumber: string;
  titleOrSummary: string;
  counterpartyLabel: string | null;
  status: string;
  primaryDate: Date;
  amount: number | null;
}

interface RecentDocsProps {
  docs: VaultRow[];
}

const DOC_ICONS: Record<string, React.ElementType> = {
  invoice: FileText,
  voucher: Receipt,
  salary_slip: Banknote,
  quote: FileSpreadsheet,
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  DRAFT: { bg: "#F5F5F5", color: "#79747E" },
  ISSUED: { bg: "#EFF6FF", color: "#2563EB" },
  PAID: { bg: "#ECFDF5", color: "#059669" },
  OVERDUE: { bg: "#FEF2F2", color: "#DC2626" },
  DUE: { bg: "#FFFBEB", color: "#B45309" },
  PARTIALLY_PAID: { bg: "#FFF7ED", color: "#C2410C" },
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatAmount(amount: number | null): string {
  if (!amount) return "—";
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function RecentDocs({ docs }: RecentDocsProps) {
  return (
    <div
      className="flex h-full flex-col rounded-2xl border bg-white p-4"
      style={{ borderColor: "#E0E0E0" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
          Recent Documents
        </h3>
        <Link
          href="/app/docs/vault"
          className="inline-flex items-center text-xs font-medium transition-colors hover:text-[#DC2626]"
          style={{ color: "#79747E" }}
        >
          Vault
          <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {docs.length === 0 ? (
          <p className="py-6 text-center text-xs" style={{ color: "#79747E" }}>
            No documents yet
          </p>
        ) : (
          <div className="space-y-2">
            {docs.slice(0, 6).map((doc) => {
              const Icon = DOC_ICONS[doc.docType] ?? FileText;
              const statusStyle = STATUS_STYLES[doc.status] ?? STATUS_STYLES.DRAFT;
              return (
                <Link
                  key={doc.id}
                  href={`/app/docs/${doc.docType.replace("_", "-")}s/${doc.id}`}
                  className="flex items-center gap-2.5 rounded-xl border p-2.5 transition-colors hover:border-[#DC2626]"
                  style={{ borderColor: "#F0F0F0" }}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "#F5F5F5", color: "#49454F" }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-medium" style={{ color: "#1C1B1F" }}>
                        {doc.documentNumber || doc.titleOrSummary}
                      </p>
                      <span
                        className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase"
                        style={{ background: statusStyle.bg, color: statusStyle.color }}
                      >
                        {doc.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px]" style={{ color: "#79747E" }}>
                        {doc.counterpartyLabel || "—"} · {formatDate(doc.primaryDate)}
                      </p>
                      <p className="text-[11px] font-medium" style={{ color: "#1C1B1F" }}>
                        {formatAmount(doc.amount)}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
