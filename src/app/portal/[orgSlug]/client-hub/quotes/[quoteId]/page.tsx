import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePortalSession } from "@/lib/portal-auth";
import { getEffectiveClientHubConfig } from "../../components/config-resolver";
import { getPortalQuoteDetail } from "../../../actions";
import { ClientHubQuoteDetailView } from "../../components/views";

export const metadata: Metadata = {
  title: "Quote Detail | Client Hub",
};

export default async function ClientHubQuoteDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; quoteId: string }>;
}) {
  const { orgSlug, quoteId } = await params;
  const session = await requirePortalSession(orgSlug, `/portal/${orgSlug}/client-hub/login`);

  const config = await getEffectiveClientHubConfig(orgSlug, session.customerId);

  if (!config.navigation.showQuotes) {
    notFound();
  }

  const result = await getPortalQuoteDetail(orgSlug, quoteId);

  if (!result.success) {
    if (result.error === "not_found") notFound();
    return (
      <div className="mx-auto max-w-[720px] space-y-6">
        <div
          className="rounded-xl border p-6 text-sm font-semibold"
          style={{
            borderColor: "var(--hub-border)",
            backgroundColor: "var(--hub-surface)",
            color: "var(--hub-text-soft)",
          }}
        >
          Unable to load quote details. Please try again later.
        </div>
      </div>
    );
  }

  const quote = result.data;

  return (
    <ClientHubQuoteDetailView
      orgSlug={orgSlug}
      config={config}
      quote={{
        id: quote.id,
        quoteNumber: quote.quoteNumber,
        title: quote.title,
        status: quote.status,
        issueDate: quote.issueDate,
        validUntil: quote.validUntil,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        discountAmount: quote.discountAmount,
        totalAmount: quote.totalAmount,
        notes: quote.notes ?? null,
        termsAndConditions: quote.termsAndConditions ?? null,
        acceptedAt: quote.acceptedAt,
        declinedAt: quote.declinedAt,
        declineReason: quote.declineReason ?? null,
        canRespond: quote.canRespond,
        customerName: quote.customer.name,
        orgName: quote.org.name,
        lineItems: quote.lineItems.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxRate: item.taxRate,
          amount: item.amount,
        })),
      }}
    />
  );
}
