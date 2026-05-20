import { ClientHubDashboardView } from "./components/views";

export default async function ClientHubDashboardPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return <ClientHubDashboardView orgSlug={orgSlug} />;
}
