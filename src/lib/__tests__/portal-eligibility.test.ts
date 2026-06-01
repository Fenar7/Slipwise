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

  it("supports dev preview for acme when process.env.NODE_ENV is development", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    try {
      const result = await checkPortalEligibility("acme");
      expect(result.state).toBe("ENABLED_AND_READY");
      if (result.state === "ENABLED_AND_READY") {
        expect(result.org.name).toBe("Acme Corporation");
        expect(result.org.id).toBe("org_preview");
      }
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
