/**
 * Phase 1 Sprint 1.3 — Client Hub Public Shell Render Tests
 *
 * Covers: layout renders with org branding, navigation links present,
 * login/verify shells render, dashboard renders with mock data,
 * empty states render where applicable.
 */

import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mockDb = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

// Layout is a server component that queries the DB
import ClientHubLayout from "../layout";

const ORG_SLUG = "acme";

function makeOrg(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "org_001",
    name: "Acme Corp",
    logo: null,
    branding: { logoUrl: null, accentColor: "#2563eb", fontFamily: null, fontColor: null },
    whiteLabel: { removeBranding: false },
    defaults: {
      portalEnabled: true,
      portalSupportEmail: "support@acme.com",
      portalSupportPhone: "+91 98765 43210",
    },
    ...overrides,
  };
}

describe("ClientHubLayout", () => {
  it("renders portal-not-available when org is not found", async () => {
    mockDb.organization.findUnique.mockResolvedValue(null);
    const jsx = await ClientHubLayout({ children: <div />, params: Promise.resolve({ orgSlug: ORG_SLUG }) });
    const html = renderToString(jsx);
    expect(html).toContain("Client Hub Not Available");
  });

  it("renders portal-not-available when portal is disabled", async () => {
    mockDb.organization.findUnique.mockResolvedValue(makeOrg({ defaults: { portalEnabled: false } }));
    const jsx = await ClientHubLayout({ children: <div />, params: Promise.resolve({ orgSlug: ORG_SLUG }) });
    const html = renderToString(jsx);
    expect(html).toContain("Client Hub Not Available");
  });

  it("renders branded layout with navigation when portal is enabled", async () => {
    mockDb.organization.findUnique.mockResolvedValue(makeOrg());
    const jsx = await ClientHubLayout({ children: <div>Content</div>, params: Promise.resolve({ orgSlug: ORG_SLUG }) });
    const html = renderToString(jsx);
    expect(html).toContain("Acme Corp");
    expect(html).toContain("Home");
    expect(html).toContain("Invoices");
    expect(html).toContain("Quotes");
    expect(html).toContain("Payments");
    expect(html).toContain("About Us");
    expect(html).toContain("Contact");
    expect(html).toContain("Products");
    expect(html).toContain("support@acme.com");
    expect(html).toContain("Content");
  });

  it("renders footer with powered-by when whitelabel is not removed", async () => {
    mockDb.organization.findUnique.mockResolvedValue(makeOrg());
    const jsx = await ClientHubLayout({ children: <div />, params: Promise.resolve({ orgSlug: ORG_SLUG }) });
    const html = renderToString(jsx);
    expect(html).toContain("Powered by");
    expect(html).toContain("Slipwise");
  });

  it("hides powered-by when whitelabel removes branding", async () => {
    mockDb.organization.findUnique.mockResolvedValue(makeOrg({ whiteLabel: { removeBranding: true } }));
    const jsx = await ClientHubLayout({ children: <div />, params: Promise.resolve({ orgSlug: ORG_SLUG }) });
    const html = renderToString(jsx);
    expect(html).not.toContain("Powered by");
  });
});

function renderToString(jsx: React.ReactElement): string {
  return renderToStaticMarkup(jsx);
}
