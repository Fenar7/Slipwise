import { ClientHubQuotesView } from "../components/views";

export default async function ClientHubQuotesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <ClientHubQuotesView orgSlug={orgSlug} />;
}
