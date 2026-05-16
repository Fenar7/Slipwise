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
    expect(html).toContain("Your business hub, beautifully organized");
    expect(html).toContain("Client Portal");
    expect(html).toContain("Outstanding");
    expect(html).toContain("Pending invoices");
    expect(html).toContain("Recent invoices");
    expect(html).toContain("Quotes awaiting response");
  });
});

describe("Client Hub Invoices", () => {
  it("renders invoice list with mock data", async () => {
    const html = await renderAsyncPage(InvoicesPage);
    expect(html).toContain("Invoices");
    expect(html).toContain("INV-2026-001");
    expect(html).toContain("ISSUED");
    expect(html).toContain("PAID");
  });

  it("renders invoice detail for known invoice", async () => {
    const html = await renderAsyncDetailPage(InvoiceDetailPage, "inv-001");
    expect(html).toContain("Invoice #INV-2026-001");
    expect(html).toContain("How would you like to pay?");
    expect(html).toContain("Payment Link");
    expect(html).toContain("Bank Transfer");
  });

  it("renders paid notice for paid invoice", async () => {
    const html = await renderAsyncDetailPage(InvoiceDetailPage, "inv-002");
    expect(html).toContain("paid in full");
    expect(html).not.toContain("How would you like to pay?");
  });
});

describe("Client Hub Quotes", () => {
  it("renders quote list with mock data", async () => {
    const html = await renderAsyncPage(QuotesPage);
    expect(html).toContain("Quotes");
    expect(html).toContain("Website Redesign Proposal");
    expect(html).toContain("SENT");
    expect(html).toContain("ACCEPTED");
  });

  it("renders quote detail with response actions for sent quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-001");
    expect(html).toContain("Website Redesign Proposal");
    expect(html).toContain("Your response");
    expect(html).toContain("Accept quote");
    expect(html).toContain("Decline");
  });

  it("renders accepted notice for accepted quote", async () => {
    const html = await renderAsyncDetailPage(QuoteDetailPage, "qt-002");
    expect(html).toContain("accepted this quote");
    expect(html).not.toContain("Your response");
  });
});

describe("Client Hub Payments", () => {
  it("renders payment history and outstanding summary", async () => {
    const html = await renderAsyncPage(PaymentsPage);
    expect(html).toContain("Payments");
    expect(html).toContain("Total paid");
    expect(html).toContain("Outstanding");
    expect(html).toContain("Payment history");
    expect(html).toContain("Outstanding invoices");
  });
});

describe("Client Hub About", () => {
  it("renders company story and values", async () => {
    const html = await renderAsyncPage(AboutPage);
    expect(html).toContain("Built to make client collaboration feel effortless");
    expect(html).toContain("Clarity");
    expect(html).toContain("Reliability");
    expect(html).toContain("Relationship first");
  });
});

describe("Client Hub Contact", () => {
  it("renders contact methods and support info", async () => {
    const html = await renderAsyncPage(ContactPage);
    expect(html).toContain("Contact");
    expect(html).toContain("Email");
    expect(html).toContain("Phone");
    expect(html).toContain("Business hours");
  });
});

describe("Client Hub Products", () => {
  it("renders product catalog with mock data", async () => {
    const html = await renderAsyncPage(ProductsPage);
    expect(html).toContain("Products and services tailored to your growth");
    expect(html).toContain("Consulting Retainer");
    expect(html).toContain("Design System Build");
    expect(html).toContain("SEO &amp; Content Strategy");
  });
});
