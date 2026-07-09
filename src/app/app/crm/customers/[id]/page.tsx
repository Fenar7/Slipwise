import { redirect } from "next/navigation";

// This legacy CRM customer page is consolidated into the canonical Client Hub detail page.
// We cleanly redirect to the client's new canonical view.

interface CustomerCrmPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerCrmPage({ params }: CustomerCrmPageProps) {
  const { id } = await params;
  redirect(`/app/clients/${id}`);
}
