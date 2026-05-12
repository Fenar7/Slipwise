"use client";

import { motion } from "motion/react";
import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { WorkspaceTopBarProvider } from "./workspace-topbar-context";
import { SidebarProvider, useSidebar } from "./sidebar-context";

interface AppShellProps {
  children: React.ReactNode;
  orgName?: string;
  initialUser?: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  };
}

function ShellInner({ children, orgName, initialUser }: AppShellProps) {
  const { collapsed } = useSidebar();
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#f8f9fc" }}>
      {/* Sidebar */}
      <motion.div
        className="hidden lg:flex lg:flex-shrink-0 overflow-hidden"
        animate={{ width: collapsed ? 60 : 240 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      >
        <AppSidebar orgName={orgName} initialUser={initialUser} />
      </motion.div>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        <AppTopbar orgName={orgName} />
        <main className="flex-1 overflow-y-auto" style={{ background: "#f8f9fc" }}>
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  return (
    <SidebarProvider>
      <WorkspaceTopBarProvider>
        <ShellInner {...props} />
      </WorkspaceTopBarProvider>
    </SidebarProvider>
  );
}
