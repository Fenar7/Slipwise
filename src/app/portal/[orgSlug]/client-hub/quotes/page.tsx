import { ClientHubQuotesView } from "../components/views";
import { getEffectiveClientHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalQuotes } from "../../actions";

export default async function ClientHubQuotesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getEffectiveClientHubConfig(orgSlug, session.customerId);

  if (!config.navigation.showQuotes) {
    notFound();
  }

  const quotesResult = await getPortalQuotes(orgSlug);
  const quotes = quotesResult.success ? quotesResult.data : [];

  return <ClientHubQuotesView orgSlug={orgSlug} config={config} quotes={quotes} />;
}
