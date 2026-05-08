"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/foundation/logo";
import { Avatar } from "@/components/ui/avatar";
import { getNavigationContext } from "./navigation-context";
import { Settings, LogOut } from "lucide-react";
import { staggerContainer, staggerItem } from "@/components/foundation/motion-primitives";
import { useSupabaseSession } from "@/hooks/use-supabase-session";
import { signOutSupabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { OrgSwitcher } from "@/components/org/org-switcher";

interface AppSidebarProps {
  orgName?: string;
  initialUser?: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  };
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */

export function AppSidebar({ orgName, initialUser }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { switcherItems } = getNavigationContext(pathname);
  const { user } = useSupabaseSession();

  const resolvedName = user?.user_metadata.name ?? initialUser?.name ?? initialUser?.email ?? "";
  const resolvedAvatar = user?.user_metadata.avatar_url ?? initialUser?.avatarUrl ?? undefined;

  const handleSignOut = async () => {
    await signOutSupabaseBrowser();
    router.push("/");
  };

  return (
    <aside className="flex h-full w-60 flex-col border-r bg-white" style={{ borderColor: "#E0E0E0" }}>
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: "#E0E0E0" }}>
        <Logo variant="full" />
      </div>

      {/* Org Switcher */}
      <div className="border-b px-3 py-2.5" style={{ borderColor: "#E0E0E0" }}>
        <OrgSwitcher initialOrgName={orgName} fullWidth />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
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
                  <div className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 opacity-40">
                    {Icon && <Icon className="h-4 w-4 shrink-0" style={{ color: "#79747E" }} />}
                    <span className="text-sm font-medium" style={{ color: "#79747E" }}>{item.label}</span>
                    <span
                      className="ml-auto rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider"
                      style={{ background: "#F5F5F5", color: "#79747E" }}
                    >
                      Soon
                    </span>
                  </div>
                ) : (
                  <div className="group">
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
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
                      <span className={cn(isActive ? "font-bold" : "font-semibold")}>{item.label}</span>
                      {item.children && (
                        <span
                          className={cn(
                            "ml-auto h-1.5 w-1.5 rounded-full transition-colors",
                            isActive ? "bg-[#DC2626]" : "bg-[#E0E0E0]"
                          )}
                        />
                      )}
                    </Link>
                    {isActive && item.children && (
                      <motion.ul
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="mt-0.5 ml-[26px] space-y-0.5 border-l pl-3 overflow-hidden"
                        style={{ borderColor: "#F0F0F0" }}
                      >
                        {item.children.map((child) => {
                          const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
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
                        })}
                      </motion.ul>
                    )}
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      </nav>

      {/* Bottom: Profile + Settings */}
      <div className="border-t p-3 space-y-2" style={{ borderColor: "#E0E0E0" }}>
        {/* User Profile */}
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

        {/* Settings Link */}
        <Link
          href="/app/settings/profile"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-50"
          style={{ color: "#79747E" }}
        >
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
      </div>
    </aside>
  );
}
