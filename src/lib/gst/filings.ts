import "server-only";

import crypto from "node:crypto";
import type {
  GstFilingEventType,
  GstFilingReconciliationStatus,
  GstFilingRunStatus,
  GstFilingSubmissionStatus,
  GstFilingValidationSeverity,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { generateGSTR1 } from "@/lib/gstr1-generator";
import { formatIsoDate, toAccountingNumber } from "@/lib/accounting/utils";
import {
  computeGstHealthIssuesFromInvoices,
  computeGstr1DataFromInvoices,
  computeGstr3bSummaryFromInvoices,
  getMonthDateRange,
  isValidPeriodMonth,
  listGstInvoicesForOrg,
} from "@/lib/gst/reporting";
import { logAudit } from "@/lib/audit";

type FilingValidationIssueInput = {
  code: string;
  severity: GstFilingValidationSeverity;
  message: string;
  invoiceId?: string;
  invoiceNumber?: string;
  metadata?: Prisma.InputJsonValue;
};

export type GstFilingListItem = Awaited<ReturnType<typeof listGstFilingRuns>>[number];

export type GstFilingRunDetail = NonNullable<
  Awaited<ReturnType<typeof getGstFilingRunDetail>>
>;

const PRE_SUBMISSION_STATUSES: GstFilingRunStatus[] = [
  "DRAFT",
  "BLOCKED",
  "READY",
  "FAILED",
];

const SUBMISSION_ACTIVE_STATUSES: GstFilingSubmissionStatus[] = [
  "INTENT_RECORDED",
  "SUBMITTED",
  "ACKNOWLEDGED",
];

function compactJson(
  input: Record<string, Prisma.InputJsonValue | undefined>,
): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Prisma.InputJsonObject;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function assertPeriodMonth(periodMonth: string): void {
  if (!isValidPeriodMonth(periodMonth)) {
    throw new Error("Invalid filing period. Expected YYYY-MM.");
  }
}

function hashSnapshot(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeIssueCode(message: string): string {
  if (message.includes("Missing organization GSTIN")) return "ORG_GSTIN_MISSING";
  if (message.includes("No issued invoices")) return "NIL_RETURN_CHECK";
  if (message.includes("Missing customer GSTIN")) return "CUSTOMER_GSTIN_MISSING";
  if (message.includes("HSN/SAC")) return "HSN_OR_SAC_MISSING";
  if (message.includes("line items do not match")) return "GST_TOTAL_MISMATCH";
  if (message.includes("place of supply")) return "PLACE_OF_SUPPLY_MISSING";
  return "GST_VALIDATION_ISSUE";
}

function mapRunStatusVariant(status: GstFilingRunStatus): "danger" | "warning" | "success" | "default" {
  if (status === "FAILED" || status === "BLOCKED") return "danger";
  if (status === "RECONCILED") return "success";
  if (status === "READY") return "success";
  if (status === "SUBMISSION_PENDING" || status === "RECONCILING") return "warning";
  return "default";
}

async function createEvent(
  tx: Prisma.TransactionClient,
  input: {
    filingRunId: string;
    orgId: string;
    eventType: GstFilingEventType;
    actorId?: string;
    note?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.gstFilingEvent.create({
    data: {
      filingRunId: input.filingRunId,
      orgId: input.orgId,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      note: input.note ?? null,
      metadata: input.metadata ?? Prisma.DbNull,
    },
  });
}

async function createStatusTransitionEvent(
  tx: Prisma.TransactionClient,
  input: {
    filingRunId: string;
    orgId: string;
    actorId: string;
    fromStatus: GstFilingRunStatus;
    toStatus: GstFilingRunStatus;
    note?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  if (input.fromStatus === input.toStatus) {
    return;
  }

  await createEvent(tx, {
    filingRunId: input.filingRunId,
    orgId: input.orgId,
    actorId: input.actorId,
    eventType: "STATUS_CHANGED",
    note: input.note,
    metadata: compactJson({
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      ...(input.metadata ? { extra: input.metadata } : {}),
    }),
  });
}

async function buildValidationSnapshot(orgId: string, periodMonth: string) {
  assertPeriodMonth(periodMonth);
  const range = getMonthDateRange(periodMonth);

  const [orgDefaults, invoices] = await Promise.all([
    db.orgDefaults.findUnique({
      where: { organizationId: orgId },
      select: {
        gstin: true,
        gstStateCode: true,
        updatedAt: true,
      },
    }),
    listGstInvoicesForOrg(orgId, range),
  ]);

  const reportingInvoices = invoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber ?? "",
    invoiceDate: formatIsoDate(invoice.invoiceDate),
    customerId: invoice.customerId,
    customerGstin: invoice.customerGstin,
    customerName: invoice.customer?.name ?? null,
    placeOfSupply: invoice.placeOfSupply,
    reverseCharge: invoice.reverseCharge,
    exportType: invoice.exportType,
    totalAmount: toAccountingNumber(invoice.totalAmount),
    gstTotalCgst: toAccountingNumber(invoice.gstTotalCgst),
    gstTotalSgst: toAccountingNumber(invoice.gstTotalSgst),
    gstTotalIgst: toAccountingNumber(invoice.gstTotalIgst),
    gstTotalCess: toAccountingNumber(invoice.gstTotalCess),
    lineItems: invoice.lineItems.map((lineItem) => ({
      amount: toAccountingNumber(lineItem.amount),
      hsnCode: lineItem.hsnCode,
      sacCode: lineItem.sacCode,
      gstType: lineItem.gstType,
      cgstAmount: toAccountingNumber(lineItem.cgstAmount),
      sgstAmount: toAccountingNumber(lineItem.sgstAmount),
      igstAmount: toAccountingNumber(lineItem.igstAmount),
      cessAmount: toAccountingNumber(lineItem.cessAmount),
    })),
  }));

  const issues: FilingValidationIssueInput[] = [];
  if (!orgDefaults?.gstin) {
    issues.push({
      code: "ORG_GSTIN_MISSING",
      severity: "ERROR",
      message: "Missing organization GSTIN — filing package cannot be prepared.",
    });
  }

  if (reportingInvoices.length === 0) {
    issues.push({
      code: "NIL_RETURN_CHECK",
      severity: "INFO",
      message: "No issued invoices found for this period — validate nil return obligations before submission.",
    });
  }

  for (const issue of computeGstHealthIssuesFromInvoices(invoices)) {
    issues.push({
      code: normalizeIssueCode(issue.issue),
      severity:
        issue.severity === "error"
          ? "ERROR"
          : issue.severity === "warning"
            ? "WARNING"
            : "INFO",
      message: issue.issue,
      invoiceId: issue.invoiceId,
      invoiceNumber: issue.invoiceNumber,
    });
  }

  const blockerCount = issues.filter((issue) => issue.severity === "ERROR").length;
  const warningCount = issues.filter((issue) => issue.severity === "WARNING").length;
  const infoCount = issues.filter((issue) => issue.severity === "INFO").length;
  const gstr1Data = computeGstr1DataFromInvoices(invoices);
  const gstr3bSummary = computeGstr3bSummaryFromInvoices(invoices);
  const sourceSnapshotHash = hashSnapshot({
    periodMonth,
    orgDefaults: {
      gstin: orgDefaults?.gstin ?? null,
      gstStateCode: orgDefaults?.gstStateCode ?? null,
      updatedAt: orgDefaults?.updatedAt?.toISOString() ?? null,
    },
    invoices: reportingInvoices,
  });

  const summary = compactJson({
    periodMonth,
    returnType: "GSTR1",
    orgGstin: orgDefaults?.gstin ?? undefined,
    orgStateCode: orgDefaults?.gstStateCode ?? undefined,
    invoiceCount: reportingInvoices.length,
    blockerCount,
    warningCount,
    infoCount,
    sourceSnapshotHash,
    gstr1Summary: toInputJsonValue(gstr1Data.summary),
    gstr3bSummary: toInputJsonValue(gstr3bSummary),
  });

  return {
    issues,
    blockerCount,
    warningCount,
    infoCount,
    sourceSnapshotHash,
    summary,
  };
}

async function getRunForMutation(orgId: string, runId: string) {
  const run = await db.gstFilingRun.findFirst({
    where: { id: runId, orgId },
    include: {
      submissions: {
        orderBy: { attempt: "desc" },
        take: 5,
      },
    },
  });

  if (!run) {
    throw new Error("GST filing run not found.");
  }

  return run;
}

async function ensureCurrentValidation(run: {
  orgId: string;
  periodMonth: string;
  validatedSnapshotHash: string | null;
  status: GstFilingRunStatus;
}) {
  const snapshot = await buildValidationSnapshot(run.orgId, run.periodMonth);
  const isStale = !run.validatedSnapshotHash || run.validatedSnapshotHash !== snapshot.sourceSnapshotHash;

  if (isStale) {
    throw new Error("Validation is stale. Re-run validation before continuing.");
  }

  if (snapshot.blockerCount > 0) {
    throw new Error("Resolve GST validation blockers before continuing.");
  }

  return snapshot;
}

export async function listGstFilingRuns(input: {
  orgId: string;
  status?: GstFilingRunStatus;
  periodMonth?: string;
}) {
  return db.gstFilingRun.findMany({
    where: {
      orgId: input.orgId,
      ...(input.status ? { status: input.status } : {}),
      ...(input.periodMonth ? { periodMonth: input.periodMonth } : {}),
    },
    select: {
      id: true,
      periodMonth: true,
      returnType: true,
      status: true,
      blockerCount: true,
      warningCount: true,
      lastValidatedAt: true,
      submittedAt: true,
      reconciledAt: true,
      createdAt: true,
      updatedAt: true,
      summary: true,
      submissions: {
        select: {
          id: true,
          attempt: true,
          status: true,
          externalReference: true,
          acknowledgementNumber: true,
          initiatedAt: true,
          completedAt: true,
        },
        orderBy: { attempt: "desc" },
        take: 1,
      },
      reconciliations: {
        select: {
          id: true,
          status: true,
          matchedCount: true,
          varianceCount: true,
          resolvedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ periodMonth: "desc" }, { createdAt: "desc" }],
  });
}

export async function getGstFilingRunDetail(input: {
  orgId: string;
  runId: string;
}) {
  const run = await db.gstFilingRun.findFirst({
    where: {
      id: input.runId,
      orgId: input.orgId,
    },
    include: {
      validationIssues: {
        orderBy: [{ createdAt: "asc" }],
      },
      submissions: {
        orderBy: [{ attempt: "desc" }],
      },
      reconciliations: {
        orderBy: [{ createdAt: "desc" }],
      },
      events: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  if (!run) {
    return null;
  }

  let isValidationStale = !run.validatedSnapshotHash;
  if (PRE_SUBMISSION_STATUSES.includes(run.status)) {
    const snapshot = await buildValidationSnapshot(run.orgId, run.periodMonth);
    isValidationStale =
      !run.validatedSnapshotHash || run.validatedSnapshotHash !== snapshot.sourceSnapshotHash;
  }

  return {
    run,
    isValidationStale,
    statusVariant: mapRunStatusVariant(run.status),
    latestSubmission: run.submissions[0] ?? null,
    latestReconciliation: run.reconciliations[0] ?? null,
  };
}

export async function createGstFilingRun(input: {
  orgId: string;
  actorId: string;
  periodMonth: string;
  note?: string;
}) {
  assertPeriodMonth(input.periodMonth);

  try {
    const run = await db.$transaction(async (tx) => {
      const created = await tx.gstFilingRun.create({
        data: {
          orgId: input.orgId,
          periodMonth: input.periodMonth,
          returnType: "GSTR1",
          status: "DRAFT",
          notes: input.note?.trim() || null,
          createdByUserId: input.actorId,
          updatedByUserId: input.actorId,
        },
      });

      await createEvent(tx, {
        filingRunId: created.id,
        orgId: created.orgId,
        actorId: input.actorId,
        eventType: "RUN_CREATED",
        note: input.note?.trim() || undefined,
        metadata: compactJson({
          periodMonth: created.periodMonth,
          returnType: created.returnType,
        }),
      });

      return created;
    });

    await logAudit({
      orgId: input.orgId,
      actorId: input.actorId,
      action: "gst.filing.created",
      entityType: "GstFilingRun",
      entityId: run.id,
      metadata: {
        periodMonth: run.periodMonth,
        returnType: run.returnType,
      },
    });

    return run;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await db.gstFilingRun.findUnique({
        where: {
          orgId_periodMonth_returnType: {
            orgId: input.orgId,
            periodMonth: input.periodMonth,
            returnType: "GSTR1",
          },
        },
      });

      if (!existing) {
        throw new Error("Unable to create GST filing run.");
      }

      return existing;
    }

    throw error;
  }
}

export async function validateGstFilingRun(input: {
  orgId: string;
  actorId: string;
  runId: string;
}) {
  const current = await getRunForMutation(input.orgId, input.runId);
  if (!PRE_SUBMISSION_STATUSES.includes(current.status)) {
    throw new Error("Only draft, blocked, ready, or failed runs can be revalidated.");
  }

  const snapshot = await buildValidationSnapshot(input.orgId, current.periodMonth);
  const nextStatus: GstFilingRunStatus = snapshot.blockerCount > 0 ? "BLOCKED" : "READY";

  const run = await db.$transaction(async (tx) => {
    await tx.gstFilingValidationIssue.deleteMany({
      where: { filingRunId: current.id },
    });

    if (snapshot.issues.length > 0) {
      await tx.gstFilingValidationIssue.createMany({
        data: snapshot.issues.map((issue) => ({
          filingRunId: current.id,
          orgId: input.orgId,
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
          invoiceId: issue.invoiceId ?? null,
          invoiceNumber: issue.invoiceNumber ?? null,
          metadata: issue.metadata ?? Prisma.JsonNull,
        })),
      });
    }

    const updated = await tx.gstFilingRun.update({
      where: { id: current.id },
      data: {
        status: nextStatus,
        blockerCount: snapshot.blockerCount,
        warningCount: snapshot.warningCount,
        sourceSnapshotHash: snapshot.sourceSnapshotHash,
        validatedSnapshotHash: snapshot.sourceSnapshotHash,
        lastValidatedAt: new Date(),
        updatedByUserId: input.actorId,
        summary: snapshot.summary,
      },
    });

    await createEvent(tx, {
      filingRunId: current.id,
      orgId: input.orgId,
      actorId: input.actorId,
      eventType: "VALIDATION_COMPLETED",
      metadata: compactJson({
        blockerCount: snapshot.blockerCount,
        warningCount: snapshot.warningCount,
        infoCount: snapshot.infoCount,
        sourceSnapshotHash: snapshot.sourceSnapshotHash,
      }),
    });

    await createStatusTransitionEvent(tx, {
      filingRunId: current.id,
      orgId: input.orgId,
      actorId: input.actorId,
      fromStatus: current.status,
      toStatus: nextStatus,
      note: snapshot.blockerCount > 0 ? "Validation found blockers." : "Validation ready for submission.",
    });

    return updated;
  });

  await logAudit({
    orgId: input.orgId,
    actorId: input.actorId,
    action: "gst.filing.validated",
    entityType: "GstFilingRun",
    entityId: current.id,
    metadata: {
      blockerCount: snapshot.blockerCount,
      warningCount: snapshot.warningCount,
      sourceSnapshotHash: snapshot.sourceSnapshotHash,
    },
  });

  return run;
}

export async function buildGstFilingExportPackage(input: {
  orgId: string;
  runId: string;
}) {
  const run = await db.gstFilingRun.findFirst({
    where: { id: input.runId, orgId: input.orgId },
  });

  if (!run) {
    throw new Error("GST filing run not found.");
  }

  const report = await generateGSTR1(run.orgId, run.periodMonth);

  return {
    filingRunId: run.id,
    periodMonth: run.periodMonth,
    returnType: run.returnType,
    status: run.status,
    generatedAt: new Date().toISOString(),
    validatedSnapshotHash: run.validatedSnapshotHash,
    report,
    summary: run.summary,
  };
}

export async function recordGstFilingPackageExport(input: {
  orgId: string;
  actorId: string;
  runId: string;
}) {
  const run = await db.gstFilingRun.findFirst({
    where: { id: input.runId, orgId: input.orgId },
    select: {
      id: true,
      periodMonth: true,
      returnType: true,
      validatedSnapshotHash: true,
      status: true,
    },
  });

  if (!run) {
    throw new Error("GST filing run not found.");
  }

  const snapshot = PRE_SUBMISSION_STATUSES.includes(run.status)
    ? await buildValidationSnapshot(input.orgId, run.periodMonth)
    : null;

  await db.$transaction(async (tx) => {
    await createEvent(tx, {
      filingRunId: run.id,
      orgId: input.orgId,
      actorId: input.actorId,
      eventType: "PACKAGE_EXPORTED",
      metadata: compactJson({
        periodMonth: run.periodMonth,
        returnType: run.returnType,
        validationStale:
          snapshot !== null &&
          (!run.validatedSnapshotHash ||
            run.validatedSnapshotHash !== snapshot.sourceSnapshotHash),
      }),
    });
  });

  await logAudit({
    orgId: input.orgId,
    actorId: input.actorId,
    action: "gst.filing.exported",
    entityType: "GstFilingRun",
    entityId: run.id,
    metadata: {
      periodMonth: run.periodMonth,
      returnType: run.returnType,
    },
  });
}

export async function recordGstFilingSubmissionIntent(input: {
  orgId: string;
  actorId: string;
  runId: string;
  note?: string;
}) {
  const run = await getRunForMutation(input.orgId, input.runId);
  if (!["READY", "FAILED"].includes(run.status)) {
    throw new Error("Only ready or failed runs can be queued for submission.");
  }

  const activeSubmission = run.submissions.find((submission) =>
    SUBMISSION_ACTIVE_STATUSES.includes(submission.status),
  );
  if (activeSubmission) {
    throw new Error("An active submission attempt already exists for this filing run.");
  }

  const snapshot = await ensureCurrentValidation(run);
  const nextAttempt = (run.submissions[0]?.attempt ?? 0) + 1;
  const requestHash = hashSnapshot({
    validatedSnapshotHash: run.validatedSnapshotHash,
    returnType: run.returnType,
    provider: env.GST_FILING_PROVIDER,
    attempt: nextAttempt,
  });

  const submission = await db.$transaction(async (tx) => {
    const created = await tx.gstFilingSubmission.create({
      data: {
        filingRunId: run.id,
        orgId: input.orgId,
        status: "INTENT_RECORDED",
        provider: "MANUAL",
        attempt: nextAttempt,
        requestHash,
        responsePayload: compactJson({
          sourceSnapshotHash: snapshot.sourceSnapshotHash,
          note: input.note?.trim() || undefined,
        }),
        initiatedByUserId: input.actorId,
      },
    });

    await tx.gstFilingRun.update({
      where: { id: run.id },
      data: {
        status: "SUBMISSION_PENDING",
        updatedByUserId: input.actorId,
      },
    });

    await createEvent(tx, {
      filingRunId: run.id,
      orgId: input.orgId,
      actorId: input.actorId,
      eventType: "SUBMISSION_INTENT_RECORDED",
      note: input.note?.trim() || undefined,
      metadata: compactJson({
        attempt: nextAttempt,
        provider: env.GST_FILING_PROVIDER,
        requestHash,
      }),
    });

    await createStatusTransitionEvent(tx, {
      filingRunId: run.id,
      orgId: input.orgId,
      actorId: input.actorId,
      fromStatus: run.status,
      toStatus: "SUBMISSION_PENDING",
      note: "Submission intent recorded.",
      metadata: compactJson({
        attempt: nextAttempt,
      }),
    });

    return created;
  });

  await logAudit({
    orgId: input.orgId,
    actorId: input.actorId,
    action: "gst.filing.submission_intent",
    entityType: "GstFilingRun",
    entityId: run.id,
    metadata: {
      attempt: nextAttempt,
      provider: env.GST_FILING_PROVIDER,
      requestHash,
    },
  });

  return submission;
}

export async function recordGstFilingSubmissionResult(input: {
  orgId: string;
  actorId: string;
  runId: string;
  outcome: "submitted" | "failed";
  externalReference?: string;
  acknowledgementNumber?: string;
  note?: string;
  errorMessage?: string;
}) {
  const run = await getRunForMutation(input.orgId, input.runId);
  const currentSubmission = run.submissions.find((submission) =>
    SUBMISSION_ACTIVE_STATUSES.includes(submission.status),
  );

  if (!currentSubmission) {
    throw new Error("No active submission attempt exists for this filing run.");
  }

  if (run.status !== "SUBMISSION_PENDING" && run.status !== "RECONCILING") {
    throw new Error("This filing run is not awaiting a submission outcome.");
  }

  const nextRunStatus: GstFilingRunStatus =
    input.outcome === "submitted" ? "RECONCILING" : "FAILED";
  const nextSubmissionStatus: GstFilingSubmissionStatus =
    input.outcome === "submitted"
      ? input.acknowledgementNumber
        ? "ACKNOWLEDGED"
        : "SUBMITTED"
      : "FAILED";

  const result = await db.$transaction(async (tx) => {
    const updatedSubmission = await tx.gstFilingSubmission.update({
      where: { id: currentSubmission.id },
      data: {
        status: nextSubmissionStatus,
        externalReference: input.externalReference?.trim() || null,
        acknowledgementNumber: input.acknowledgementNumber?.trim() || null,
        errorMessage: input.outcome === "failed" ? input.errorMessage?.trim() || "Submission failed." : null,
        responsePayload: compactJson({
          note: input.note?.trim() || undefined,
          outcome: input.outcome,
        }),
        completedByUserId: input.actorId,
        completedAt: new Date(),
      },
    });

    await tx.gstFilingRun.update({
      where: { id: run.id },
      data: {
        status: nextRunStatus,
        updatedByUserId: input.actorId,
        submittedByUserId: input.outcome === "submitted" ? input.actorId : run.submittedByUserId,
        submittedAt: input.outcome === "submitted" ? new Date() : run.submittedAt,
        filedAt:
          input.outcome === "submitted" && input.acknowledgementNumber
            ? new Date()
            : run.filedAt,
      },
    });

    if (input.outcome === "submitted") {
      await tx.gstFilingReconciliation.create({
        data: {
          filingRunId: run.id,
          orgId: input.orgId,
          status: "PENDING",
          note: input.note?.trim() || null,
        },
      });
    }

    await createEvent(tx, {
      filingRunId: run.id,
      orgId: input.orgId,
      actorId: input.actorId,
      eventType:
        input.outcome === "submitted" ? "SUBMISSION_RECORDED" : "SUBMISSION_FAILED",
      note:
        input.outcome === "submitted"
          ? input.note?.trim() || undefined
          : input.errorMessage?.trim() || input.note?.trim() || "Submission failed.",
      metadata: compactJson({
        attempt: currentSubmission.attempt,
        status: nextSubmissionStatus,
        externalReference: input.externalReference?.trim() || undefined,
        acknowledgementNumber: input.acknowledgementNumber?.trim() || undefined,
      }),
    });

    await createStatusTransitionEvent(tx, {
      filingRunId: run.id,
      orgId: input.orgId,
      actorId: input.actorId,
      fromStatus: run.status,
      toStatus: nextRunStatus,
      note:
        input.outcome === "submitted"
          ? "Submission result recorded."
          : "Submission failure recorded.",
      metadata: compactJson({
        attempt: currentSubmission.attempt,
      }),
    });

    return updatedSubmission;
  });

  await logAudit({
    orgId: input.orgId,
    actorId: input.actorId,
    action: "gst.filing.submission_result",
    entityType: "GstFilingRun",
    entityId: run.id,
    metadata: {
      attempt: currentSubmission.attempt,
      outcome: input.outcome,
      status: nextSubmissionStatus,
      externalReference: input.externalReference?.trim() || null,
      acknowledgementNumber: input.acknowledgementNumber?.trim() || null,
    },
  });

  return result;
}

export async function recordGstFilingReconciliation(input: {
  orgId: string;
  actorId: string;
  runId: string;
  status: GstFilingReconciliationStatus;
  matchedCount: number;
  varianceCount: number;
  note?: string;
}) {
  if (input.matchedCount < 0 || input.varianceCount < 0) {
    throw new Error("Matched and variance counts must be zero or greater.");
  }

  const run = await getRunForMutation(input.orgId, input.runId);
  if (!["RECONCILING", "RECONCILED"].includes(run.status)) {
    throw new Error("Only reconciling runs can record a reconciliation result.");
  }

  const nextRunStatus: GstFilingRunStatus =
    input.status === "MATCHED" ? "RECONCILED" : "RECONCILING";

  const reconciliation = await db.$transaction(async (tx) => {
    const created = await tx.gstFilingReconciliation.create({
      data: {
        filingRunId: run.id,
        orgId: input.orgId,
        status: input.status,
        matchedCount: input.matchedCount,
        varianceCount: input.varianceCount,
        delta:
          input.varianceCount > 0
            ? compactJson({
                varianceCount: input.varianceCount,
              })
            : Prisma.JsonNull,
        note: input.note?.trim() || null,
        resolvedByUserId: input.actorId,
        resolvedAt: new Date(),
      },
    });

    await tx.gstFilingRun.update({
      where: { id: run.id },
      data: {
        status: nextRunStatus,
        updatedByUserId: input.actorId,
        reconciledAt: input.status === "MATCHED" ? new Date() : run.reconciledAt,
      },
    });

    await createEvent(tx, {
      filingRunId: run.id,
      orgId: input.orgId,
      actorId: input.actorId,
      eventType: "RECONCILIATION_RECORDED",
      note: input.note?.trim() || undefined,
      metadata: compactJson({
        status: input.status,
        matchedCount: input.matchedCount,
        varianceCount: input.varianceCount,
      }),
    });

    await createStatusTransitionEvent(tx, {
      filingRunId: run.id,
      orgId: input.orgId,
      actorId: input.actorId,
      fromStatus: run.status,
      toStatus: nextRunStatus,
      note:
        input.status === "MATCHED"
          ? "Reconciliation completed."
          : "Reconciliation requires operator follow-up.",
    });

    return created;
  });

  await logAudit({
    orgId: input.orgId,
    actorId: input.actorId,
    action: "gst.filing.reconciled",
    entityType: "GstFilingRun",
    entityId: run.id,
    metadata: {
      status: input.status,
      matchedCount: input.matchedCount,
      varianceCount: input.varianceCount,
    },
  });

  return reconciliation;
}

export async function summarizePendingGstFilingQueue() {
  const pendingRuns = await db.gstFilingRun.findMany({
    where: {
      status: { in: ["SUBMISSION_PENDING", "RECONCILING"] },
    },
    select: {
      id: true,
      orgId: true,
      periodMonth: true,
      status: true,
      updatedAt: true,
      submissions: {
        orderBy: { attempt: "desc" },
        take: 1,
        select: {
          id: true,
          attempt: true,
          status: true,
          initiatedAt: true,
          externalReference: true,
          acknowledgementNumber: true,
        },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const now = Date.now();
  const aged = pendingRuns.map((run) => ({
    id: run.id,
    orgId: run.orgId,
    periodMonth: run.periodMonth,
    status: run.status,
    hoursPending: Math.floor((now - run.updatedAt.getTime()) / (1000 * 60 * 60)),
    latestSubmission: run.submissions[0] ?? null,
  }));

  return {
    totalPending: pendingRuns.length,
    submissionPending: aged.filter((run) => run.status === "SUBMISSION_PENDING").length,
    reconciling: aged.filter((run) => run.status === "RECONCILING").length,
    agedRuns: aged.filter((run) => run.hoursPending >= 24),
    runs: aged,
  };
}
