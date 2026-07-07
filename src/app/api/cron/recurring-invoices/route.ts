import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateCronSecret, calculateNextRunAt } from "@/lib/cron";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  // Validate authorization
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();

    // Fetch all active rules that are due to run
    const rulesToRun = await db.recurringInvoiceRule.findMany({
      where: {
        status: "ACTIVE",
        nextRunAt: { lte: now },
      },
      include: {
        baseInvoice: true,
      },
      take: 50, // Batch limit to avoid timeouts
    });

    if (rulesToRun.length === 0) {
      return NextResponse.json({ message: "No recurring rules due to run." });
    }

    const results = [];

    // Process each rule
    for (const rule of rulesToRun) {
      if (!rule.baseInvoice) continue;

      try {
        // Clone the base invoice
        const clonedInvoiceData = { ...rule.baseInvoice };
        // Clean up fields that should not be duplicated verbatim
        delete (clonedInvoiceData as any).id;
        delete (clonedInvoiceData as any).invoiceNumber; // We want to generate a new one, or leave null for draft
        delete (clonedInvoiceData as any).createdAt;
        delete (clonedInvoiceData as any).updatedAt;
        delete (clonedInvoiceData as any).paidAt;
        delete (clonedInvoiceData as any).issuedAt;
        delete (clonedInvoiceData as any).overdueAt;
        delete (clonedInvoiceData as any).lastPaymentAt;
        delete (clonedInvoiceData as any).amountPaid;
        delete (clonedInvoiceData as any).remainingAmount;
        delete (clonedInvoiceData as any).postedJournalEntryId;
        delete (clonedInvoiceData as any).accountingPostedAt;

        // Set new dates
        const newInvoiceDate = new Date(rule.nextRunAt);
        let newDueDate: Date | undefined;
        if (rule.baseInvoice.dueDate && rule.baseInvoice.invoiceDate) {
          // Calculate same offset for due date
          const offset = rule.baseInvoice.dueDate.getTime() - rule.baseInvoice.invoiceDate.getTime();
          newDueDate = new Date(newInvoiceDate.getTime() + offset);
        }

        // We generate a new unique ID manually so we can link it
        const newInvoiceId = uuidv4();

        // 1. Create the new invoice
        await db.invoice.create({
          data: {
            ...clonedInvoiceData,
            id: newInvoiceId,
            status: "DRAFT", // Automatically create as draft first
            invoiceDate: newInvoiceDate,
            dueDate: newDueDate,
            remainingAmount: clonedInvoiceData.totalAmount || 0,
            originalId: rule.baseInvoice.id,
            // Link to the recurring rule
            generatedFrom: {
              connect: { id: rule.id }
            }
          },
        });

        // 2. Calculate next run date
        const nextRun = calculateNextRunAt(rule.nextRunAt, rule.frequency);
        let newStatus = rule.status;
        
        if (rule.endDate && nextRun > rule.endDate) {
          newStatus = "COMPLETED";
        }

        // 3. Update the recurring rule
        await db.recurringInvoiceRule.update({
          where: { id: rule.id },
          data: {
            nextRunAt: nextRun,
            lastRunAt: now,
            runsCount: { increment: 1 },
            status: newStatus,
          },
        });

        // Phase 2: If autoSend is true, trigger the dispatch logic here
        // if (rule.autoSend) { ... trigger email ... }

        results.push({ ruleId: rule.id, success: true, generatedInvoiceId: newInvoiceId });
      } catch (err: any) {
        console.error(`Error processing recurring rule ${rule.id}:`, err);
        results.push({ ruleId: rule.id, success: false, error: err.message });
      }
    }

    return NextResponse.json({
      message: `Processed ${rulesToRun.length} recurring rules.`,
      results,
    });
  } catch (error: any) {
    console.error("Cron recurring invoices error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 }
    );
  }
}
