"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { getNavigationContext } from "./navigation-context";
import { NotificationBell } from "@/features/flow/components/notification-bell";
import { ProxyBanner } from "@/features/access/components/proxy-banner";
import { useWorkspaceTopBar } from "./workspace-topbar-context";
import { cn } from "@/lib/utils";
import { FileText, ScrollText } from "lucide-react";

interface AppTopbarProps {
  orgName?: string;
}

function actionClassName(variant: "primary" | "secondary" | "subtle") {
  switch (variant) {
    case "primary":
      return "bg-[var(--brand-cta)] text-white hover:bg-[#B91C1C]";
    case "secondary":
      return "border border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]";
    case "subtle":
    default:
      return "bg-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]";
  }
}

export function AppTopbar({ orgName }: AppTopbarProps) {
  const pathname = usePathname();
  const { breadcrumbs, pageTitle } = getNavigationContext(pathname);
  const { actions, headerContent, viewToggle } = useWorkspaceTopBar();

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

          {/* Right: workspace actions + notification bell */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Workspace header content (e.g. tags) */}
            {headerContent}

            {/* Workspace actions */}
            {actions.length > 0 && (
              <div className="flex items-center gap-1">
                {actions.map((action) => {
                  const className = cn(
                    "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:cursor-wait disabled:opacity-65",
                    actionClassName(action.variant),
                  );
                  return action.href ? (
                    <Link key={action.id} href={action.href} className={className}>
                      {action.label}
                    </Link>
                  ) : (
                    <button
                      key={action.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        action.onClick?.();
                      }}
                      disabled={action.disabled}
                      className={className}
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* View toggle (Form/Document) */}
            {viewToggle && (
              <div className="flex gap-0.5 rounded-md bg-[var(--surface-subtle)] p-0.5">
                <button
                  type="button"
                  onClick={() => viewToggle.onChange("form")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
                    viewToggle.mode === "form"
                      ? "bg-white text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Form
                </button>
                <button
                  type="button"
                  onClick={() => viewToggle.onChange("document")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors",
                    viewToggle.mode === "document"
                      ? "bg-white text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  Document
                </button>
              </div>
            )}

            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <NotificationBell />
            </motion.div>
          </div>
        </div>
      </motion.header>
    </>
  );
}