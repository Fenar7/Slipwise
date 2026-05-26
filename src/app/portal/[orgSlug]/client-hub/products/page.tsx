import { ClientHubProductsView } from "../components/views";
import { getPersistedHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";

export default async function ClientHubProductsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showProducts) {
    notFound();
  }

  return <ClientHubProductsView orgSlug={orgSlug} config={config} />;
}
