"use client";

import Link from "next/link";
import { ArrowRight, FileText, Receipt, Banknote, FileSpreadsheet } from "lucide-react";

interface ActivityEntry {
  id: string;
  actorName: string;
  event: string;
  docType: string | null;
  createdAt: Date;
}

interface ActivitySidebarProps {
  entries: ActivityEntry[];
}

const DOC_ICONS: Record<string, React.ElementType> = {
  invoice: FileText,
  voucher: Receipt,
  salary_slip: Banknote,
  quote: FileSpreadsheet,
};

function timeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function ActivitySidebar({ entries }: ActivitySidebarProps) {
  return (
    <div
      className="flex h-full flex-col rounded-2xl border bg-white p-4"
      style={{ borderColor: "#E0E0E0" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "#1C1B1F" }}>
          Recent Activity
        </h3>
        <Link
          href="/app/intel/dashboard"
          className="inline-flex items-center text-xs font-medium transition-colors hover:text-[#DC2626]"
          style={{ color: "#79747E" }}
        >
          View all
          <ArrowRight className="ml-1 h-3 w-3" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <p className="py-6 text-center text-xs" style={{ color: "#79747E" }}>
            No recent activity
          </p>
        ) : (
          <div className="space-y-2">
            {entries.slice(0, 6).map((entry) => {
              const Icon = DOC_ICONS[entry.docType ?? ""] ?? FileText;
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2.5 rounded-xl border p-2.5 transition-colors hover:border-[#DC2626]"
                  style={{ borderColor: "#F0F0F0" }}
                >
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "#F5F5F5", color: "#49454F" }}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium" style={{ color: "#1C1B1F" }}>
                      {entry.event}
                    </p>
                    <p className="text-[11px]" style={{ color: "#79747E" }}>
                      {entry.actorName} · {timeAgo(entry.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
