"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { nextDocumentNumberTx } from "@/lib/docs";
import { getSchemaDriftActionMessage, isSchemaDriftError } from "@/lib/prisma-errors";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { postVoucherTx } from "@/lib/accounting";
import { emitVoucherEvent } from "@/lib/document-events";
import { syncVoucherToIndex } from "@/lib/docs-vault";
import { setVoucherTags } from "@/lib/tags/assignment-service";
import { checkUsageLimit } from "@/lib/usage-metering";
import { consumeSequenceNumber } from "@/features/sequences/services/sequence-engine";
import { getSequenceConfig } from "@/features/sequences/services/sequence-admin";
import type { ConsumeResult } from "@/features/sequences/types";
import { fromMinorUnits, normalizeMoney, sumMinorUnits } from "@/lib/money";

export type ActionResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string };

export interface VoucherLineInput {
  description: string;
  date?: string;
  time?: string;
  amount: number;
  category?: string;
}

export interface VoucherInput {
  vendorId?: string;
  voucherDate: string;
  type: "payment" | "receipt";
  isMultiLine?: boolean;
  status?: "draft" | "approved";
  formData: Record<string, unknown>;
  lines: VoucherLineInput[];
  /** Phase 29: Tag IDs to assign to this voucher */
  tagIds?: string[];
}

function normalizeVoucherLines(
  lines: VoucherLineInput[],
  { allowPartial = false }: { allowPartial?: boolean } = {}
): { lines: VoucherLineInput[]; totalAmount: number } {
  const normalizedLines = lines.map((line) => {
    const description = line.description.trim();
    const amount = normalizeMoney(line.amount);

    return {
      ...line,
      description,
      amount,
      category: line.category?.trim() || undefined,
      date: line.date || undefined,
      time: line.time || undefined,
    };
  });

  if (allowPartial) {
    const draftLines = normalizedLines.filter(
      (line) => line.description.length > 0 && line.amount > 0
    );

    return {
      lines: draftLines,
      totalAmount: fromMinorUnits(sumMinorUnits(draftLines.map((line) => line.amount))),
    };
  }

  if (normalizedLines.length === 0) {
    throw new Error("Vouchers need at least one line item.");
  }

  for (const line of normalizedLines) {
    if (!line.description) {
      throw new Error("Voucher line descriptions are required.");
    }

    if (line.amount <= 0) {
      throw new Error("Voucher line amounts must be greater than zero.");
    }
  }

  return {
    lines: normalizedLines,
    totalAmount: fromMinorUnits(sumMinorUnits(normalizedLines.map((line) => line.amount))),
  };
}

async function syncVoucherRecordToIndex(orgId: string, voucherId: string): Promise<void> {
  const voucher = await db.voucher.findFirst({
    where: { id: voucherId, organizationId: orgId },
    include: { vendor: true },
  });

  if (!voucher) {
    return;
  }

  await syncVoucherToIndex(orgId, {
    id: voucher.id,
    voucherNumber: voucher.voucherNumber,
    status: voucher.status,
    voucherDate: voucher.voucherDate,
    totalAmount: voucher.totalAmount,
    type: voucher.type,
    archivedAt: voucher.archivedAt,
    vendor: voucher.vendor ?? undefined,
  });
}

/**
 * Assign the next official voucher number via the sequence engine.
 * Falls back to legacy OrgDefaults numbering if no active sequence
 * exists for the org (e.g. migration not yet run).
 *
 * Phase 7/Sprint 7.1: idempotencyKey (voucherId) prevents double
 * consumption on retry of the same voucher.
 */
async function assignNextVoucherNumber(
  orgId: string,
  voucherDate: string,
  tx: Prisma.TransactionClient,
): Promise<{
  voucherNumber: string;
  sequenceId: string | null;
  sequencePeriodId: string | null;
  sequenceNumber: number | null;
}> {
  const sequenceConfig = await getSequenceConfig({
    orgId,
    documentType: "VOUCHER",
  });

  if (sequenceConfig?.sequenceId) {
    const docDate = new Date(`${voucherDate}T00:00:00`);
    const result: ConsumeResult = await consumeSequenceNumber({
      sequenceId: sequenceConfig.sequenceId,
      documentDate: docDate,
      orgId,
      tx,
    });
    return {
      voucherNumber: result.formattedNumber,
      sequenceId: sequenceConfig.sequenceId,
      sequencePeriodId: result.periodId,
      sequenceNumber: result.sequenceNumber,
    };
  }

  const legacyNumber = await nextDocumentNumberTx(tx, orgId, "voucher");
  return {
    voucherNumber: legacyNumber,
    sequenceId: null,
    sequencePeriodId: null,
    sequenceNumber: null,
  };
}

