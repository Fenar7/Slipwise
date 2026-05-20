import { notFound } from "next/navigation";
import { getMockInvoice } from "../../components/mock-data";
import { ClientHubInvoiceDetailView } from "../../components/views";

export default async function ClientHubInvoiceDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;

  if (!getMockInvoice(id)) {
    notFound();
  }

  return <ClientHubInvoiceDetailView orgSlug={orgSlug} invoiceId={id} />;
}
