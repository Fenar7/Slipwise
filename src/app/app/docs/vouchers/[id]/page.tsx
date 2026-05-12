import { notFound } from "next/navigation";
import { getVoucher } from "../actions";
import { VoucherBrandingWrapper } from "../new/branding-wrapper";
import { listVendors } from "@/app/app/data/actions";
import { DocumentAttachments } from "@/components/docs/document-attachments";
import { getDocAttachments } from "@/app/app/docs/attachment-actions";
import { getDocumentTimelineForPage } from "@/lib/document-events";
import { DocumentTimeline } from "@/components/docs/document-timeline";
import { DocumentActionBar } from "@/components/docs/document-action-bar";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { getVoucherTags } from "@/lib/tags/assignment-service";
import { TagChips } from "@/components/tags/tag-chips";

export const metadata = {
  title: "Edit Voucher | Slipwise",
};

function formatVoucherDate(voucherDate: string) {
  const parsed = new Date(`${voucherDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return voucherDate;
  }

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const VOUCHER_STATUS_VARIANTS: Record<string, Parameters<typeof StatusBadge>[0]["variant"]> = {
  DRAFT: "neutral",
  ISSUED: "info",
  APPROVED: "success",
  RELEASED: "success",
  CANCELLED: "neutral",
};

export default async function EditVoucherPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [voucher, vendorsResult, attachments, events, tagsResult] = await Promise.all([
    getVoucher(id),
    listVendors({ limit: 100 }).catch(() => ({ vendors: [] })),
    getDocAttachments(id, "voucher"),
    getDocumentTimelineForPage("voucher", id).catch(() => []),
    getVoucherTags(id).catch(() => ({ success: false as const, error: "" })),
  ]);

  if (!voucher) {
    notFound();
  }

  const statusVariant = VOUCHER_STATUS_VARIANTS[voucher.status] ?? "neutral";
  const voucherTitle =
    voucher.vendor?.name ??
    (voucher.type === "payment" ? "Payment voucher" : "Receipt voucher");

  return (
    <div className="space-y-5">
      <DocumentActionBar
        backHref="/app/docs/vouchers"
        backLabel="Vouchers"
        documentType={voucher.type === "payment" ? "Payment Voucher" : "Receipt Voucher"}
        documentNumber={voucher.voucherNumber ?? "Draft"}
        title={voucherTitle}
        status={voucher.status}
        statusVariant={statusVariant}
        primaryActions={[
          {
            id: "print",
            label: "Print",
            icon: "print",
            variant: "secondary",
            href: `/app/docs/vouchers/print?id=${voucher.id}`,
          },
          {
            id: "export",
            label: "Export PDF",
            icon: "download",
            variant: "secondary",
            href: `/app/docs/vouchers/print?id=${voucher.id}&format=pdf`,
          },
        ]}
        secondaryActions={[
          {
            id: "preview",
            label: "Preview",
            icon: "preview",
            variant: "subtle",
            href: `/app/docs/vouchers/print?id=${voucher.id}&preview=1`,
          },
        ]}
        contextMeta={[
          { label: "Party", value: voucher.vendor?.name ?? "—" },
          { label: "Date", value: formatVoucherDate(voucher.voucherDate) },
          {
            label: "Amount",
            value: new Intl.NumberFormat("en-IN", {
              style: "currency",
              currency: "INR",
              minimumFractionDigits: 0,
            }).format(voucher.totalAmount),
          },
        ]}
      />

      <div className="flex flex-col gap-5 lg:flex-row">
        <div className="flex-1">
          <VoucherBrandingWrapper existingVoucher={voucher} vendors={vendorsResult.vendors} />
        </div>
        <aside className="w-full shrink-0 lg:w-80 space-y-4">
          {tagsResult.success && tagsResult.data.length > 0 && (
            <div className="rounded-xl border border-[var(--border-soft)] bg-white p-4 shadow-[var(--shadow-card)]">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                Tags
              </h3>
              <TagChips tags={tagsResult.data} />
            </div>
          )}
          <DocumentAttachments docId={voucher.id} docType="voucher" attachments={attachments} />
        </aside>
      </div>

      {/* Voucher lifecycle timeline */}
      <div className="mx-auto max-w-5xl">
        <div className="rounded-xl border border-[var(--border-default)] bg-white p-5 shadow-[var(--shadow-card)] md:p-6">
          <DocumentTimeline events={events} title="History" />
        </div>
      </div>
    </div>
  );
}