export async function saveVoucher(
  input: VoucherInput,
  status: "draft" | "approved" = "draft"
): Promise<ActionResult<{ id: string; voucherNumber: string | null }>> {
  try {
    const { orgId, userId } = await requireOrgContext();

    const limitCheck = await checkUsageLimit(orgId, "VOUCHER");
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Voucher limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to create more vouchers.`,
      };
    }
    
    // Phase 5 / Sprint 5.2: assign the official number at approval
    // time via the sequence engine (or legacy fallback).  Sprint 5.1
    // made drafts nullable; Sprint 5.2 connects approval to the engine.
    let voucherNumber: string | null = null;
    let issueSequenceId: string | null = null;
    let issuePeriodId: string | null = null;
    let issueSequenceNumber: number | null = null;

    const normalizedVoucher = normalizeVoucherLines(input.lines, {
      allowPartial: status === "draft",
    });
    
    const voucher = await db.$transaction(async (tx) => {
      if (status === "approved") {
        const assigned = await assignNextVoucherNumber(orgId, input.voucherDate, tx);
        voucherNumber = assigned.voucherNumber;
        issueSequenceId = assigned.sequenceId;
        issuePeriodId = assigned.sequencePeriodId;
        issueSequenceNumber = assigned.sequenceNumber;
      }

      const created = await tx.voucher.create({
        data: {
          organizationId: orgId,
          vendorId: input.vendorId || null,
          voucherNumber,
          voucherDate: input.voucherDate,
          type: input.type,
          status,
          isMultiLine: input.isMultiLine ?? false,
          formData: input.formData as Prisma.InputJsonValue,
          totalAmount: normalizedVoucher.totalAmount,
          sequenceId: issueSequenceId,
          sequencePeriodId: issuePeriodId,
          sequenceNumber: issueSequenceNumber,
          ...(normalizedVoucher.lines.length > 0
            ? {
                lines: {
                  create: normalizedVoucher.lines.map((line, index) => ({
                    description: line.description,
                    date: line.date || null,
                    time: line.time || null,
                    amount: line.amount,
                    category: line.category || null,
                    sortOrder: index,
                  })),
                },
              }
            : {}),
        },
      });

      if (status === "approved") {
        await postVoucherTx(tx, {
          orgId,
          voucherId: created.id,
          actorId: userId,
        });
      }

      return created;
    });
    
    // Phase 19.2: emit normalized document event
    await emitVoucherEvent(orgId, voucher.id, status === "approved" ? "approved" : "created", {
      actorId: userId,
      metadata: { voucherNumber },
    });

    // Sprint 25.1: fire voucher.created workflow trigger
    const { fireWorkflowTrigger } = await import("@/lib/flow/workflow-engine");
    void fireWorkflowTrigger({
      triggerType: "voucher.created",
      orgId,
      sourceModule: "vouchers",
      sourceEntityType: "Voucher",
      sourceEntityId: voucher.id,
      actorId: userId,
      payload: { voucherNumber, status, totalAmount: voucher.totalAmount, type: voucher.type },
    });

    // Phase 19.1: Sync to DocumentIndex
    await syncVoucherRecordToIndex(orgId, voucher.id);

    if (input.tagIds !== undefined) {
      await setVoucherTags(voucher.id, input.tagIds);
    }

    revalidatePath("/app/docs/vouchers");
    return { success: true, data: { id: voucher.id, voucherNumber } };
  } catch (error) {
    if (isSchemaDriftError(error, "Voucher")) {
      console.warn(
        "saveVoucher failed because the local database schema is behind the Prisma schema.",
      );
      return {
        success: false,
        error: getSchemaDriftActionMessage("save the voucher"),
      };
    }
    console.error("saveVoucher error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to save voucher" };
  }
}

export async function updateVoucher(
  id: string,
  input: Partial<VoucherInput>
): Promise<ActionResult<{ id: string; voucherNumber?: string }>> {
  try {
    const { orgId, userId } = await requireOrgContext();
    
    const existing = await db.voucher.findFirst({
      where: { id, organizationId: orgId },
      select: {
        id: true,
        status: true,
        voucherNumber: true,
        accountingStatus: true,
        totalAmount: true,
      },
    });
    
    if (!existing) {
      return { success: false, error: "Voucher not found" };
    }

    if (existing.accountingStatus === "POSTED") {
      return { success: false, error: "Posted vouchers cannot be edited. Reverse and recreate instead." };
    }
    
    const normalizedVoucher = input.lines
      ? normalizeVoucherLines(input.lines, {
          allowPartial: (input.status ?? existing.status) === "draft",
        })
      : null;

    let assignedVoucherNumber: string | undefined;

    await db.$transaction(async (tx) => {
      await tx.voucher.update({
        where: { id },
        data: {
          vendorId: input.vendorId,
          voucherDate: input.voucherDate,
          type: input.type,
          isMultiLine: input.isMultiLine,
          ...(input.status && { status: input.status }),
          formData: input.formData as Prisma.InputJsonValue | undefined,
          totalAmount: normalizedVoucher?.totalAmount ?? existing.totalAmount,
        },
      });

      if (normalizedVoucher) {
        await tx.voucherLine.deleteMany({ where: { voucherId: id } });
        if (normalizedVoucher.lines.length > 0) {
          await tx.voucherLine.createMany({
            data: normalizedVoucher.lines.map((line, index) => ({
              voucherId: id,
              description: line.description,
              date: line.date || null,
              time: line.time || null,
              amount: line.amount,
              category: line.category || null,
              sortOrder: index,
            })),
          });
        }
      }

      const nextStatus = input.status ?? existing.status;
      if (nextStatus === "approved") {
        // Phase 5 / Sprint 5.2: assign the official number at approval
        // time via the sequence engine (or legacy fallback).
        // Phase 7/Sprint 7.1: re-read voucherNumber inside transaction
        // to prevent TOCTOU double-numbering under concurrent calls.
        const current = await tx.voucher.findUnique({
          where: { id },
          select: { voucherNumber: true },
        });

        if (!current?.voucherNumber) {
          const assigned = await assignNextVoucherNumber(
            orgId,
            input.voucherDate ?? new Date().toISOString().split("T")[0],
            tx,
          );
          assignedVoucherNumber = assigned.voucherNumber;
          await tx.voucher.update({
            where: { id },
            data: {
              voucherNumber: assigned.voucherNumber,
              sequenceId: assigned.sequenceId,
              sequencePeriodId: assigned.sequencePeriodId,
              sequenceNumber: assigned.sequenceNumber,
            },
          });
        }
        await postVoucherTx(tx, {
          orgId,
          voucherId: id,
          actorId: userId,
        });
      }
    });
    
    // Phase 19.2: emit normalized document event
    await emitVoucherEvent(orgId, id, "updated", { actorId: userId });
    await syncVoucherRecordToIndex(orgId, id);

    if (input.tagIds !== undefined) {
      await setVoucherTags(id, input.tagIds);
    }

    revalidatePath("/app/docs/vouchers");
    revalidatePath(`/app/docs/vouchers/${id}`);
    // Include the assigned voucherNumber when one was generated during
    // approval, so the workspace can update live form/export state.
    return { success: true, data: { id, voucherNumber: assignedVoucherNumber } };
  } catch (error) {
    if (isSchemaDriftError(error, "Voucher")) {
      console.warn(
        "updateVoucher failed because the local database schema is behind the Prisma schema.",
      );
      return {
        success: false,
        error: getSchemaDriftActionMessage("update the voucher"),
      };
    }
    console.error("updateVoucher error:", error);
    return { success: false, error: error instanceof Error ? error.message : "Failed to update voucher" };
  }
}

export async function archiveVoucher(id: string): Promise<ActionResult<void>> {
  try {
    const { orgId, userId } = await requireOrgContext();
    
    await db.voucher.update({
      where: { id, organizationId: orgId },
      data: { archivedAt: new Date() },
    });

    // Phase 19.2: emit normalized document event
    await emitVoucherEvent(orgId, id, "archived", { actorId: userId });
    await syncVoucherRecordToIndex(orgId, id);

    revalidatePath("/app/docs/vouchers");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("archiveVoucher error:", error);
    return { success: false, error: "Failed to archive voucher" };
  }
}

export async function duplicateVoucher(id: string): Promise<ActionResult<{ id: string; voucherNumber: string | null }>> {
  try {
    const { orgId } = await requireOrgContext();

    const limitCheck = await checkUsageLimit(orgId, "VOUCHER");
    if (!limitCheck.allowed) {
      return {
        success: false,
        error: `Voucher limit reached (${limitCheck.current}/${limitCheck.limit}). Upgrade your plan to create more vouchers.`,
      };
    }
    
    const existing = await db.voucher.findFirst({
      where: { id, organizationId: orgId },
      include: { lines: true },
    });
    
    if (!existing) {
      return { success: false, error: "Voucher not found" };
    }
    
    // Phase 5: duplicates start as drafts — no official number consumed yet.
    const duplicate = await db.voucher.create({
      data: {
        organizationId: orgId,
        vendorId: existing.vendorId,
        voucherNumber: null,
        voucherDate: new Date().toISOString().split("T")[0],
        type: existing.type,
        status: "draft",
        isMultiLine: existing.isMultiLine,
        formData: existing.formData as Prisma.InputJsonValue,
        totalAmount: existing.totalAmount,
        lines: {
          create: existing.lines.map((line) => ({
            description: line.description,
            date: line.date,
            time: line.time,
            amount: line.amount,
            category: line.category,
            sortOrder: line.sortOrder,
          })),
        },
      },
    });
    
    // Phase 19.2: emit normalized document events
    void emitVoucherEvent(orgId, duplicate.id, "created", {
      metadata: { duplicatedFrom: id, voucherNumber: null },
    });
    void emitVoucherEvent(orgId, id, "duplicated", {
      metadata: { newVoucherId: duplicate.id, newVoucherNumber: null },
    });

    // Phase 19.1: Sync duplicate to DocumentIndex
    await syncVoucherRecordToIndex(orgId, duplicate.id);

    revalidatePath("/app/docs/vouchers");
    return { success: true, data: { id: duplicate.id, voucherNumber: null } };
  } catch (error) {
    console.error("duplicateVoucher error:", error);
    return { success: false, error: "Failed to duplicate voucher" };
  }
}

export async function getVoucher(id: string) {
  const { orgId } = await requireOrgContext();
  
  return db.voucher.findFirst({
    where: { id, organizationId: orgId, archivedAt: null },
    include: {
      lines: { orderBy: { sortOrder: "asc" } },
      vendor: true,
    },
  });
}

export async function listVouchers(params?: {
  type?: "payment" | "receipt";
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
  sequenceId?: string;
  amountMin?: number;
  amountMax?: number;
  vendorId?: string;
}) {
  const { orgId } = await requireOrgContext();
  const page = params?.page ?? 1;
  const limit = params?.limit ?? 20;
  const skip = (page - 1) * limit;

  const safeSearch = params?.search && params.search !== "undefined" ? params.search : undefined;
  const safeType = params?.type;
  const safeStatus = params?.status && params.status !== "undefined" ? params.status : undefined;
  const safeSequenceId = params?.sequenceId && params.sequenceId !== "undefined" ? params.sequenceId : undefined;
  const safeVendorId = params?.vendorId && params.vendorId !== "undefined" ? params.vendorId : undefined;

  const dateFrom = params?.dateFrom && params.dateFrom !== "undefined" ? new Date(`${params.dateFrom}T00:00:00`) : undefined;
  const dateTo = params?.dateTo && params.dateTo !== "undefined" ? new Date(`${params.dateTo}T23:59:59`) : undefined;

  const where: Record<string, unknown> = {
    organizationId: orgId,
    archivedAt: null,
    ...(safeType && { type: safeType }),
    ...(safeStatus && { status: safeStatus }),
    ...(safeSequenceId && { sequenceId: safeSequenceId }),
    ...(params?.amountMin !== undefined && !isNaN(params.amountMin) && { totalAmount: { gte: params.amountMin } }),
    ...(params?.amountMax !== undefined && !isNaN(params.amountMax) && { totalAmount: { lte: params.amountMax } }),
    ...(safeVendorId && { vendorId: safeVendorId }),
    ...(safeSearch && {
      OR: [
        { voucherNumber: { contains: safeSearch, mode: "insensitive" as const } },
        { vendor: { name: { contains: safeSearch, mode: "insensitive" as const } } },
      ],
    }),
  };

  if (dateFrom && dateTo) {
    where.voucherDate = { gte: dateFrom, lte: dateTo };
  } else if (dateFrom) {
    where.voucherDate = { gte: dateFrom };
  } else if (dateTo) {
    where.voucherDate = { lte: dateTo };
  }
  
  const [vouchers, total] = await Promise.all([
    db.voucher.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { vendor: true },
    }),
    db.voucher.count({ where }),
  ]);
  
  return {
    vouchers,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
