/**
 * Phase 1 Sprint 1.3 — Client Hub Static Page Shell Render Tests
 *
 * Covers: dashboard, invoices, invoice detail, quotes, quote detail,
 * payments, about, contact, and products pages render without error.
 */

import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardPage from "../page";
import InvoicesPage from "../invoices/page";
import InvoiceDetailPage from "../invoices/[id]/page";
import InvoicePaymentPage from "../invoices/[id]/payment/page";
import QuotesPage from "../quotes/page";
import QuoteDetailPage from "../quotes/[id]/page";
import PaymentsPage from "../payments/page";
import AboutPage from "../about/page";
import ContactPage from "../contact/page";
import ProductsPage from "../products/page";

const ORG_SLUG = "acme";

async function renderAsyncPage(Page: (props: { params: Promise<{ orgSlug: string }> }) => Promise<React.ReactElement>) {
  const jsx = await Page({ params: Promise.resolve({ orgSlug: ORG_SLUG }) });
  return renderToStaticMarkup(jsx);
}

async function renderAsyncDetailPage(
  Page: (props: { params: Promise<{ orgSlug: string; id: string }> }) => Promise<React.ReactElement>,
  id: string
) {
  const jsx = await Page({ params: Promise.resolve({ orgSlug: ORG_SLUG, id }) });
  return renderToStaticMarkup(jsx);
}

describe("Client Hub Dashboard", () => {
  it("renders with summary cards and recent invoices", async () => {
    const html = await renderAsyncPage(DashboardPage);
    expect(html).toContain("Your Business Hub");
    expect(html).toContain("Client Portal");
    expect(html).toContain("Take Actions");
    expect(html).toContain("Pending Invoices");
    expect(html).toContain("Pending Quotes");
    expect(html).toContain("View Products/Services");
  });
});

describe("Client Hub Invoices", () => {
  it("renders invoice list with mock data", async () => {
    const html = await renderAsyncPage(InvoicesPage);
    expect(html).toContain("Invoices");
    expect(html).toContain("INV-000131");
    expect(html).toContain("UNPAID");
    expect(html).toContain("PAID");
  });

  it("renders invoice detail for known invoice", async () => {
    const html = await renderAsyncDetailPage(InvoiceDetailPage, "inv-001");
    expect(html).toContain("Invoice #INV-000131");
    expect(html).toContain("Hi Hadi Azeez");
    expect(html).toContain("PAY NOW");
    expect(html).toContain("LinkedIn inbox yearly");
  });

  it("renders paid notice for paid invoice", async () => {
    const html = await renderAsyncDetailPage(InvoiceDetailPage, "inv-002");
    expect(html).toContain("Invoice #INV-000128");
    expect(html).not.toContain("PAY NOW");
  });

  it("renders payment selection as a dedicated step", async () => {
    const jsx = await InvoicePaymentPage({ params: Promise.resolve({ orgSlug: ORG_SLUG, id: "inv-001" }) });
    const html = renderToStaticMarkup(jsx);
    expect(html).toContain("How would you like to pay?");
    expect(html).toContain("Payment Link");
    expect(html).toContain("Bank Transfer");
    expect(html).toContain("Amount Due");
  });
});

describe("Client Hub Quotes", () => {
  it("renders quote list with mock data", async () => {
    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Quotes");
    expect(html).toContain("Outbound lead generation package");
    expect(html).toContain("SENT");
    expect(html).toContain("ACCEPTED");
  });

  it("renders quote detail with response actions for sent quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-001");
    expect(html).toContain("Outbound lead generation package");
    expect(html).toContain("Your Response");
    expect(html).toContain("Accept Quote");
    expect(html).toContain("Decline");
  });

  it("renders accepted notice for accepted quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-002");
    expect(html).toContain("You accepted this quote");
    expect(html).not.toContain("Your Response");
  });
});

describe("Client Hub Payments", () => {
  it("renders payment history and outstanding summary", async () => {
    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("How would you like to pay?");
    expect(html).toContain("Total Paid");
    expect(html).toContain("Outstanding");
    expect(html).toContain("Payment History");
    expect(html).toContain("Bank Transfer");
  });
});

describe("Client Hub About", () => {
  it("renders company story and values", async () => {
    const html = await renderAsyncPage(AboutPage);
    expect(html).toContain("About Us");
    expect(html).toContain("We combine clear communication");
  });
});

describe("Client Hub Contact", () => {
  it("renders contact methods and support info", async () => {
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("Contact Us");
    expect(html).toContain("Email");
    expect(html).toContain("Phone");
    expect(html).toContain("Business Hours");
    expect(html).toContain("Emergency Support");
  });
});

describe("Client Hub Products", () => {
  it("renders product catalog with mock data", async () => {
    const html = await renderAsyncPage(ProductsPage);
    expect(html).toContain("LinkedIn Inbox Yearly");
    expect(html).toContain("Lead Generation Sprint");
    expect(html).toContain("Quarterly Advisory");
  });
});
