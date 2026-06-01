import { notFound } from "next/navigation";
import { getMockQuote } from "../../components/mock-data";
import { ClientHubQuoteDetailView } from "../../components/views";
import { requirePortalSession } from "@/lib/portal-auth";

export default async function ClientHubQuoteDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; id: string }>;
}) {
  const { orgSlug, id } = await params;
  await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  if (!getMockQuote(id)) {
    notFound();
  }

  return <ClientHubQuoteDetailView quoteId={id} />;
}
