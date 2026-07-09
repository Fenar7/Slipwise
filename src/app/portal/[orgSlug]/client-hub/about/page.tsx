import { ClientHubAboutView } from "../components/views";
import { getEffectiveClientHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";

export default async function ClientHubAboutPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getEffectiveClientHubConfig(orgSlug, session.customerId);

  if (!config.navigation.showAbout) {
    notFound();
  }

  return <ClientHubAboutView orgSlug={orgSlug} config={config} />;
}
