import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ClientForm } from "../components/client-form";

export const metadata = {
  title: "New Client | Slipwise",
};

export default function NewClientPage() {
  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/app/clients"
          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Clients
        </Link>
        <span className="text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)] font-medium">New Client</span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Create Client
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Add a new client profile to the workspace and configure default settings.
        </p>
      </div>

      <div className="slipwise-panel max-w-4xl p-6">
        <ClientForm />
      </div>
    </div>
  );
}
