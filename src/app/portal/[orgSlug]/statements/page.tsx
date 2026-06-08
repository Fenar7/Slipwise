import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@/lib/db";
import { PortalStatementForm } from "./statement-form";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default async function PortalStatementsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const session = await getPortalSession(orgSlug);
  if (!session) redirect(`/portal/${orgSlug}/auth/login`);

  const statements = await db.customerStatement.findMany({
    where: {
      orgId: session.orgId,
      customerId: session.customerId,
    },
    orderBy: { generatedAt: "desc" },
    take: 20,
  });

  await db.customerPortalAccessLog.create({
    data: {
      orgId: session.orgId,
      customerId: session.customerId,
      path: `/portal/${orgSlug}/statements`,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Account Statements
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          View past statements or generate a new one for any date range
        </p>
      </div>

      {/* Generate Statement Form */}
      <PortalStatementForm orgSlug={orgSlug} />

      {/* Past Statements */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Past Statements
          </h2>
        </div>

        {statements.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <svg className="mx-auto mb-3 h-10 w-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
            </svg>
            <p className="text-sm text-slate-500">No statements generated yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Use the form above to generate your first statement
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Account statements">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider text-slate-500">Period</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Opening</th>
                  <th className="hidden px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Invoiced</th>
                  <th className="hidden px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500 sm:table-cell">Received</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">Closing</th>
                  <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                    <span className="sr-only">Download</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statements.map((stmt) => (
                  <tr key={stmt.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4 text-slate-900">
                      {new Date(stmt.fromDate).toLocaleDateString("en-IN")} –{" "}
                      {new Date(stmt.toDate).toLocaleDateString("en-IN")}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      {formatCurrency(stmt.openingBalance)}
                    </td>
                    <td className="hidden px-6 py-4 text-right text-slate-600 sm:table-cell">
                      {formatCurrency(stmt.totalInvoiced)}
                    </td>
                    <td className="hidden px-6 py-4 text-right text-green-700 sm:table-cell">
                      {formatCurrency(stmt.totalReceived)}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-900">
                      {formatCurrency(stmt.closingBalance)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {stmt.fileUrl ? (
                        <a
                          href={stmt.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          Download
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
