"use server";

import { getDocsSummary } from "@/lib/docs-vault";
import {
  getDashboardKPIs,
  getRevenueTrendData,
  getRecentActivity,
  type DashboardKPIs,
  type RevenueTrendPoint,
  type ActivityEntry,
} from "@/app/app/intel/dashboard/actions";


export interface DashboardData {
  counts: {
    invoice: number;
    voucher: number;
    salarySlip: number;
    quote: number;
    total: number;
  };
  kpis: DashboardKPIs;
  revenueTrend: RevenueTrendPoint[];
  recentActivity: ActivityEntry[];
  recentDocs: {
    id: string;
    docType: string;
    documentNumber: string;
    titleOrSummary: string;
    counterpartyLabel: string | null;
    status: string;
    primaryDate: Date;
    amount: number | null;
  }[];
}

export async function getDashboardData(): Promise<
  { success: true; data: DashboardData } | { success: false; error: string }
> {
  try {
    const [
      docsSummary,
      kpisResult,
      revenueResult,
      activityResult,
    ] = await Promise.allSettled([
      getDocsSummary(),
      getDashboardKPIs("this-month"),
      getRevenueTrendData(),
      getRecentActivity(),
    ]);

    const summary =
      docsSummary.status === "fulfilled" ? docsSummary.value : null;

    const kpis =
      kpisResult.status === "fulfilled" && kpisResult.value.success
        ? kpisResult.value.data
        : {
            pay: {
              invoicesIssued: 0,
              totalDue: 0,
              overdue: 0,
              paidThisMonth: 0,
            },
            voucher: { voucherSpend: 0, voucherCount: 0, receiptTotal: 0 },
            salary: { pendingTotal: 0, released: 0, headcount: 0 },
          };

    const revenueTrend =
      revenueResult.status === "fulfilled" && revenueResult.value.success
        ? revenueResult.value.data
        : [];

    const recentActivity =
      activityResult.status === "fulfilled" && activityResult.value.success
        ? activityResult.value.data
        : [];



    return {
      success: true,
      data: {
        counts: {
          invoice: summary?.counts.invoice ?? 0,
          voucher: summary?.counts.voucher ?? 0,
          salarySlip: summary?.counts.salary_slip ?? 0,
          quote: summary?.counts.quote ?? 0,
          total: summary?.totalActive ?? 0,
        },
        kpis,
        revenueTrend,
        recentActivity,
        recentDocs: (summary?.recentDocuments ?? []).map((d) => ({
          id: d.id,
          docType: d.docType,
          documentNumber: d.documentNumber,
          titleOrSummary: d.titleOrSummary,
          counterpartyLabel: d.counterpartyLabel,
          status: d.status,
          primaryDate: d.primaryDate,
          amount: d.amount,
        })),
      },
    };
  } catch (error) {
    console.error("[getDashboardData]", error);
    return { success: false, error: "Failed to load dashboard data" };
  }
}
