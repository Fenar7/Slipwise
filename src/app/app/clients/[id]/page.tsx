import { notFound } from "next/navigation";
import { getClientDetail } from "@/app/app/data/actions";
import { ClientDetailShell } from "../components/client-detail-shell";

export const metadata = {
  title: "Client Detail | Slipwise",
};

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;
  const client = await getClientDetail(id);

  if (!client) {
    notFound();
  }

  return <ClientDetailShell clientId={id} client={client} />;
}
