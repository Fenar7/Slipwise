import { ClientHubContactView } from "../components/views";
import { getPersistedHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";

export default async function ClientHubContactPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showContact) {
    notFound();
  }

  return <ClientHubContactView orgSlug={orgSlug} config={config} />;
}
