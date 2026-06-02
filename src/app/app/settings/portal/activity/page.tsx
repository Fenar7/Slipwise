"use client";

import { useState, useEffect, useCallback } from "react";
import { useActiveOrg } from "@/hooks/use-active-org";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getPortalAccessLogs } from "../actions";

type AccessLog = {
  id: string;
  path: string;
  action: string | null;
  ip: string | null;
  statusCode: number | null;
  accessedAt: string | Date;
  customer: { id: string; name: string; email: string };
};

export default function PortalActivityPage() {
  const { activeOrg } = useActiveOrg();
  const { role } = usePermissions();
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filterCustomerId, setFilterCustomerId] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterPath, setFilterPath] = useState("");
  const [filterStatusCode, setFilterStatusCode] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");

  const isAdmin = role === "admin" || role === "owner";

  const loadLogs = useCallback(async (p = 1) => {
    if (!activeOrg?.id) return;
    setLoading(true);
    try {
      const data = await getPortalAccessLogs(activeOrg.id, {
        customerId: filterCustomerId || undefined,
        action: filterAction || undefined,
        path: filterPath || undefined,
        statusCode: filterStatusCode ? parseInt(filterStatusCode, 10) : undefined,
        fromDate: filterFromDate || undefined,
        toDate: filterToDate || undefined,
        page: p,
        pageSize: 25,
      });
      setLogs(data.logs as AccessLog[]);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }, [
    activeOrg?.id,
    filterCustomerId,
    filterAction,
    filterPath,
    filterStatusCode,
    filterFromDate,
    filterToDate,
  ]);

  useEffect(() => {
    loadLogs(1);
  }, [loadLogs]);

  if (!activeOrg) return <div className="text-sm text-[#666]">No active organization.</div>;
  if (!isAdmin) return <div className="text-sm text-red-600">Admin access required.</div>;

  function formatDate(d: string | Date) {
    return new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1a1a1a]">Portal Activity Log</h1>
        <p className="mt-1 text-sm text-[#666]">
          View customer portal access events. Filter by customer, path, action type, status, or date range.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Customer ID</label>
              <Input
                placeholder="Filter by customer ID"
                value={filterCustomerId}
                onChange={(e) => setFilterCustomerId(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Action</label>
              <Input
                placeholder="e.g. otp_verified"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Path</label>
              <Input
                placeholder="e.g. /portal/..."
                value={filterPath}
                onChange={(e) => setFilterPath(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">Status Code</label>
              <Input
                placeholder="e.g. 200, 429"
                value={filterStatusCode}
                onChange={(e) => setFilterStatusCode(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">From Date</label>
              <Input
                type="date"
                value={filterFromDate}
                onChange={(e) => setFilterFromDate(e.target.value)}
                className="text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#666] mb-1">To Date</label>
              <Input
                type="date"
                value={filterToDate}
                onChange={(e) => setFilterToDate(e.target.value)}
                className="text-sm"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button type="button" onClick={() => loadLogs(1)} disabled={loading} className="text-sm">
              Apply Filters
            </Button>
            <button
              type="button"
              className="text-xs text-[#666] hover:text-[#1a1a1a]"
              onClick={() => {
                setFilterCustomerId("");
                setFilterAction("");
                setFilterPath("");
                setFilterStatusCode("");
                setFilterFromDate("");
                setFilterToDate("");
              }}
            >
              Clear
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <span className="text-sm text-[#666]">
            {loading ? "Loading…" : `${total} event${total !== 1 ? "s" : ""}`}
          </span>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[#666] py-4 text-center">Loading logs…</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-[#666] py-4 text-center">No events match the current filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-label="Portal access logs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left">
                      <th className="pb-2 pr-4 text-xs font-medium text-[#666]">Customer</th>
                      <th className="pb-2 pr-4 text-xs font-medium text-[#666]">Path</th>
                      <th className="pb-2 pr-4 text-xs font-medium text-[#666]">Action</th>
                      <th className="pb-2 pr-4 text-xs font-medium text-[#666]">Status</th>
                      <th className="pb-2 pr-4 text-xs font-medium text-[#666]">IP</th>
                      <th className="pb-2 text-xs font-medium text-[#666]">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {logs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2 pr-4">
                          <p className="font-medium text-[#1a1a1a] text-xs truncate max-w-[140px]">
                            {log.customer.name}
                          </p>
                          <p className="text-xs text-[#666] truncate max-w-[140px]">{log.customer.email}</p>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="font-mono text-xs text-[#666] truncate max-w-[180px] block">{log.path}</span>
                        </td>
                        <td className="py-2 pr-4">
                          {log.action ? (
                            <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                              {log.action}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          {log.statusCode !== null ? (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${log.statusCode >= 400 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                              {log.statusCode}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="font-mono text-xs text-[#666]">{log.ip ?? "—"}</span>
                        </td>
                        <td className="py-2 text-xs text-[#666] whitespace-nowrap">
                          {formatDate(log.accessedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-[#666]">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    {page > 1 && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadLogs(page - 1)}
                        className="text-xs"
                      >
                        Previous
                      </Button>
                    )}
                    {page < totalPages && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadLogs(page + 1)}
                        className="text-xs"
                      >
                        Next
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
