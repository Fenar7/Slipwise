import Link from "next/link";
import { FileText, Receipt, Banknote, Sparkles, ArrowRight } from "lucide-react";

const quickActions = [
  {
    label: "New Invoice",
    href: "/app/docs/invoices/new",
    icon: FileText,
    description: "Create a professional invoice",
  },
  {
    label: "New Voucher",
    href: "/app/docs/vouchers/new",
    icon: Receipt,
    description: "Payment or receipt voucher",
  },
  {
    label: "New Salary Slip",
    href: "/app/docs/salary-slips/new",
    icon: Banknote,
    description: "Generate salary slip",
  },
  {
    label: "Template Store",
    href: "/app/docs/templates",
    icon: Sparkles,
    description: "Browse document templates",
  },
];

export function QuickActionsRow() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {quickActions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="group flex flex-col gap-2 rounded-2xl border bg-white p-4 transition-colors hover:border-[#DC2626]"
          style={{ borderColor: "#E0E0E0" }}
        >
          <div className="flex items-center justify-between">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors group-hover:bg-[#FEF2F2]"
              style={{ background: "#F5F5F5", color: "#49454F" }}
            >
              <action.icon className="h-4 w-4 transition-colors group-hover:text-[#DC2626]" />
            </div>
            <ArrowRight className="h-4 w-4 transition-colors group-hover:text-[#DC2626]" style={{ color: "#E0E0E0" }} />
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "#1C1B1F" }}>
              {action.label}
            </p>
            <p className="text-xs" style={{ color: "#79747E" }}>
              {action.description}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
