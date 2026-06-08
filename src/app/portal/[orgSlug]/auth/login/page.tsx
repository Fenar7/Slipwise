import { checkPortalEligibility } from "@/lib/portal-eligibility";
import { redirect } from "next/navigation";
import PortalLoginPageClient from "./login-client";

export default async function PortalLoginPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const eligibility = await checkPortalEligibility(orgSlug);

  if (eligibility.state === "ENABLED_AND_READY" || eligibility.state === "ENABLED_BUT_NOT_READY") {
    redirect(`/portal/${orgSlug}/client-hub/login`);
  }

  return <PortalLoginPageClient />;
}
