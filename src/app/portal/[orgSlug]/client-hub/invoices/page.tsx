import { ClientHubInvoicesView } from "../components/views";
import { getPersistedHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalInvoices, getPortalDashboardData } from "../../actions";

export default async function ClientHubInvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getPersistedHubConfig(orgSlug);

  if (!config.navigation.showInvoices) {
    notFound();
  }

  const invoices = await getPortalInvoices(orgSlug);
  const dashboardData = await getPortalDashboardData(orgSlug);

  return (
    <ClientHubInvoicesView
      orgSlug={orgSlug}
      config={config}
      invoices={invoices}
      outstandingBalance={dashboardData.outstandingBalance}
    />
  );
}
