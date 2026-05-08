"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { getNavigationContext } from "./navigation-context";
import { NotificationBell } from "@/features/flow/components/notification-bell";
import { ProxyBanner } from "@/features/access/components/proxy-banner";
import { Plus, Upload, Users, Building2, Settings, BarChart3, BookOpen, FileText, Receipt, CreditCard, FileSpreadsheet } from "lucide-react";

interface AppTopbarProps {
  orgName?: string;
}

/* ── Page actions based on route ─────────────────────────────────────────── */

interface PageAction {
  label: string;
  href: string;
  icon: React.ElementType;
}

function getPageActions(pathname: string): PageAction[] {
  if (pathname === "/app/docs/invoices" || pathname === "/app/docs/invoices/") {
    return [{ label: "New Invoice", href: "/app/docs/invoices/new", icon: Plus }];
  }
  if (pathname.startsWith("/app/docs/invoices/")) {
    return [{ label: "Invoices", href: "/app/docs/invoices", icon: FileText }];
  }
  if (pathname === "/app/docs/vouchers" || pathname === "/app/docs/vouchers/") {
    return [{ label: "New Voucher", href: "/app/docs/vouchers/new", icon: Plus }];
  }
  if (pathname.startsWith("/app/docs/vouchers/")) {
    return [{ label: "Vouchers", href: "/app/docs/vouchers", icon: Receipt }];
  }
  if (pathname === "/app/docs/salary-slips" || pathname === "/app/docs/salary-slips/") {
    return [{ label: "New Salary Slip", href: "/app/docs/salary-slips/new", icon: Plus }];
  }
  if (pathname.startsWith("/app/docs/salary-slips/")) {
    return [{ label: "Salary Slips", href: "/app/docs/salary-slips", icon: CreditCard }];
  }
  if (pathname === "/app/docs/quotes" || pathname === "/app/docs/quotes/") {
    return [{ label: "New Quote", href: "/app/docs/quotes/new", icon: Plus }];
  }
  if (pathname.startsWith("/app/docs/quotes/")) {
    return [{ label: "Quotes", href: "/app/docs/quotes", icon: FileSpreadsheet }];
  }
  if (pathname.startsWith("/app/docs/vault")) {
    return [{ label: "Upload", href: "/app/docs/vault/upload", icon: Upload }];
  }
  if (pathname === "/app/data" || pathname === "/app/data/") {
    return [
      { label: "Add Customer", href: "/app/data/customers/new", icon: Users },
      { label: "Add Vendor", href: "/app/data/vendors/new", icon: Building2 },
    ];
  }
  if (pathname.startsWith("/app/data/customers")) {
    return [{ label: "Add Customer", href: "/app/data/customers/new", icon: Plus }];
  }
  if (pathname.startsWith("/app/data/vendors")) {
    return [{ label: "Add Vendor", href: "/app/data/vendors/new", icon: Plus }];
  }
  if (pathname.startsWith("/app/settings")) {
    return [{ label: "Organization", href: "/app/settings/organization", icon: Settings }];
  }
  if (pathname.startsWith("/app/intel")) {
    return [{ label: "Reports", href: "/app/intel/reports", icon: BarChart3 }];
  }
  if (pathname.startsWith("/app/books")) {
    return [{ label: "New Entry", href: "/app/books/new", icon: BookOpen }];
  }
  if (pathname.startsWith("/app/pay")) {
    return [{ label: "Payments", href: "/app/pay", icon: CreditCard }];
  }
  if (pathname.startsWith("/app/compliance")) {
    return [{ label: "Compliance", href: "/app/compliance", icon: FileText }];
  }
  return [];
}

export function AppTopbar({ orgName }: AppTopbarProps) {
  const pathname = usePathname();
  const { breadcrumbs, pageTitle, suiteLabel } = getNavigationContext(pathname);
  const actions = getPageActions(pathname);

  return (
    <>
      <ProxyBanner />
      <motion.header
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="sticky top-0 z-20 border-b bg-white"
        style={{ borderColor: "#E0E0E0" }}
      >
        <div className="flex h-16 items-center gap-4 px-5">
          {/* Left: Page title */}
          <div className="min-w-0 flex-shrink-0">
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "#DC2626" }}>
              {suiteLabel === "Home" ? "Slipwise" : suiteLabel}
            </span>
            <h1 className="truncate text-lg font-bold" style={{ color: "#1C1B1F" }}>
              {pageTitle}
            </h1>
          </div>

          {/* Center: breadcrumbs */}
          <nav className="hidden xl:flex flex-wrap items-center gap-2 text-sm min-w-0 flex-1 px-6" style={{ color: "#79747E" }}>
            {breadcrumbs.map((crumb, index) => (
              <div key={`${crumb.label}-${index}`} className="flex items-center gap-2 shrink-0">
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="transition-colors hover:text-[#1C1B1F] font-medium"
                    style={{ color: "#79747E" }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-semibold" style={{ color: "#1C1B1F" }}>{crumb.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? (
                  <span style={{ color: "#E0E0E0" }}>/</span>
                ) : null}
              </div>
            ))}
          </nav>

          {/* Right: page actions + notification */}
          <div className="flex items-center gap-2 shrink-0">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90"
                  style={{ background: "#DC2626", color: "#fff" }}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{action.label}</span>
                </Link>
              );
            })}
            <div className="h-6 w-px mx-1" style={{ background: "#E0E0E0" }} />
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <NotificationBell />
            </motion.div>
          </div>
        </div>
      </motion.header>
    </>
  );
}
