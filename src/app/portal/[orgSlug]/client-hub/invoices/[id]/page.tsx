import { notFound } from "next/navigation";
import { ClientHubInvoiceDetailView } from "../../components/views";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalInvoiceDetail } from "../../../actions";
import { getPersistedHubConfig } from "../../components/config-resolver";

export default async function ClientHubInvoiceDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showInvoices) {
    notFound();
  }

  const invoice = await getPortalInvoiceDetail(orgSlug, id);
  if (!invoice) {
    notFound();
  }

  return (
    <ClientHubInvoiceDetailView
      orgSlug={orgSlug}
      invoice={invoice}
      config={config}
    />
  );
}
