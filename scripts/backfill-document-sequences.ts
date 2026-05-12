/**
 * Sprint 1.3 — Document Sequence Backfill
 *
 * Links existing finalized invoices and vouchers to their sequences
 * without consuming future sequence counters.
 *
 * Rules:
 *   - Non-draft invoices → linked to historical sequence metadata
 *   - Non-draft vouchers → linked to historical sequence metadata
 *   - DRAFT invoices / draft vouchers → left untouched (sequenceId IS NULL)
 *   - Processes oldest → newest to preserve chronological ordering
 *   - Batched cursor pagination to avoid memory pressure
 *   - Idempotent: re-running skips already-linked documents
 *
 * Usage:
 *   npx tsx scripts/backfill-document-sequences.ts
 */

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  parseHistoricalSequenceNumber,
} from "@/features/sequences/migrations/legacy-mapper";
import { calculatePeriodBoundaries } from "@/features/sequences/engine/periodicity";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

const PAGE_SIZE = 100;

interface BackfillResult {
  invoicesProcessed: number;
  vouchersProcessed: number;
  invoicesSkipped: number;
  vouchersSkipped: number;
  periodsTouched: number;
  errors: Array<{ docId: string; docType: string; error: string }>;
}

const INVOICE_HISTORICAL_STATUSES = [
  "ISSUED",
  "VIEWED",
  "DUE",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "DISPUTED",
  "CANCELLED",
  "REISSUED",
  "ARRANGEMENT_MADE",
] as const;

async function getSequenceContext(
  organizationId: string,
  documentType: "INVOICE" | "VOUCHER"
) {
  return db.sequence.findFirst({
    where: { organizationId, documentType },
    include: { formats: { where: { isDefault: true }, take: 1 } },
  });
}

async function findOrCreateHistoricalPeriod(
  sequenceId: string,
  periodicity: "NONE" | "MONTHLY" | "YEARLY" | "FINANCIAL_YEAR",
  documentDate: Date,
  sequenceNumber: number
) {
  const bounds = calculatePeriodBoundaries(documentDate, periodicity);

  const existing = await db.sequencePeriod.findUnique({
    where: {
      sequenceId_startDate_endDate: {
        sequenceId,
        startDate: bounds.startDate,
        endDate: bounds.endDate,
      },
    },
    select: { id: true, currentCounter: true },
  });

  if (existing) {
    if (existing.currentCounter < sequenceNumber) {
      await db.sequencePeriod.update({
        where: { id: existing.id },
        data: { currentCounter: sequenceNumber },
      });
    }
    return existing.id;
  }

  const created = await db.sequencePeriod.create({
    data: {
      sequenceId,
      startDate: bounds.startDate,
      endDate: bounds.endDate,
      currentCounter: sequenceNumber,
      status: "OPEN",
    },
    select: { id: true },
  });

  return created.id;
}

async function backfillInvoices(result: BackfillResult): Promise<void> {
  let cursor: string | undefined;

  for (;;) {
    const rows = await db.invoice.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { invoiceDate: "asc" },
      where: {
        status: { in: [...INVOICE_HISTORICAL_STATUSES] },
        sequenceId: null,
      },
      select: {
        id: true,
        organizationId: true,
        invoiceDate: true,
        invoiceNumber: true,
      },
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const inv of rows) {
      const sequence = await getSequenceContext(inv.organizationId, "INVOICE");

      if (!sequence || !sequence.formats[0]) {
        result.invoicesSkipped++;
        console.warn(
          `No invoice sequence found for org ${inv.organizationId}; skipping invoice ${inv.id}`
        );
        continue;
      }

      try {
        // Drafts created after Phase 4 may have null invoiceNumber — skip them.
        if (!inv.invoiceNumber) {
          result.invoicesSkipped++;
          continue;
        }

        const docDate = new Date(inv.invoiceDate);
        const prefix = sequence.formats[0].formatString.split("/")[0] ?? "";
        const parsed = parseHistoricalSequenceNumber(inv.invoiceNumber, prefix);
        if (!parsed) {
          throw new Error(
            `Invoice number ${inv.invoiceNumber} does not match expected prefix ${prefix}`
          );
        }
        const periodId = await findOrCreateHistoricalPeriod(
          sequence.id,
          sequence.periodicity,
          docDate,
          parsed.sequenceNumber
        );

        await db.invoice.update({
          where: { id: inv.id },
          data: {
            sequenceId: sequence.id,
            sequencePeriodId: periodId,
            sequenceNumber: parsed.sequenceNumber,
          },
        });

        result.invoicesProcessed++;
        result.periodsTouched++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ docId: inv.id, docType: "invoice", error: message });
        console.error(`Failed to backfill invoice ${inv.id}:`, message);
      }
    }

    if (rows.length < PAGE_SIZE) break;
  }
}

