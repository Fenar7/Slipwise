import { notFound } from "next/navigation";
import { getMockInvoice } from "../../../components/mock-data";
import { ClientHubPaymentSelectionView } from "../../../components/views";

export default async function ClientHubInvoicePaymentPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;

  if (!getMockInvoice(id)) {
    notFound();
  }

  return <ClientHubPaymentSelectionView orgSlug={orgSlug} invoiceId={id} />;
}
