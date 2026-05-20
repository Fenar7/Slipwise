import { ClientHubPaymentsView } from "../components/views";

export default async function ClientHubPaymentsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <ClientHubPaymentsView orgSlug={orgSlug} />;
}
