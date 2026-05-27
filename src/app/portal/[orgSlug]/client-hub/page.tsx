import { ClientHubDashboardView } from "./components/views";
import { getPersistedHubConfig } from "./components/config-resolver";
import { notFound } from "next/navigation";

export default async function ClientHubDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showDashboard) {
    notFound();
  }

  return <ClientHubDashboardView orgSlug={orgSlug} config={config} />;
}
