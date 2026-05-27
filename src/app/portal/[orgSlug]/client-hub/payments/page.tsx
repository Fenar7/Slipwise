import { ClientHubPaymentsView } from "../components/views";
import { getPersistedHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";

export default async function ClientHubPaymentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showPayments) {
    notFound();
  }

  return <ClientHubPaymentsView orgSlug={orgSlug} config={config} />;
}
