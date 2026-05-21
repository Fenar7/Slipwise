import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getClientDetail } from "@/app/app/data/actions";
import { ClientForm } from "../../components/client-form";

export const metadata = {
  title: "Edit Client | Slipwise",
};

interface EditClientPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: EditClientPageProps) {
  const { id } = await params;
  const client = await getClientDetail(id);

  if (!client) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-sm">
        <Link
          href={`/app/clients/${client.id}`}
          className="inline-flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {client.name}
        </Link>
        <span className="text-[var(--text-muted)]">/</span>
        <span className="text-[var(--text-secondary)] font-medium">Edit Profile</span>
      </div>

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          Edit Client Profile
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Update the profile details, tax identifiers, and workspace preferences for this client.
        </p>
      </div>

      <div className="slipwise-panel max-w-4xl p-6">
        <ClientForm client={client} />
      </div>
    </div>
  );
}
