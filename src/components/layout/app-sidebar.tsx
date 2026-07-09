"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/foundation/logo";
import { Avatar } from "@/components/ui/avatar";
import { getNavigationContext } from "./navigation-context";
import { Settings, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { staggerContainer, staggerItem } from "@/components/foundation/motion-primitives";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { signOutSupabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { OrgSwitcher } from "@/components/org/org-switcher";
import { useSidebar } from "./sidebar-context";

interface AppSidebarProps {
  orgName?: string;
  initialUser?: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  };
}

export function AppSidebar({ orgName, initialUser }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { switcherItems } = getNavigationContext(pathname);
  const { user } = useSupabaseSession();
  const { collapsed, toggle } = useSidebar();

  const resolvedName = user?.user_metadata.name ?? initialUser?.name ?? initialUser?.email ?? "";
  const resolvedAvatar = user?.user_metadata.avatar_url ?? initialUser?.avatarUrl ?? undefined;

  const handleSignOut = async () => {
    await signOutSupabaseBrowser();
    router.push("/");
  };

  return (
    <aside
      className="flex h-full flex-col border-r bg-white overflow-hidden"
      style={{ borderColor: "#E0E0E0", width: collapsed ? 60 : 240 }}
    >
      {/* Logo + toggle */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b",
          collapsed ? "justify-center px-0" : "justify-between px-4"
        )}
        style={{ borderColor: "#E0E0E0" }}
      >
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="logo"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <Logo variant="full" />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={toggle}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100",
            collapsed && "mx-auto"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <PanelLeftOpen className="h-4 w-4" style={{ color: "#79747E" }} />
            : <PanelLeftClose className="h-4 w-4" style={{ color: "#79747E" }} />
          }
        </button>
      </div>

      {/* Org Switcher */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="org"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="shrink-0 overflow-hidden border-b"
            style={{ borderColor: "#E0E0E0" }}
          >
            <div className="px-3 py-2.5">
              <OrgSwitcher initialOrgName={orgName} fullWidth />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
        <motion.ul
          className="space-y-0.5"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {switcherItems.map((item) => {
            const isActive = item.isActive;
            const isDisabled = item.badge === "Soon";
            const Icon = item.icon;

            return (
              <motion.li key={item.href} variants={staggerItem}>
                {isDisabled ? (
                  <div
                    className={cn(
                      "flex cursor-not-allowed items-center rounded-lg py-2 opacity-40",
                      collapsed ? "justify-center px-0" : "gap-2.5 px-3"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: "#79747E" }} />}
                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.span
                          key="label"
                          initial={{ opacity: 0, width: 0 }}
                          animate={{ opacity: 1, width: "auto" }}
                          exit={{ opacity: 0, width: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden whitespace-nowrap text-sm font-medium"
                          style={{ color: "#79747E" }}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                ) : (
                  <div className="group">
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                        collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                        isActive
                          ? "bg-red-50 text-[#DC2626]"
                          : "text-[#49454F] hover:bg-gray-50 hover:text-[#1C1B1F]"
                      )}
                    >
                      {Icon && (
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0 transition-colors",
                            isActive ? "text-[#DC2626]" : "text-[#79747E] group-hover:text-[#DC2626]"
                          )}
                        />
                      )}
                      <AnimatePresence initial={false}>
                        {!collapsed && (
                          <motion.span
                            key="label"
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: "auto" }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.15 }}
                            className={cn(
                              "overflow-hidden whitespace-nowrap flex-1",
                              isActive ? "font-bold" : "font-semibold"
                            )}
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {!collapsed && item.children && (
                        <span
                          className={cn(
                            "ml-auto h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                            isActive ? "bg-[#DC2626]" : "bg-[#E0E0E0]"
                          )}
                        />
                      )}
                    </Link>

                    {/* Sub-items — only when expanded */}
                    <AnimatePresence initial={false}>
                      {!collapsed && isActive && item.children && (
                        <motion.ul
                          key="children"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className="mt-0.5 ml-[26px] space-y-0.5 border-l pl-3 overflow-hidden"
                          style={{ borderColor: "#F0F0F0" }}
                        >
                          {(() => {
                            const activeChildIndex = item.children!.reduce((bestIdx, current, currentIdx) => {
                              const currentMatches = pathname === current.href || pathname.startsWith(`${current.href}/`);
                              if (!currentMatches) return bestIdx;
                              if (bestIdx === -1) return currentIdx;
                              // If both match, pick the longer href
                              return current.href.length > item.children![bestIdx].href.length ? currentIdx : bestIdx;
                            }, -1);

                            return item.children!.map((child, index) => {
                              const childActive = index === activeChildIndex;
                              return (
                                <li key={child.href}>
                                  <Link
                                    href={child.href}
                                    className={cn(
                                      "flex items-center rounded-md px-2.5 py-1.5 text-sm transition-colors",
                                      childActive
                                        ? "font-bold text-[#DC2626]"
                                        : "text-[#49454F] hover:text-[#DC2626]"
                                    )}
                                  >
                                    {childActive && (
                                      <span className="mr-2 h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                                    )}
                                    <span className="font-medium">{child.label}</span>
                                  </Link>
                                </li>
                              );
                            });
                          })()}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      </nav>

      {/* Bottom: Profile + Settings */}
      <div
        className={cn(
          "shrink-0 border-t",
          collapsed ? "flex flex-col items-center gap-1 py-3 px-0" : "p-3 space-y-2"
        )}
        style={{ borderColor: "#E0E0E0" }}
      >
        {collapsed ? (
          /* Collapsed: just avatar + settings icon stacked */
          <>
            <button
              onClick={handleSignOut}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-red-50"
              title={`Sign out ${resolvedName}`}
            >
              <Avatar name={resolvedName} imageUrl={resolvedAvatar} size="sm" />
            </button>
            <Link
              href="/app/settings/profile"
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-gray-100"
              title="Settings"
            >
              <Settings className="h-4 w-4" style={{ color: "#79747E" }} />
            </Link>
          </>
        ) : (
          /* Expanded: full profile card + settings link */
          <>
            <div className="flex items-center gap-2.5 rounded-xl border p-2.5" style={{ borderColor: "#F0F0F0" }}>
              <Avatar name={resolvedName} imageUrl={resolvedAvatar} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate" style={{ color: "#1C1B1F" }}>
                  {resolvedName}
                </p>
                <p className="text-[10px] truncate" style={{ color: "#79747E" }}>
                  {initialUser?.email}
                </p>
              </div>
              <button
                onClick={handleSignOut}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-red-50"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" style={{ color: "#79747E" }} />
              </button>
            </div>
            <Link
              href="/app/settings/profile"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
              style={{ color: "#79747E" }}
            >
              <Settings className="h-4 w-4 shrink-0" />
              Settings
            </Link>
          </>
        )}
      </div>
    </aside>
  );
}
