import { ClientHubQuotesView } from "../components/views";
import { getEffectiveClientHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalQuotes } from "../../actions";
import { db } from "@/lib/db";

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

  const [quotesResult, orgDefaults] = await Promise.all([
    getPortalQuotes(orgSlug),
    db.orgDefaults.findUnique({
      where: { organizationId: session.orgId },
      select: { portalQuoteAcceptanceEnabled: true },
    }),
  ]);

  const quotes = quotesResult.success ? quotesResult.data : undefined;
  const quotesError = quotesResult.success ? undefined : (quotesResult.error ?? "Failed to load quotes");
  const acceptanceEnabled = orgDefaults?.portalQuoteAcceptanceEnabled ?? false;

  return (
    <ClientHubQuotesView
      orgSlug={orgSlug}
      config={config}
      quotes={quotes}
      quotesError={quotesError}
      acceptanceEnabled={acceptanceEnabled}
    />
  );
}
