import { redirect } from "next/navigation";

interface CustomerRedirectPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerRedirectPage({ params }: CustomerRedirectPageProps) {
  const { id } = await params;
  redirect(`/app/clients/${id}`);
}
