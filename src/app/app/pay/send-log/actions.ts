"use server";

import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export async function listSendLog(params?: { status?: string; page?: number; search?: string }) {
  const { orgId } = await requireOrgContext();
  const page = params?.page ?? 1;
  const limit = 20;
  const skip = (page - 1) * limit;

  const validStatuses = ["PENDING", "SENT", "FAILED"];
  const parsedStatus = validStatuses.includes(params?.status || "") ? params?.status : undefined;

  const where: Prisma.ScheduledSendWhereInput = {
    orgId,
    ...(parsedStatus ? { status: parsedStatus as any } : {}),
  };

  if (params?.search) {
    where.OR = [
      { recipientEmail: { contains: params.search, mode: "insensitive" } },
      { invoice: { invoiceNumber: { contains: params.search, mode: "insensitive" } } },
    ];
  }

  const [records, total] = await Promise.all([
    db.scheduledSend.findMany({
      where,
      include: { invoice: { select: { invoiceNumber: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    db.scheduledSend.count({ where }),
  ]);

  return {
    records,
    total,
    totalPages: Math.ceil(total / limit),
    page,
  };
}

export async function retrySend(
  sendId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const { orgId } = await requireOrgContext();

    const original = await db.scheduledSend.findFirst({
      where: { 
        id: sendId, 
        orgId,
        status: "FAILED" 
      },
    });

    if (!original) {
      return { success: false, error: "Send record not found" };
    }

    const newSend = await db.scheduledSend.create({
      data: {
        invoiceId: original.invoiceId,
        orgId: original.orgId,
        recipientEmail: original.recipientEmail,
        scheduledAt: new Date(),
      },
    });

    revalidatePath("/app/pay/send-log");
    return { success: true, data: { id: newSend.id } };
  } catch (error) {
    console.error("retrySend error:", error);
    return { success: false, error: "Failed to retry send" };
  }
}
