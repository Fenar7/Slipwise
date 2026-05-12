import { ConnectionDetailClient } from "./connection-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ConnectionDetailPage({ params }: Props) {
  const { id } = await params;
  return <ConnectionDetailClient connectionId={id} />;
}
