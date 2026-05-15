import { ClientDetailShell } from "./components/client-detail-shell";

export const metadata = {
  title: "Client Detail | Slipwise",
};

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  return <ClientDetailShell clientId={id} />;
}
