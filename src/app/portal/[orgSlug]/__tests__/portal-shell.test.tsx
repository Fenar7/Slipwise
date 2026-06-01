/**
 * Phase 5 Sprint 5.1 — Generic Portal Shell Layout Tests
 *
 * Covers: generic /portal/[orgSlug] layout access rules.
 *   - NOT_FOUND blocks the generic portal (org does not exist)
 *   - DISABLED blocks the generic portal (portalEnabled: false)
 *   - ENABLED_BUT_NOT_READY does NOT block the generic portal (Client Hub readiness
 *     is scoped to the client-hub sub-shell only, not the legacy portal shell)
 *   - portalQuoteAcceptanceEnabled truthfully controls the Quotes nav link
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mockDb = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

import PortalLayout from "../layout";

const ORG_SLUG = "acme";

function makeOrg(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "org_001",
    name: "Acme Corp",
    slug: "acme",
    logo: null,
    branding: {
      logoUrl: null,
      accentColor: "#2563eb",
      fontFamily: null,
      fontColor: null,
    },
    whiteLabel: { removeBranding: false },
    defaults: {
      portalEnabled: true,
      portalSupportEmail: "support@acme.com",
      portalSupportPhone: null,
      portalHeaderMessage: null,
      portalQuoteAcceptanceEnabled: true,
    },
    clientHubOrgConfig: null,
    ...overrides,
  };
}

function renderToString(jsx: React.ReactElement): string {
  return renderToStaticMarkup(jsx);
}

describe("PortalLayout (generic portal shell)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders NOT_FOUND error when organization does not exist", async () => {
    mockDb.organization.findUnique.mockResolvedValue(null);
    const jsx = await PortalLayout({
      children: <div />,
      params: Promise.resolve({ orgSlug: ORG_SLUG }),
    });
    const html = renderToString(jsx);
    expect(html).toContain("Page Not Found");
  });

  it("renders DISABLED error when portal is disabled by admin", async () => {
    mockDb.organization.findUnique.mockResolvedValue(
      makeOrg({ defaults: { portalEnabled: false } })
    );
    const jsx = await PortalLayout({
      children: <div />,
      params: Promise.resolve({ orgSlug: ORG_SLUG }),
    });
    const html = renderToString(jsx);
    expect(html).toContain("Portal Access Disabled");
  });

  /**
   * KEY REGRESSION TEST — Sprint 5.1 blocker fix.
   *
   * An org that is portal-enabled but has incomplete Client Hub readiness
   * (no branding / no support contact) must still render the generic portal shell.
   * The ENABLED_BUT_NOT_READY readiness gate is scoped to the Client Hub
   * sub-shell only, not the legacy portal.
   */
  it("renders generic portal even when Client Hub readiness is incomplete", async () => {
    mockDb.organization.findUnique.mockResolvedValue(
      makeOrg({
        branding: null,
        logo: null,
        defaults: {
          portalEnabled: true,
          portalSupportEmail: null,
          portalSupportPhone: null,
          portalHeaderMessage: null,
          portalQuoteAcceptanceEnabled: false,
        },
        clientHubOrgConfig: {
          config: {
            branding: { accentColor: null, logoUrl: null },
            contact: { supportEmail: null, supportPhone: null },
          },
        },
      })
    );
    const jsx = await PortalLayout({
      children: <div id="portal-content">Portal Content</div>,
      params: Promise.resolve({ orgSlug: ORG_SLUG }),
    });
    const html = renderToString(jsx);
    // Must render the portal shell — not a readiness/error gate
    expect(html).not.toContain("Portal Under Configuration");
    expect(html).not.toContain("Portal Access Disabled");
    expect(html).toContain("Portal Content");
    expect(html).toContain("Acme Corp");
  });

  /**
   * KEY REGRESSION TEST — Sprint 5.1 blocker fix.
   *
   * portalQuoteAcceptanceEnabled must truthfully control the Quotes nav.
   * The eligibility helper now selects this field, so it must not silently
   * disappear when the org is eligible.
   */
  it("renders Quotes nav link when portalQuoteAcceptanceEnabled is true", async () => {
    mockDb.organization.findUnique.mockResolvedValue(
      makeOrg({
        defaults: {
          portalEnabled: true,
          portalSupportEmail: "support@acme.com",
          portalSupportPhone: null,
          portalHeaderMessage: null,
          portalQuoteAcceptanceEnabled: true,
        },
      })
    );
    const jsx = await PortalLayout({
      children: <div />,
      params: Promise.resolve({ orgSlug: ORG_SLUG }),
    });
    const html = renderToString(jsx);
    expect(html).toContain("Quotes");
  });

  it("hides Quotes nav link when portalQuoteAcceptanceEnabled is false", async () => {
    mockDb.organization.findUnique.mockResolvedValue(
      makeOrg({
        defaults: {
          portalEnabled: true,
          portalSupportEmail: "support@acme.com",
          portalSupportPhone: null,
          portalHeaderMessage: null,
          portalQuoteAcceptanceEnabled: false,
        },
      })
    );
    const jsx = await PortalLayout({
      children: <div />,
      params: Promise.resolve({ orgSlug: ORG_SLUG }),
    });
    const html = renderToString(jsx);
    // Quotes link should not appear in nav
    expect(html).not.toContain("/quotes");
  });

  it("renders branded portal shell with full navigation for eligible org", async () => {
    mockDb.organization.findUnique.mockResolvedValue(makeOrg());
    const jsx = await PortalLayout({
      children: <div>My Page</div>,
      params: Promise.resolve({ orgSlug: ORG_SLUG }),
    });
    const html = renderToString(jsx);
    expect(html).toContain("Acme Corp");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Invoices");
    expect(html).toContain("Payments");
    expect(html).toContain("Support");
    expect(html).toContain("My Page");
  });

  it("renders portal-header-message banner when configured", async () => {
    mockDb.organization.findUnique.mockResolvedValue(
      makeOrg({
        defaults: {
          portalEnabled: true,
          portalSupportEmail: null,
          portalSupportPhone: null,
          portalHeaderMessage: "Welcome back to our portal!",
          portalQuoteAcceptanceEnabled: false,
        },
      })
    );
    const jsx = await PortalLayout({
      children: <div />,
      params: Promise.resolve({ orgSlug: ORG_SLUG }),
    });
    const html = renderToString(jsx);
    expect(html).toContain("Welcome back to our portal!");
  });
});
