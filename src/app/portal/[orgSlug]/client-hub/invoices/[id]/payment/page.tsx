import { notFound } from "next/navigation";
import { ClientHubPaymentSelectionView } from "../../../components/views";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalInvoiceDetail } from "../../../../actions";
import { getEffectiveClientHubConfig } from "../../../components/config-resolver";

export default async function ClientHubInvoicePaymentPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  const session = await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getEffectiveClientHubConfig(orgSlug, session.customerId);

  if (!config.navigation.showPayments) {
    notFound();
  }

  const invoice = await getPortalInvoiceDetail(orgSlug, id);
  if (!invoice) {
    notFound();
  }

  // Ensure invoice is actually payable: not PAID, not CANCELLED, remainingAmount > 0
  const isPayable =
    invoice.status !== "PAID" &&
    invoice.status !== "CANCELLED" &&
    invoice.remainingAmount > 0;

  if (!isPayable) {
    notFound();
  }

  return (
    <ClientHubPaymentSelectionView
      orgSlug={orgSlug}
      invoice={invoice}
      config={config}
    />
  );
}
