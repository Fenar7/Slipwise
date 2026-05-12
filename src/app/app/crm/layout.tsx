import type { ReactNode } from "react";

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-var(--topbar-height,56px))] bg-[var(--surface-base)]">
      <div className="mx-auto max-w-[var(--container-content,80rem)] px-4 py-6 sm:px-6">
        {children}
      </div>
    </div>
  );
}
