import { ClientHubDashboardView } from "./components/views";
import { getEffectiveClientHubConfig } from "./components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalDashboardData } from "../actions";

export default async function ClientHubDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getEffectiveClientHubConfig(orgSlug, session.customerId);

  if (!config.navigation.showDashboard) {
    notFound();
  }

  const data = await getPortalDashboardData(orgSlug);

  return <ClientHubDashboardView orgSlug={orgSlug} config={config} data={data} />;
}

