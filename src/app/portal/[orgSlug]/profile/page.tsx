import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@/lib/db";
import { PortalProfileForm } from "./profile-form";

function formatDate(date: Date | null | undefined) {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PortalProfilePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getPortalSession(orgSlug);
  if (!session) redirect(`/portal/${orgSlug}/auth/login`);

  const [customer, activeSessions] = await Promise.all([
    db.customer.findFirst({
      where: {
        id: session.customerId,
        organizationId: session.orgId,
      },
      select: {
        name: true,
        email: true,
        phone: true,
        address: true,
      },
    }),
    db.customerPortalSession.findMany({
      where: {
        customerId: session.customerId,
        orgId: session.orgId,
        revokedAt: null,
        expiresAt: { gte: new Date() },
      },
      orderBy: { lastSeenAt: "desc" },
      take: 10,
      select: {
        jti: true,
        issuedAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ip: true,
        userAgent: true,
      },
    }),
  ]);

  if (!customer) redirect(`/portal/${orgSlug}/auth/login`);

  await db.customerPortalAccessLog.create({
    data: {
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/profile`,
    },
  });

  const currentJti = session.jti;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Your Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          View and update your contact information
        </p>
      </div>

      <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <PortalProfileForm customer={customer} />
      </div>

      {/* Active Sessions */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Active Sessions</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Devices currently signed in to your portal account
            </p>
          </div>
          <Link
            href={`/portal/${orgSlug}/auth/logout`}
            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            Sign out all devices
          </Link>
        </div>

        {activeSessions.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-400">
            No active sessions found.
          </div>
        ) : (
          <ul className="divide-y divide-slate-50">
            {activeSessions.map((s) => (
              <li key={s.jti} className="flex items-start justify-between gap-4 px-6 py-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {s.userAgent ? s.userAgent.slice(0, 80) : "Unknown browser"}
                    {s.jti === currentJti && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Current
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {s.ip ? `IP: ${s.ip} · ` : ""}
                    Last seen: {formatDate(s.lastSeenAt)}
                  </p>
                </div>
                <div className="shrink-0 text-xs text-slate-400 whitespace-nowrap">
                  Expires {formatDate(s.expiresAt)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
