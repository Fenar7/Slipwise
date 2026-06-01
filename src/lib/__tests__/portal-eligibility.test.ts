import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkPortalEligibility } from "@/lib/portal-eligibility";

const mockDb = vi.hoisted(() => ({
  organization: {
    findUnique: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

describe("checkPortalEligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseOrg = {
    id: "org_123",
    name: "Test Organization",
    slug: "test-org",
    logo: null,
    branding: {
      accentColor: "#2563eb",
      logoUrl: null,
      fontFamily: null,
      fontColor: null,
    },
    whiteLabel: {
      removeBranding: false,
    },
    defaults: {
      portalEnabled: true,
      portalSupportEmail: "support@test.com",
      portalSupportPhone: null,
      portalHeaderMessage: "Welcome",
      portalQuoteAcceptanceEnabled: true,
    },
    clientHubOrgConfig: null,
  };

  it("returns NOT_FOUND if the organization does not exist", async () => {
    mockDb.organization.findUnique.mockResolvedValue(null);

    const result = await checkPortalEligibility("non-existent");
    expect(result.state).toBe("NOT_FOUND");
  });

  it("returns DISABLED if the organization has portal access disabled", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      defaults: {
        ...baseOrg.defaults,
        portalEnabled: false,
      },
    });

    const result = await checkPortalEligibility("disabled-org");
    expect(result.state).toBe("DISABLED");
    if (result.state === "DISABLED") {
      expect(result.org.name).toBe("Test Organization");
    }
  });

  it("returns ENABLED_AND_READY if organization is fully ready (using defaults/branding)", async () => {
    mockDb.organization.findUnique.mockResolvedValue(baseOrg);

    const result = await checkPortalEligibility("test-org");
    expect(result.state).toBe("ENABLED_AND_READY");
    if (result.state === "ENABLED_AND_READY") {
      expect(result.org.id).toBe("org_123");
    }
  });

  it("returns ENABLED_BUT_NOT_READY if organization has no support contact", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      defaults: {
        ...baseOrg.defaults,
        portalSupportEmail: null,
        portalSupportPhone: null,
      },
    });

    const result = await checkPortalEligibility("no-support");
    expect(result.state).toBe("ENABLED_BUT_NOT_READY");
    if (result.state === "ENABLED_BUT_NOT_READY") {
      expect(result.missingRequirements).toContain("support-contact");
    }
  });

  it("returns ENABLED_BUT_NOT_READY if organization has no branding (accent color or logo)", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      branding: null,
      logo: null,
    });

    const result = await checkPortalEligibility("no-branding");
    expect(result.state).toBe("ENABLED_BUT_NOT_READY");
    if (result.state === "ENABLED_BUT_NOT_READY") {
      expect(result.missingRequirements).toContain("branding");
    }
  });

  /**
   * Dev-preview fallback: stub is used ONLY when DB returns null in development.
   * The DB is always queried first — so a real acme org wins over the preview stub.
   */
  it("uses dev-preview stub when real acme org is absent in development", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    mockDb.organization.findUnique.mockResolvedValue(null); // no real org

    try {
      const result = await checkPortalEligibility("acme");
      expect(result.state).toBe("ENABLED_AND_READY");
      if (result.state === "ENABLED_AND_READY") {
        expect(result.org.id).toBe("org_preview");
        expect(result.org.name).toBe("Acme Corporation");
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("respects a real disabled acme org in development — does NOT apply dev-preview stub", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    mockDb.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      id: "org_real_acme",
      slug: "acme",
      defaults: { ...baseOrg.defaults, portalEnabled: false },
    });

    try {
      const result = await checkPortalEligibility("acme");
      // Real disabled acme org must return DISABLED, not the preview ENABLED_AND_READY
      expect(result.state).toBe("DISABLED");
      if (result.state === "DISABLED") {
        expect(result.org.id).toBe("org_real_acme");
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("truthfully loads and returns portalQuoteAcceptanceEnabled flag in defaults", async () => {
    mockDb.organization.findUnique.mockResolvedValue(baseOrg);
    const result = await checkPortalEligibility("test-org");
    expect(result.state).toBe("ENABLED_AND_READY");
    if (result.state === "ENABLED_AND_READY") {
      expect(result.org.defaults.portalQuoteAcceptanceEnabled).toBe(true);
    }
  });

  it("carries whiteLabel.removeBranding=true through DISABLED result so callers can suppress vendor branding", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      whiteLabel: { removeBranding: true },
      defaults: { ...baseOrg.defaults, portalEnabled: false },
    });

    const result = await checkPortalEligibility("wl-disabled-org");
    expect(result.state).toBe("DISABLED");
    if (result.state === "DISABLED") {
      expect(result.org.whiteLabel?.removeBranding).toBe(true);
    }
  });

  it("carries whiteLabel.removeBranding=true through ENABLED_BUT_NOT_READY result", async () => {
    mockDb.organization.findUnique.mockResolvedValue({
      ...baseOrg,
      branding: null,
      logo: null,
      whiteLabel: { removeBranding: true },
      defaults: {
        ...baseOrg.defaults,
        portalSupportEmail: null,
        portalSupportPhone: null,
      },
    });

    const result = await checkPortalEligibility("wl-not-ready-org");
    expect(result.state).toBe("ENABLED_BUT_NOT_READY");
    if (result.state === "ENABLED_BUT_NOT_READY") {
      expect(result.org.whiteLabel?.removeBranding).toBe(true);
    }
  });
});

