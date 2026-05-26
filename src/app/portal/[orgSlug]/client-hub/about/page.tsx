import { ClientHubAboutView } from "../components/views";
import { getPersistedHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";

export default async function ClientHubAboutPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showAbout) {
    notFound();
  }

  return <ClientHubAboutView orgSlug={orgSlug} config={config} />;
}
