import Link from "next/link";
import {
  FileText,
  Database,
  CreditCard,
  BookOpen,
  Workflow,
  BarChart3,
  ShieldCheck,
  Users,
  Receipt,
  ArrowUpRight,
} from "lucide-react";

interface ModuleItem {
  label: string;
  href: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

const modules: ModuleItem[] = [
  {
    label: "Invoice",
    href: "/app/docs/invoices/new",
    icon: FileText,
    color: "#DC2626",
    bg: "#FEF2F2",
  },
  {
    label: "Voucher",
    href: "/app/docs/vouchers/new",
    icon: Receipt,
    color: "#2563EB",
    bg: "#EFF6FF",
  },
  {
    label: "Salary Slip",
    href: "/app/docs/salary-slips/new",
    icon: CreditCard,
    color: "#7C3AED",
    bg: "#F5F3FF",
  },
  {
    label: "Master Data",
    href: "/app/data",
    icon: Database,
    color: "#4F46E5",
    bg: "#EEF2FF",
  },
  {
    label: "Books",
    href: "/app/books",
    icon: BookOpen,
    color: "#B45309",
    bg: "#FFFBEB",
  },
  {
    label: "Pay",
    href: "/app/pay",
    icon: CreditCard,
    color: "#059669",
    bg: "#ECFDF5",
  },
  {
    label: "Intel",
    href: "/app/intel/dashboard",
    icon: BarChart3,
    color: "#0891B2",
    bg: "#ECFEFF",
  },
  {
    label: "Flow",
    href: "/app/flow",
    icon: Workflow,
    color: "#BE185D",
    bg: "#FFF1F2",
  },
  {
    label: "Compliance",
    href: "/app/compliance",
    icon: ShieldCheck,
    color: "#4338CA",
    bg: "#E0E7FF",
  },
  {
    label: "CRM",
    href: "/app/crm",
    icon: Users,
    color: "#C2410C",
    bg: "#FFF7ED",
  },
];

export function ModuleGrid() {
  return (
    <div className="grid grid-cols-5 gap-2">
      {modules.map((mod) => (
        <Link
          key={mod.href}
          href={mod.href}
          className="group flex flex-col items-center gap-1.5 rounded-xl border bg-white p-3 transition-all hover:-translate-y-0.5 hover:border-[#DC2626]"
          style={{ borderColor: "#F0F0F0" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform group-hover:scale-105"
            style={{ background: mod.bg, color: mod.color }}
          >
            <mod.icon className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-medium text-center" style={{ color: "#1C1B1F" }}>
            {mod.label}
          </span>
        </Link>
      ))}
    </div>
  );
}
