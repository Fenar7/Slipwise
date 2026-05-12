import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  FinanceTable,
  FinanceTableHeader,
  FinanceTableHead,
  FinanceTableBody,
  FinanceTableRow,
  FinanceTableCell,
} from "@/components/ui/finance-table";
import { getBooksJournal } from "../../actions";
import { JournalAttachmentDownloadButton } from "../../components/journal-attachment-download-button";
import { JournalAttachmentForm } from "../../components/journal-attachment-form";
import { booksStatusBadgeVariant, formatBooksMoney } from "../../view-helpers";

export const metadata = {
  title: "Journal Detail | Slipwise",
};

interface JournalDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function JournalDetailPage({ params }: JournalDetailPageProps) {
  const { id } = await params;
  const result = await getBooksJournal(id);

  if (!result.success) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="rounded-xl bg-[var(--state-danger-soft)] px-4 py-3 text-sm text-[var(--state-danger)]">
          {result.error}
        </div>
      </div>
    );
  }

  const journal = result.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link
          href="/app/books/journals"
          className="text-sm font-medium text-[var(--brand-primary)] hover:underline"
        >
          Back to journal register
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
              {journal.entryNumber}
            </h1>
            <Badge variant={booksStatusBadgeVariant(journal.status)}>{journal.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {journal.source.replaceAll("_", " ")} •{" "}
            {new Date(journal.entryDate).toLocaleDateString()} • {journal.period.label}
          </p>
          {journal.memo && (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{journal.memo}</p>
          )}
        </div>

        <div className="rounded-xl bg-[var(--surface-subtle)] px-4 py-3 text-sm">
          <div className="text-[var(--text-secondary)]">
            Total debit:{" "}
            <strong className="text-[var(--text-primary)] tabular-nums">
              {formatBooksMoney(journal.totalDebit)}
            </strong>
          </div>
          <div className="mt-1 text-[var(--text-secondary)]">
            Total credit:{" "}
            <strong className="text-[var(--text-primary)] tabular-nums">
              {formatBooksMoney(journal.totalCredit)}
            </strong>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Journal lines</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Balanced posting detail for this journal entry.
          </p>
        </CardHeader>
        <CardContent className="px-0 py-0">
          <FinanceTable>
            <FinanceTableHeader>
              <FinanceTableHead>Line</FinanceTableHead>
              <FinanceTableHead>Account</FinanceTableHead>
              <FinanceTableHead>Description</FinanceTableHead>
              <FinanceTableHead align="right">Debit</FinanceTableHead>
              <FinanceTableHead align="right">Credit</FinanceTableHead>
            </FinanceTableHeader>
            <FinanceTableBody>
              {journal.lines.map((line) => (
                <FinanceTableRow key={line.id}>
                  <FinanceTableCell variant="muted">{line.lineNumber}</FinanceTableCell>
                  <FinanceTableCell variant="primary">
                    <div className="font-medium">
                      {line.account.code} — {line.account.name}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">
                      {line.account.accountType} • {line.account.normalBalance}
                    </div>
                  </FinanceTableCell>
                  <FinanceTableCell>{line.description ?? "—"}</FinanceTableCell>
                  <FinanceTableCell align="right" variant="numeric">
                    {line.debit > 0 ? formatBooksMoney(line.debit) : "—"}
                  </FinanceTableCell>
                  <FinanceTableCell align="right" variant="numeric">
                    {line.credit > 0 ? formatBooksMoney(line.credit) : "—"}
                  </FinanceTableCell>
                </FinanceTableRow>
              ))}
            </FinanceTableBody>
          </FinanceTable>
        </CardContent>
      </Card>

      {journal.status !== "REVERSED" && (
        <JournalAttachmentForm journalEntryId={journal.id} />
      )}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Journal attachments</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Support documents, reconciliations, and audit evidence linked to this journal.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {journal.attachments.length === 0 ? (
            <div className="rounded-xl bg-[var(--surface-subtle)] px-4 py-3 text-sm text-[var(--text-muted)]">
              No journal evidence uploaded yet.
            </div>
          ) : (
            journal.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex flex-col gap-3 rounded-xl border border-[var(--border-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {attachment.fileName}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {attachment.mimeType} •{" "}
                    {Math.max(1, Math.round(attachment.size / 1024))} KB •{" "}
                    {new Date(attachment.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <JournalAttachmentDownloadButton attachmentId={attachment.id} />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
