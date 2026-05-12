import { NextRequest } from "next/server";
import {
  exportReconciliationCsv,
  getAccountsPayableAging,
  getAccountsReceivableAging,
  getBalanceSheet,
  getCashFlowStatement,
  getGeneralLedger,
  getGstTieOut,
  getProfitAndLoss,
  getTdsTieOut,
  getTrialBalance,
  listJournalEntries,
} from "@/lib/accounting";
import { generateCSV } from "@/lib/csv";
import {
  BooksApiError,
  BooksApiErrorCode,
  booksApiCsvResponse,
  booksApiPdfResponse,
  formatCsvDate,
  formatCsvNumber,
  handleBooksApiError,
  parseOptionalBoolean,
  parseOptionalNumber,
  requireBooksApiRead,
} from "../../_utils";
import { Rowdies } from "next/font/google";

type BooksExportReportType =
  | "reconciliation"
  | "general_ledger"
  | "trial_balance"
  | "journal_register"
  | "profit_loss"
  | "balance_sheet"
  | "cash_flow"
  | "ar_aging"
  | "ap_aging"
  | "gst_tie_out"
  | "tds_tie_out";

type BooksExportFormat = "csv" | "pdf";

type BooksExportRequestBody = {
  reportType?: BooksExportReportType;
  format?: BooksExportFormat;
  filters?: {
    bankAccountId?: string;
    importId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    minAmount?: number | string;
    maxAmount?: number | string;
    accountId?: string;
    includeInactive?: boolean | string;
    source?: string;
    asOfDate?: string;
    compareAsOfDate?: string;
    compareStartDate?: string;
    compareEndDate?: string;
  };
};

type BooksExportOutput = {
  csv: string;
  filename: string;
  title: string;
};

function unwrapCsvCell(value: string): string {
  const normalized = value.trim();
  if (!normalized.startsWith("\"") || !normalized.endsWith("\"")) {
    return normalized;
  }
  return normalized.slice(1, -1).replaceAll("\"\"", "\"");
}

function csvLineToPdfText(line: string): string {
  return line.split(",").map(unwrapCsvCell).join(" | ");
}

function wrapPdfText(text: string, maxChars = 95): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [text];
}

async function buildPdfFromCsv(title: string, csv: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 40;
  const lineHeight = 14;
  const smallLineHeight = 12;
  const textColor = rgb(0.15, 0.23, 0.32);
  let page = pdf.addPage(pageSize);
  let y = page.getHeight() - margin;

  function ensureSpace(requiredLines = 1) {
    if (y - requiredLines * lineHeight < margin) {
      page = pdf.addPage(pageSize);
      y = page.getHeight() - margin;
    }
  }

  function drawLine(text: string, options?: { bold?: boolean; size?: number }) {
    ensureSpace();
    page.drawText(text, {
      x: margin,
      y,
      size: options?.size ?? 10,
      font: options?.bold ? boldFont : font,
      color: textColor,
    });
    y -= options?.size && options.size > 10 ? lineHeight + 2 : lineHeight;
  }

  drawLine(title, { bold: true, size: 16 });
  drawLine(`Generated ${new Date().toISOString()}`, { size: 9 });
  y -= 6;

  for (const [index, rawLine] of csv.split(/\r?\n/).entries()) {
    const text = csvLineToPdfText(rawLine);
    if (!text) {
      y -= smallLineHeight;
      continue;
    }

    const wrapped = wrapPdfText(text);
    ensureSpace(wrapped.length);
    for (const line of wrapped) {
      page.drawText(line, {
        x: margin,
        y,
        size: 9,
        font: index === 0 ? boldFont : font,
        color: textColor,
      });
      y -= smallLineHeight;
    }
  }

  return pdf.save();
}

function resolveFeature(reportType: BooksExportReportType) {
  switch (reportType) {
    case "reconciliation":
      return "bankReconciliation" as const;
    case "profit_loss":
    case "balance_sheet":
    case "cash_flow":
    case "ar_aging":
    case "ap_aging":
    case "gst_tie_out":
    case "tds_tie_out":
      return "financialStatements" as const;
    default:
      return "accountingCore" as const;
  }
}

