import { ClientHubJobsView } from "../components/views";
import { getEffectiveClientHubConfig } from "../components/config-resolver";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { getPortalJobsProjects } from "../../actions";

export default async function ClientHubJobsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getEffectiveClientHubConfig(orgSlug, session.customerId);

  if (!config.navigation.showJobs) {
    notFound();
  }

  let jobs;
  let jobsError: string | undefined;

  try {
    jobs = await getPortalJobsProjects(orgSlug);
  } catch {
    jobsError = "Failed to load projects";
  }

  return <ClientHubJobsView orgSlug={orgSlug} config={config} jobs={jobs} jobsError={jobsError} />;
}
