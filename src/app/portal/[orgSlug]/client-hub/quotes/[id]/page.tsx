import { notFound } from "next/navigation";
import { getMockQuote } from "../../components/mock-data";
import { ClientHubQuoteDetailView } from "../../components/views";

export default async function ClientHubQuoteDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { id } = await params;

  if (!getMockQuote(id)) {
    notFound();
  }

  return <ClientHubQuoteDetailView quoteId={id} />;
}
