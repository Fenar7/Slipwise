import { ClientHubPaymentsView } from "../components/views";
import { getEffectiveClientHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalPaymentsData } from "../../actions";

export default async function ClientHubPaymentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getEffectiveClientHubConfig(orgSlug, session.customerId);

  if (!config.navigation.showPayments) {
    notFound();
  }

  const data = await getPortalPaymentsData(orgSlug);

  return (
    <ClientHubPaymentsView
      orgSlug={orgSlug}
      config={config}
      outstandingBalance={data.outstandingBalance}
      totalPaid={data.totalPaid}
      orgHasBankDetails={data.orgHasBankDetails}
      payments={data.payments}
      outstandingInvoices={data.outstandingInvoices}
    />
  );
}
