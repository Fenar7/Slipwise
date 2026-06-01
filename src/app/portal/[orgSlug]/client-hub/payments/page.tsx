import { ClientHubPaymentsView } from "../components/views";
import { getPersistedHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";

export default async function ClientHubPaymentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showPayments) {
    notFound();
  }

  return <ClientHubPaymentsView orgSlug={orgSlug} config={config} />;
}
