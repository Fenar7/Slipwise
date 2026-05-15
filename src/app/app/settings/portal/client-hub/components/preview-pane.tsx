"use client";

import { cn } from "@/lib/utils";
import type { ClientHubConfig } from "./mock-config";
import {
  MOCK_INVOICES,
  MOCK_QUOTES,
  MOCK_PRODUCTS,
  OUTSTANDING_BALANCE,
  PENDING_INVOICES_COUNT,
  PENDING_QUOTES_COUNT,
} from "@/app/portal/[orgSlug]/client-hub/components/mock-data";

interface PreviewPaneProps {
  config: ClientHubConfig;
  previewPage: string;
}

const STATUS_COLORS: Record<string, string> = {
  ISSUED: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  PARTIALLY_PAID: "bg-orange-100 text-orange-700",
  OVERDUE: "bg-red-100 text-red-700",
  SENT: "bg-blue-100 text-blue-700",
  ACCEPTED: "bg-green-100 text-green-700",
  DECLINED: "bg-red-100 text-red-700",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

function PreviewHeader({ config, orgName }: { config: ClientHubConfig; orgName: string }) {
  const { branding, navigation } = config;
  const accent = branding.accentColor;

  const navItems = [
    { key: "showDashboard", label: "Dashboard" },
    { key: "showInvoices", label: "Invoices" },
    { key: "showQuotes", label: "Quotes" },
    { key: "showPayments", label: "Payments" },
    { key: "showAbout", label: "About" },
    { key: "showContact", label: "Contact" },
    { key: "showProducts", label: "Products" },
  ] as const;

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${orgName} logo`}
              className="h-7 w-auto max-w-[100px] object-contain"
            />
          ) : (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ backgroundColor: accent }}
            >
              {orgName.charAt(0)}
            </span>
          )}
          <span className="text-base font-semibold text-slate-900">{orgName}</span>
        </div>
        <nav className="hidden items-center gap-0.5 md:flex">
          {navItems.map((item) => {
            if (!(navigation[item.key as keyof typeof navigation] as boolean)) return null;
            return (
              <span
                key={item.key}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                {item.label}
              </span>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function PreviewFooter({ config, orgName }: { config: ClientHubConfig; orgName: string }) {
  const { navigation, branding } = config;
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-4">
        <div className="flex flex-col items-center justify-between gap-2 text-xs text-slate-500 sm:flex-row">
          <p>
            &copy; {new Date().getFullYear()} {orgName}. {navigation.footerText}
          </p>
          <div className="flex items-center gap-3">
            {navigation.footerLinks.map((link) => (
              <span key={link.label} className="hover:underline" style={{ color: branding.accentColor }}>
                {link.label}
              </span>
            ))}
          </div>
          {!branding.removePoweredBy && (
            <p className="text-[0.65rem] text-slate-400">
              Powered by <span style={{ color: branding.accentColor }}>Slipwise</span>
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

function DashboardPreview({ config }: { config: ClientHubConfig }) {
  const { homeDashboard, branding } = config;
  const accent = branding.accentColor;

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{homeDashboard.heroTitle}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{homeDashboard.heroSubtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {homeDashboard.showOutstandingBalance && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Outstanding</p>
            <p className="mt-1 text-xl font-bold text-red-600">{formatCurrency(OUTSTANDING_BALANCE)}</p>
          </div>
        )}
        {homeDashboard.showPendingInvoices && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Pending Invoices</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{PENDING_INVOICES_COUNT}</p>
          </div>
        )}
        {homeDashboard.showPendingQuotes && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Pending Quotes</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{PENDING_QUOTES_COUNT}</p>
          </div>
        )}
        {homeDashboard.showQuickActions && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Quick Actions</p>
            <div className="mt-2 flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[0.7rem] font-medium text-slate-700">
                View Invoices
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[0.7rem] font-medium text-slate-700">
                Review Quotes
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Recent Invoices</h2>
          <span className="text-xs font-medium" style={{ color: accent }}>View All →</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">#</th>
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Date</th>
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Amount</th>
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {MOCK_INVOICES.slice(0, 3).map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-2 font-medium" style={{ color: accent }}>#{inv.invoiceNumber}</td>
                  <td className="px-4 py-2 text-slate-600">{inv.invoiceDate}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{formatCurrency(inv.totalAmount)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${STATUS_COLORS[inv.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {inv.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function InvoicesPreview({ config }: { config: ClientHubConfig }) {
  const { invoices } = config;
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{invoices.pageTitle}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{invoices.pageDescription}</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">#</th>
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Date</th>
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Amount</th>
                <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Status</th>
                {(invoices.showDownloadAction || invoices.showPayAction) && (
                  <th className="px-4 py-2 text-[0.65rem] font-medium uppercase tracking-wider text-slate-400">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {MOCK_INVOICES.map((inv) => (
                <tr key={inv.id}>
                  <td className="px-4 py-2 font-medium text-slate-900">#{inv.invoiceNumber}</td>
                  <td className="px-4 py-2 text-slate-600">{inv.invoiceDate}</td>
                  <td className="px-4 py-2 font-medium text-slate-900">{formatCurrency(inv.totalAmount)}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${STATUS_COLORS[inv.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {inv.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  {(invoices.showDownloadAction || invoices.showPayAction) && (
                    <td className="px-4 py-2">
                      <div className="flex gap-1.5">
                        {invoices.showDownloadAction && (
                          <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[0.65rem]">Download</span>
                        )}
                        {invoices.showPayAction && inv.status !== "PAID" && (
                          <span className="rounded-md px-2 py-0.5 text-[0.65rem] text-white" style={{ backgroundColor: config.branding.accentColor }}>
                            Pay
                          </span>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function QuotesPreview({ config }: { config: ClientHubConfig }) {
  const { quotes } = config;
  const pending = MOCK_QUOTES.filter((q) => q.status === "SENT");
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{quotes.pageTitle}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{quotes.pageDescription}</p>
      </div>
      <div className="space-y-3">
        {MOCK_QUOTES.map((quote) => (
          <div key={quote.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{quote.title}</p>
                <p className="text-xs text-slate-500">#{quote.quoteNumber} · Valid until {quote.validUntil}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">{formatCurrency(quote.totalAmount)}</span>
                {quote.canRespond && quotes.showAcceptReject && (
                  <div className="flex gap-1">
                    <span className="rounded-md bg-green-600 px-2 py-0.5 text-[0.65rem] text-white">Accept</span>
                    <span className="rounded-md border border-slate-200 px-2 py-0.5 text-[0.65rem]">Decline</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentsPreview({ config }: { config: ClientHubConfig }) {
  const { payments } = config;
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{payments.pageTitle}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{payments.pageDescription}</p>
      </div>
      {payments.showPaymentMethods && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900 mb-2">Accepted Payment Methods</p>
          <div className="flex flex-wrap gap-2">
            {payments.acceptedMethods.map((method) => (
              <span
                key={method}
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AboutPreview({ config }: { config: ClientHubConfig }) {
  const { about, branding } = config;
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{about.pageTitle}</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">{about.heading}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{about.body}</p>
        {about.showFoundedYear && about.foundedYear && (
          <p className="mt-3 text-xs text-slate-500">Founded in {about.foundedYear}</p>
        )}
      </div>
    </div>
  );
}

function ContactPreview({ config }: { config: ClientHubConfig }) {
  const { contact, branding } = config;
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{contact.pageTitle}</h1>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-base font-semibold text-slate-900">{contact.heading}</h2>
        <div className="mt-3 space-y-2 text-sm">
          {contact.supportEmail && (
            <p className="text-slate-600">
              <span className="font-medium text-slate-900">Email:</span>{" "}
              <span style={{ color: branding.accentColor }}>{contact.supportEmail}</span>
            </p>
          )}
          {contact.supportPhone && (
            <p className="text-slate-600">
              <span className="font-medium text-slate-900">Phone:</span>{" "}
              <span style={{ color: branding.accentColor }}>{contact.supportPhone}</span>
            </p>
          )}
          {contact.businessHours && (
            <p className="text-slate-600">
              <span className="font-medium text-slate-900">Hours:</span> {contact.businessHours}
            </p>
          )}
        </div>
        {contact.showMapPlaceholder && (
          <div className="mt-4 h-32 rounded-md bg-slate-100 flex items-center justify-center">
            <span className="text-xs text-slate-400">Map placeholder</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductsPreview({ config }: { config: ClientHubConfig }) {
  const { products, branding } = config;
  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{products.pageTitle}</h1>
        <p className="mt-0.5 text-xs text-slate-500">{products.description}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {MOCK_PRODUCTS.map((product) => (
          <div key={product.id} className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">{product.name}</p>
            <p className="mt-1 text-xs text-slate-500">{product.description}</p>
            {products.showPricing && (
              <p className="mt-2 text-sm font-semibold" style={{ color: branding.accentColor }}>
                {formatCurrency(product.price)}
                {products.showUnit && <span className="text-xs font-normal text-slate-500"> / {product.unit}</span>}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PreviewPane({ config, previewPage }: PreviewPaneProps) {
  const orgName = "Acme Corporation";

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-[var(--border-strong)] bg-slate-50 shadow-[var(--shadow-card)]">
      {/* Preview chrome bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-2 w-2 rounded-full bg-red-400" />
          <span className="inline-flex h-2 w-2 rounded-full bg-amber-400" />
          <span className="inline-flex h-2 w-2 rounded-full bg-green-400" />
          <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-[0.65rem] font-mono text-slate-500">
            /portal/acme/client-hub{previewPage === "dashboard" ? "" : `/${previewPage}`}
          </span>
        </div>
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-amber-700">
          Preview only
        </span>
      </div>

      {/* Preview viewport */}
      <div className="flex-1 overflow-y-auto">
        <PreviewHeader config={config} orgName={orgName} />
        <main className="mx-auto min-h-[320px] max-w-5xl">
          {previewPage === "dashboard" && <DashboardPreview config={config} />}
          {previewPage === "invoices" && <InvoicesPreview config={config} />}
          {previewPage === "quotes" && <QuotesPreview config={config} />}
          {previewPage === "payments" && <PaymentsPreview config={config} />}
          {previewPage === "about" && <AboutPreview config={config} />}
          {previewPage === "contact" && <ContactPreview config={config} />}
          {previewPage === "products" && <ProductsPreview config={config} />}
        </main>
        <PreviewFooter config={config} orgName={orgName} />
      </div>
    </div>
  );
}
