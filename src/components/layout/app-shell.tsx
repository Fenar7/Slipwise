import { AppSidebar } from "./app-sidebar";
import { AppTopbar } from "./app-topbar";
import { WorkspaceTopBarProvider } from "./workspace-topbar-context";

interface AppShellProps {
  children: React.ReactNode;
  orgName?: string;
  initialUser?: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  };
}

export function AppShell({ children, orgName, initialUser }: AppShellProps) {
  return (
    <WorkspaceTopBarProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "#f8f9fc" }}>
        {/* Sidebar */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <AppSidebar orgName={orgName} initialUser={initialUser} />
        </div>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <AppTopbar orgName={orgName} />
          <main className="flex-1 overflow-y-auto" style={{ background: "#f8f9fc" }}>
            {children}
          </main>
        </div>
      </div>
    </WorkspaceTopBarProvider>
  );
}
