import { notFound } from "next/navigation";
import { getMockInvoice } from "../../../components/mock-data";
import { ClientHubPaymentSelectionView } from "../../../components/views";
import { requirePortalSession } from "@/lib/portal-auth";

export default async function ClientHubInvoicePaymentPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  if (!getMockInvoice(id)) {
    notFound();
  }

  return <ClientHubPaymentSelectionView orgSlug={orgSlug} invoiceId={id} />;
}
