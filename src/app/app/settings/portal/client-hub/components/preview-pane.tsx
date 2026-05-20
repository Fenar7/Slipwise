"use client";

import type { ClientHubConfig } from "./mock-config";
import { PREVIEW_ORG } from "./mock-config";
import { buildHubThemeStyle, ClientHubAboutView, ClientHubContactView, ClientHubDashboardView, ClientHubInvoicesView, ClientHubPaymentsView, ClientHubPreviewShell, ClientHubProductsView, ClientHubQuoteDetailView, ClientHubQuotesView } from "@/app/portal/[orgSlug]/client-hub/components/views";

interface PreviewPaneProps {
  config: ClientHubConfig;
  previewPage: string;
}

const PREVIEW_PATHS: Record<string, string> = {
  dashboard: `/portal/${PREVIEW_ORG.slug}/client-hub`,
  invoices: `/portal/${PREVIEW_ORG.slug}/client-hub/invoices`,
  quotes: `/portal/${PREVIEW_ORG.slug}/client-hub/quotes`,
  payments: `/portal/${PREVIEW_ORG.slug}/client-hub/payments`,
  about: `/portal/${PREVIEW_ORG.slug}/client-hub/about`,
  contact: `/portal/${PREVIEW_ORG.slug}/client-hub/contact`,
  products: `/portal/${PREVIEW_ORG.slug}/client-hub/products`,
};

export function PreviewPane({ config, previewPage }: PreviewPaneProps) {
  let content: React.ReactNode;

  switch (previewPage) {
    case "invoices":
      content = <ClientHubInvoicesView orgSlug={PREVIEW_ORG.slug} config={config} />;
      break;
    case "quotes":
      content = <ClientHubQuotesView orgSlug={PREVIEW_ORG.slug} config={config} />;
      break;
    case "payments":
      content = <ClientHubPaymentsView orgSlug={PREVIEW_ORG.slug} config={config} />;
      break;
    case "about":
      content = <ClientHubAboutView config={config} />;
      break;
    case "contact":
      content = <ClientHubContactView config={config} />;
      break;
    case "products":
      content = <ClientHubProductsView config={config} />;
      break;
    case "quote-detail":
      content = <ClientHubQuoteDetailView quoteId="qt-001" config={config} />;
      break;
    default:
      content = <ClientHubDashboardView orgSlug={PREVIEW_ORG.slug} config={config} />;
      break;
  }

  return (
    <div className="h-full min-h-0" style={buildHubThemeStyle(config.branding.accentColor)}>
      <ClientHubPreviewShell
        orgSlug={PREVIEW_ORG.slug}
        orgName={PREVIEW_ORG.name}
        logoUrl={config.branding.logoUrl}
        config={config}
        activePath={PREVIEW_PATHS[previewPage] ?? PREVIEW_PATHS.dashboard}
      >
        {content}
      </ClientHubPreviewShell>
    </div>
  );
}