async function backfillVouchers(result: BackfillResult): Promise<void> {
  let cursor: string | undefined;

  for (;;) {
    const rows = await db.voucher.findMany({
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { voucherDate: "asc" },
      where: {
        status: { not: "draft" },
        sequenceId: null,
      },
      select: {
        id: true,
        organizationId: true,
        voucherDate: true,
        voucherNumber: true,
      },
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (const v of rows) {
      const sequence = await getSequenceContext(v.organizationId, "VOUCHER");

      if (!sequence || !sequence.formats[0]) {
        result.vouchersSkipped++;
        console.warn(
          `No voucher sequence found for org ${v.organizationId}; skipping voucher ${v.id}`
        );
        continue;
      }

      try {
        // Drafts created after Phase 4 may have null voucherNumber — skip them.
        if (!v.voucherNumber) {
          result.vouchersSkipped++;
          continue;
        }

        const docDate = new Date(v.voucherDate);
        const prefix = sequence.formats[0].formatString.split("/")[0] ?? "";
        const parsed = parseHistoricalSequenceNumber(v.voucherNumber, prefix);
        if (!parsed) {
          throw new Error(
            `Voucher number ${v.voucherNumber} does not match expected prefix ${prefix}`
          );
        }
        const periodId = await findOrCreateHistoricalPeriod(
          sequence.id,
          sequence.periodicity,
          docDate,
          parsed.sequenceNumber
        );

        await db.voucher.update({
          where: { id: v.id },
          data: {
            sequenceId: sequence.id,
            sequencePeriodId: periodId,
            sequenceNumber: parsed.sequenceNumber,
          },
        });

        result.vouchersProcessed++;
        result.periodsTouched++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors.push({ docId: v.id, docType: "voucher", error: message });
        console.error(`Failed to backfill voucher ${v.id}:`, message);
      }
    }

    if (rows.length < PAGE_SIZE) break;
  }
}

async function main() {
  console.log("Sprint 1.3 — Document Sequence Backfill starting…\n");

  const result: BackfillResult = {
    invoicesProcessed: 0,
    vouchersProcessed: 0,
    invoicesSkipped: 0,
    vouchersSkipped: 0,
    periodsTouched: 0,
    errors: [],
  };

  await backfillInvoices(result);
  await backfillVouchers(result);

  console.log("\n───────────────────────────────────────────────────────────────");
  console.log("Backfill complete:");
  console.log(`  Invoices processed: ${result.invoicesProcessed}`);
  console.log(`  Invoices skipped:   ${result.invoicesSkipped}`);
  console.log(`  Vouchers processed: ${result.vouchersProcessed}`);
  console.log(`  Vouchers skipped:   ${result.vouchersSkipped}`);
  console.log(`  Periods touched:    ${result.periodsTouched}`);
  console.log(`  Errors:             ${result.errors.length}`);
  console.log("───────────────────────────────────────────────────────────────\n");

  if (result.errors.length > 0) {
    console.error("Some documents failed to backfill. Review errors above.");
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
