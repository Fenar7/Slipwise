import Link from "next/link";
import { requireOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DashboardSection, ContentPanel } from "@/components/dashboard/dashboard-section";
import { Users, Building2, Briefcase, FileText, Receipt, Quote, FileSpreadsheet } from "lucide-react";

export const metadata = {
  title: "Data | Slipwise",
};

export default async function DataPage() {
  const { orgId } = await requireOrgContext();

  const [
    customerCount,
    vendorCount,
    employeeCount,
    invoiceCount,
    quoteCount,
    salarySlipCount,
  ] = await Promise.all([
    db.customer.count({ where: { organizationId: orgId } }),
    db.vendor.count({ where: { organizationId: orgId } }),
    db.employee.count({ where: { organizationId: orgId } }),
    db.invoice.count({ where: { organizationId: orgId } }),
    db.quote.count({ where: { orgId } }),
    db.salarySlip.count({ where: { organizationId: orgId } }),
  ]);

  const entityCards = [
    {
      label: "Customers",
      count: customerCount,
      href: "/app/data/customers",
      icon: Users,
      description: "Manage clients and billing relationships",
    },
    {
      label: "Vendors",
      count: vendorCount,
      href: "/app/data/vendors",
      icon: Building2,
      description: "Manage suppliers and procurement contacts",
    },
    {
      label: "Employees",
      count: employeeCount,
      href: "/app/data/employees",
      icon: Briefcase,
      description: "Manage staff and payroll records",
    },
  ];

  const documentCards = [
    {
      label: "Invoices",
      count: invoiceCount,
      href: "/app/docs/invoices",
      icon: Receipt,
      description: "Customer billing documents",
    },
    {
      label: "Quotes",
      count: quoteCount,
      href: "/app/docs/quotes",
      icon: Quote,
      description: "Estimates and proposals",
    },
    {
      label: "Salary Slips",
      count: salarySlipCount,
      href: "/app/docs/salary-slips",
      icon: FileSpreadsheet,
      description: "Employee payroll records",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">Master Data</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Entities, relationships, and connected business documents
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Customers" value={customerCount} icon={Users} />
        <KpiCard label="Vendors" value={vendorCount} icon={Building2} />
        <KpiCard label="Employees" value={employeeCount} icon={Briefcase} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DashboardSection title="Entities" subtitle="Manage people and organizations">
          <ContentPanel padding="none">
            <ul className="divide-y divide-[var(--border-soft)]">
              {entityCards.map((card) => (
                <li key={card.label}>
                  <Link
                    href={card.href}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--brand-primary)]">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{card.label}</span>
                        <span className="inline-flex items-center rounded-md bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                          {card.count}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{card.description}</p>
                    </div>
                    <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </ContentPanel>
        </DashboardSection>

        <DashboardSection title="Documents" subtitle="Sales, payroll, and procurement records">
          <ContentPanel padding="none">
            <ul className="divide-y divide-[var(--border-soft)]">
              {documentCards.map((card) => (
                <li key={card.label}>
                  <Link
                    href={card.href}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[var(--surface-subtle)]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-subtle)] text-[var(--brand-primary)]">
                      <card.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">{card.label}</span>
                        <span className="inline-flex items-center rounded-md bg-[var(--surface-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--text-muted)]">
                          {card.count}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{card.description}</p>
                    </div>
                    <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </ContentPanel>
        </DashboardSection>
      </div>
    </div>
  );
}
