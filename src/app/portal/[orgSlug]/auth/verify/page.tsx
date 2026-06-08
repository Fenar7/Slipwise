import { redirect } from "next/navigation";
import Link from "next/link";
import { verifyMagicLink } from "@/lib/portal-auth";
import { checkPortalEligibility } from "@/lib/portal-eligibility";

export default async function PortalVerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ token?: string; cid?: string }>;
}) {
  const { orgSlug } = await params;
  const { token, cid } = await searchParams;

  if (!token || !cid) {
    return <InvalidLink orgSlug={orgSlug} />;
  }

  let verified = false;
  try {
    const result = await verifyMagicLink(token, cid, orgSlug);
    if (result.success) {
      verified = true;
    }
  } catch {
    // Verification failed — fall through to error UI
  }

  if (verified) {
    const eligibility = await checkPortalEligibility(orgSlug);
    if (eligibility.state === "ENABLED_AND_READY" || eligibility.state === "ENABLED_BUT_NOT_READY") {
      redirect(`/portal/${orgSlug}/client-hub`);
    } else {
      redirect(`/portal/${orgSlug}/dashboard`);
    }
  }

  return <InvalidLink orgSlug={orgSlug} />;
}

function InvalidLink({ orgSlug }: { orgSlug: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <svg className="h-6 w-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900">
          Link Invalid or Expired
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          This login link is no longer valid. It may have expired or already been
          used. Please request a new one.
        </p>
        <Link
          href={`/portal/${orgSlug}/auth/login`}
          className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Back to Login
        </Link>
      </div>
    </div>
  );
}
