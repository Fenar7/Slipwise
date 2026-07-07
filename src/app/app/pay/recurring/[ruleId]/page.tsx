import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/lib/auth";
import { RecurringRuleDetailClient } from "./client";

export const metadata: Metadata = { title: "Recurring Rule Details | Slipwise" };

export default async function RecurringRuleDetailPage({
  params,
}: {
  params: Promise<{ ruleId: string }>;
}) {
  const { ruleId } = await params;
  const { orgId } = await requireOrgContext();

  const rule = await db.recurringInvoiceRule.findFirst({
    where: { id: ruleId, orgId },
    include: {
      baseInvoice: {
        select: { id: true, invoiceNumber: true }
      },
      generatedInvoices: {
        orderBy: { createdAt: "desc" },
        select: { id: true, invoiceNumber: true, totalAmount: true, status: true, createdAt: true }
      }
    }
  });

  if (!rule) {
    notFound();
  }

  return <RecurringRuleDetailClient rule={rule} />;
}