async function buildExport(
  orgId: string,
  reportType: BooksExportReportType,
  filters: NonNullable<BooksExportRequestBody["filters"]>,
): Promise<BooksExportOutput> {
  if (reportType === "reconciliation") {
    const csv = await exportReconciliationCsv(orgId, {
      bankAccountId: filters.bankAccountId,
      importId: filters.importId,
      status: filters.status,
      startDate: filters.startDate,
      endDate: filters.endDate,
      minAmount: parseOptionalNumber(filters.minAmount, "minAmount"),
      maxAmount: parseOptionalNumber(filters.maxAmount, "maxAmount"),
    });

    return {
      csv,
      filename: "books_reconciliation.csv",
      title: "Bank Reconciliation",
    };
  }

  if (reportType === "general_ledger") {
    const ledger = await getGeneralLedger(orgId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      accountId: filters.accountId,
    });

    return {
      csv: generateCSV(
        [
          "Entry Date",
          "Entry Number",
          "Account Code",
          "Account Name",
          "Source",
          "Source Ref",
          "Memo",
          "Description",
          "Debit",
          "Credit",
          "Movement",
          "Running Balance",
        ],
        ledger.map((line) => [
          formatCsvDate(line.entryDate),
          line.entryNumber,
          line.accountCode,
          line.accountName,
          line.source,
          line.sourceRef ?? "",
          line.memo ?? "",
          line.description ?? "",
          formatCsvNumber(line.debit),
          formatCsvNumber(line.credit),
          formatCsvNumber(line.movement),
          formatCsvNumber(line.runningBalance),
        ]),
      ),
      filename: "books_general_ledger.csv",
      title: "General Ledger",
    };
  }

  if (reportType === "trial_balance") {
    const trialBalance = await getTrialBalance(orgId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      includeInactive:
        typeof filters.includeInactive === "boolean"
          ? filters.includeInactive
          : parseOptionalBoolean(filters.includeInactive, "includeInactive"),
    });

    return {
      csv: generateCSV(
        [
          "Code",
          "Account",
          "Type",
          "Normal Balance",
          "Total Debit",
          "Total Credit",
          "Debit Balance",
          "Credit Balance",
          "Net Balance",
        ],
        trialBalance.rows.map((row) => [
          row.code,
          row.name,
          row.accountType,
          row.normalBalance,
          formatCsvNumber(row.totalDebit),
          formatCsvNumber(row.totalCredit),
          formatCsvNumber(row.debitBalance),
          formatCsvNumber(row.creditBalance),
          formatCsvNumber(row.balance),
        ]),
      ),
      filename: "books_trial_balance.csv",
      title: "Trial Balance",
    };
  }

  if (reportType === "journal_register") {
    const journals = await listJournalEntries(orgId, {
      source: filters.source as never,
      startDate: filters.startDate,
      endDate: filters.endDate,
      accountId: filters.accountId,
    });

    return {
      csv: generateCSV(
        [
          "Entry Number",
          "Entry Date",
          "Source",
          "Source Ref",
          "Status",
          "Memo",
          "Period",
          "Total Debit",
          "Total Credit",
          "Line Count",
        ],
        journals.map((journal) => [
          journal.entryNumber,
          formatCsvDate(journal.entryDate),
          journal.source,
          journal.sourceRef ?? "",
          journal.status,
          journal.memo ?? "",
          journal.fiscalPeriod.label,
          formatCsvNumber(journal.totalDebit),
          formatCsvNumber(journal.totalCredit),
          String(journal.lines.length),
        ]),
      ),
      filename: "books_journal_register.csv",
      title: "Journal Register",
    };
  }

  if (reportType === "profit_loss") {
    const report = await getProfitAndLoss(orgId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
      compareStartDate: filters.compareStartDate,
      compareEndDate: filters.compareEndDate,
    });

    const rows = [
      ...report.current.income.map((row) => ["Current", "Income", row.code, row.name, formatCsvNumber(row.amount)]),
      ...report.current.expenses.map((row) => [
        "Current",
        "Expense",
        row.code,
        row.name,
        formatCsvNumber(row.amount),
      ]),
      ["Current", "Summary", "", "Net Profit", formatCsvNumber(report.current.totals.netProfit)],
      ...(report.comparison
        ? [
            ...report.comparison.income.map((row) => [
              "Comparison",
              "Income",
              row.code,
              row.name,
              formatCsvNumber(row.amount),
            ]),
            ...report.comparison.expenses.map((row) => [
              "Comparison",
              "Expense",
              row.code,
              row.name,
              formatCsvNumber(row.amount),
            ]),
            ["Comparison", "Summary", "", "Net Profit", formatCsvNumber(report.comparison.totals.netProfit)],
          ]
        : []),
    ];

    return {
      csv: generateCSV(["Period", "Section", "Code", "Account", "Amount"], rows),
      filename: "books_profit_loss.csv",
      title: "Profit and Loss",
    };
  }

  if (reportType === "balance_sheet") {
    const report = await getBalanceSheet(orgId, {
      asOfDate: filters.asOfDate,
      compareAsOfDate: filters.compareAsOfDate,
    });

    const serializeSnapshot = (label: string, snapshot: typeof report.current) => [
      ...snapshot.assets.map((row) => [label, "Assets", row.code, row.name, formatCsvNumber(row.amount)]),
      ...snapshot.liabilities.map((row) => [label, "Liabilities", row.code, row.name, formatCsvNumber(row.amount)]),
      ...snapshot.equity.map((row) => [label, "Equity", row.code, row.name, formatCsvNumber(row.amount)]),
      [label, "Summary", "", "Variance", formatCsvNumber(snapshot.totals.variance)],
    ];

    return {
      csv: generateCSV(
        ["Period", "Section", "Code", "Account", "Amount"],
        [
          ...serializeSnapshot("Current", report.current),
          ...(report.comparison ? serializeSnapshot("Comparison", report.comparison) : []),
        ],
      ),
      filename: "books_balance_sheet.csv",
      title: "Balance Sheet",
    };
  }

  if (reportType === "cash_flow") {
    const report = await getCashFlowStatement(orgId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
    });

    return {
      csv: generateCSV(
        ["Category", "Item", "Amount"],
        [
          ["Operating", "Net Profit", formatCsvNumber(report.netProfit)],
          ...report.adjustments.map((row) => ["Operating", row.label, formatCsvNumber(row.amount)]),
          ["Summary", "Net Cash From Operating", formatCsvNumber(report.netCashFromOperating)],
          ["Summary", "Opening Cash", formatCsvNumber(report.openingCash)],
          ["Summary", "Closing Cash", formatCsvNumber(report.closingCash)],
          ["Summary", "Actual Net Cash Movement", formatCsvNumber(report.actualNetCashMovement)],
          ["Summary", "Reconciliation Difference", formatCsvNumber(report.reconciliationDifference)],
        ],
      ),
      filename: "books_cash_flow.csv",
      title: "Cash Flow",
    };
  }

  if (reportType === "ar_aging") {
    const report = await getAccountsReceivableAging(orgId, {
      asOfDate: filters.asOfDate,
    });

    return {
      csv: generateCSV(
        ["Invoice", "Customer", "Invoice Date", "Due Date", "Outstanding", "Days Overdue", "Bucket"],
        report.rows.map((row) => [
          row.number,
          row.partyName ?? "",
          row.issueDate,
          row.dueDate ?? "",
          formatCsvNumber(row.outstandingAmount),
          String(row.daysOverdue),
          row.bucket,
        ]),
      ),
      filename: "books_ar_aging.csv",
      title: "Accounts Receivable Aging",
    };

  }

  if (reportType === "ap_aging") {
    const report = await getAccountsPayableAging(orgId, {
      asOfDate: filters.asOfDate,
    });

    return {
      csv: generateCSV(
        ["Bill", "Vendor", "Bill Date", "Due Date", "Outstanding", "Days Overdue", "Bucket"],
        report.rows.map((row) => [
          row.number,
          row.partyName ?? "",
          row.issueDate,
          row.dueDate ?? "",
          formatCsvNumber(row.outstandingAmount),
          String(row.daysOverdue),
          row.bucket,
        ]),
      ),
      filename: "books_ap_aging.csv",
      title: "Accounts Payable Aging",
    };
  }

  if (reportType === "gst_tie_out") {
    const report = await getGstTieOut(orgId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
    });


    return {
      csv: generateCSV(
        ["Section", "Source", "Amount"],
        [
          ["Output Tax", "Documents", formatCsvNumber(report.outputTax.documents)],
          ["Output Tax", "Ledger", formatCsvNumber(report.outputTax.ledger)],
          ["Output Tax", "Variance", formatCsvNumber(report.outputTax.variance)],
          ["Input Tax", "Documents", formatCsvNumber(report.inputTax.documents)],
          ["Input Tax", "Ledger", formatCsvNumber(report.inputTax.ledger)],
          ["Input Tax", "Variance", formatCsvNumber(report.inputTax.variance)],
        ],
      ),
      filename: "books_gst_tie_out.csv",
      title: "GST Tie-Out",
    };
  }

  if (reportType === "tds_tie_out") {
    const report = await getTdsTieOut(orgId, {
      startDate: filters.startDate,
      endDate: filters.endDate,
    });


    return {
      csv: generateCSV(
        ["Section", "Source", "Amount"],
        [
          ["Receivable", "Documents", formatCsvNumber(report.receivable.documents)],
          ["Receivable", "Ledger", formatCsvNumber(report.receivable.ledger)],
          ["Receivable", "Variance", formatCsvNumber(report.receivable.variance)],
          ["Payable", "Ledger", formatCsvNumber(report.payable.ledger)],
        ],
      ),
      filename: "books_tds_tie_out.csv",
      title: "TDS Tie-Out",
    };
  }

  throw new BooksApiError(
    BooksApiErrorCode.VALIDATION_ERROR,
    `Unsupported reportType: ${reportType}`,
    422,
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as BooksExportRequestBody | null;

    if (!body) {
      throw new BooksApiError(BooksApiErrorCode.VALIDATION_ERROR, "Invalid JSON body.", 422);
    }

    const reportType = body.reportType;
    const format = body.format ?? "csv";
    const filters = body.filters ?? {};

    if (!reportType) {
      throw new BooksApiError(BooksApiErrorCode.VALIDATION_ERROR, "reportType is required.", 422);
    }

    if (format !== "csv" && format !== "pdf") {
      throw new BooksApiError(BooksApiErrorCode.VALIDATION_ERROR, "format must be csv or pdf.", 422);
    }

    const { orgId } = await requireBooksApiRead(resolveFeature(reportType));
    const exportData = await buildExport(orgId, reportType, filters);

    if (format === "pdf") {
      const pdf = await buildPdfFromCsv(exportData.title, exportData.csv);
      return booksApiPdfResponse(pdf, exportData.filename.replace(/\.csv$/i, ".pdf"));
    }

    return booksApiCsvResponse(exportData.csv, exportData.filename);
  } catch (error) {
    return handleBooksApiError(error);
  }
}
