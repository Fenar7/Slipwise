import { ClientHubInvoicesView } from "../components/views";

export default async function ClientHubInvoicesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <ClientHubInvoicesView orgSlug={orgSlug} />;
}
