"use server";

import { requireOrgContext } from "@/lib/auth";
import type { GstHealthIssue, Gstr1Data, Gstr3bSummary } from "@/lib/gst/reporting";
import {
  exportGstr1CsvForOrg,
  getGstHealthCheckForOrg,
  getGstr1DataForOrg,
  getGstr3bSummaryForOrg,
} from "@/lib/gst/reporting";
import { checkFeature } from "@/lib/plans/enforcement";

type ActionResult<T> = { success: true; data: T } | { success: false; error: string };

export async function getGstr1Data(params: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult<Gstr1Data>> {
  try {
    const { orgId } = await requireOrgContext();
    const allowed = await checkFeature(orgId, "gstrExport");
    if (!allowed) {
      return { success: false, error: "GSTR Export requires a Pro plan or above." };
    }

    return {
      success: true,
      data: await getGstr1DataForOrg(orgId, params),
    };
  } catch (error) {
    console.error("[getGstr1Data]", error);
    return { success: false, error: "Failed to load GSTR-1 data." };
  }
}

export async function getGstr3bSummary(params: {
  month: number;
  year: number;
}): Promise<ActionResult<Gstr3bSummary>> {
  try {
    const { orgId } = await requireOrgContext();
    const allowed = await checkFeature(orgId, "gstrExport");
    if (!allowed) {
      return { success: false, error: "GSTR Export requires a Pro plan or above." };
    }

    return {
      success: true,
      data: await getGstr3bSummaryForOrg(orgId, params),
    };
  } catch (error) {
    console.error("[getGstr3bSummary]", error);
    return { success: false, error: "Failed to load GSTR-3B summary." };
  }
}

export async function exportGstr1Csv(params: {
  startDate: string;
  endDate: string;
}): Promise<ActionResult<string>> {
  try {
    const { orgId } = await requireOrgContext();
    const allowed = await checkFeature(orgId, "gstrExport");
    if (!allowed) {
      return { success: false, error: "GSTR Export requires a Pro plan or above." };
    }

    return {
      success: true,
      data: await exportGstr1CsvForOrg(orgId, params),
    };
  } catch (error) {
    console.error("[exportGstr1Csv]", error);
    return { success: false, error: "Failed to export GSTR-1 CSV." };
  }
}

export async function getGstHealthCheck(): Promise<
  ActionResult<{ issues: GstHealthIssue[] }>
> {
  try {
    const { orgId } = await requireOrgContext();
    return {
      success: true,
      data: await getGstHealthCheckForOrg(orgId),
    };
  } catch (error) {
    console.error("[getGstHealthCheck]", error);
    return { success: false, error: "Failed to run GST health check." };
  }
}
