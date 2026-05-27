import { ClientHubInvoicesView } from "../components/views";
import { getPersistedHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";

export default async function ClientHubInvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showInvoices) {
    notFound();
  }

  return <ClientHubInvoicesView orgSlug={orgSlug} config={config} />;
}
