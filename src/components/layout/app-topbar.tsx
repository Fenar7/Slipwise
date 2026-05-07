"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { getNavigationContext } from "./navigation-context";
import { NotificationBell } from "@/features/flow/components/notification-bell";
import { ProxyBanner } from "@/features/access/components/proxy-banner";

interface AppTopbarProps {
  orgName?: string;
}

export function AppTopbar({ orgName }: AppTopbarProps) {
  const pathname = usePathname();
  const { breadcrumbs, pageTitle, suiteLabel } = getNavigationContext(pathname);

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
        <div className="flex h-14 items-center gap-4 px-4 sm:px-6">
          {/* Mobile: show page title */}
          <div className="min-w-0 flex-1 lg:hidden">
            <h1 className="truncate text-sm font-semibold" style={{ color: "#1C1B1F" }}>
              {pageTitle}
            </h1>
          </div>

          {/* Desktop: breadcrumbs */}
          <nav className="hidden lg:flex flex-wrap items-center gap-2 text-xs min-w-0 flex-1" style={{ color: "#79747E" }}>
            {breadcrumbs.map((crumb, index) => (
              <div key={`${crumb.label}-${index}`} className="flex items-center gap-2 shrink-0">
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="transition-colors hover:text-[#1C1B1F]"
                    style={{ color: "#79747E" }}
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span style={{ color: "#49454F" }}>{crumb.label}</span>
                )}
                {index < breadcrumbs.length - 1 ? (
                  <span style={{ color: "#E0E0E0" }}>/</span>
                ) : null}
              </div>
            ))}
          </nav>

          {/* Right: just notification bell */}
          <div className="flex items-center gap-2 shrink-0">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <NotificationBell />
            </motion.div>
          </div>
        </div>
      </motion.header>
    </>
  );
}
