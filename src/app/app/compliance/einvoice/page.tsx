"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getComplianceDashboard, listAllEInvoiceRequests } from "./actions";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";

type DashboardData = Awaited<ReturnType<typeof getComplianceDashboard>>;
type RequestData = Awaited<ReturnType<typeof listAllEInvoiceRequests>>;

function StatCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${color ?? "text-slate-900"}`}>{value}</p>
    </div>
  );
}

export default function EInvoiceDashboardPage() {
  const [stats, setStats] = useState<DashboardData | null>(null);
  const [requests, setRequests] = useState<RequestData>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getComplianceDashboard(),
      listAllEInvoiceRequests(),
    ])
      .then(([statsData, requestsData]) => {
        setStats(statsData);
        setRequests(requestsData);
      })
      .finally(() => setLoading(false));
  }, []);

  const eInvoiceByStatus = Object.fromEntries(
    (stats?.eInvoiceStats ?? []).map((s) => [s.status, s._count.id])
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
          <Link href="/app/compliance" className="hover:text-slate-900">Compliance</Link>
          <span>/</span>
          <span className="text-slate-900">E-Invoice (IRN)</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">E-Invoice (IRN) Dashboard</h1>
          <Link
            href="/app/settings/compliance/einvoice"
            className="text-sm border rounded-md px-3 py-1.5 font-medium hover:bg-slate-50"
          >
            Configuration
          </Link>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Monitor your e-invoice generation requests and statuses via NIC IRP.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Successfully Generated" value={eInvoiceByStatus["SUCCESS"] ?? 0} color="text-green-700" />
            <StatCard label="Pending" value={eInvoiceByStatus["PENDING"] ?? 0} color="text-yellow-600" />
            <StatCard label="Failed" value={eInvoiceByStatus["FAILED"] ?? 0} color="text-red-600" />
            <StatCard label="Cancelled" value={eInvoiceByStatus["CANCELLED"] ?? 0} color="text-slate-500" />
          </div>

          <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Recent IRN Requests</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice #</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Customer</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Amount</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">IRN / Error</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No E-Invoice requests found.
                      </td>
                    </tr>
                  )}
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatIsoDate(req.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/app/sales/invoices/${req.invoiceId}`} className="text-blue-600 hover:underline">
                          {req.invoice.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={req.invoice.customerName ?? ""}>
                        {req.invoice.customerName ?? "N/A"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                        {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(toAccountingNumber(req.invoice.totalAmount))}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          req.status === "SUCCESS" ? "bg-green-100 text-green-700" :
                          req.status === "FAILED" ? "bg-red-100 text-red-700" :
                          req.status === "CANCELLED" ? "bg-slate-100 text-slate-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs max-w-[300px] truncate">
                        {req.status === "SUCCESS" ? (
                          <span title={req.irnNumber ?? ""}>{req.irnNumber}</span>
                        ) : req.status === "FAILED" ? (
                          <span className="text-red-600" title={req.errorMessage ?? ""}>{req.errorCode}: {req.errorMessage}</span>
                        ) : req.status === "CANCELLED" ? (
                          <span title={req.cancelReason ?? ""}>{req.cancelReason}</span>
                        ) : (
                          "Processing..."
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
