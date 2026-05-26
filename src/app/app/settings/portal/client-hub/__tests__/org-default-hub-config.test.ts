import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockRequireOrgContext = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

const mockDb = vi.hoisted(() => ({
  clientHubOrgConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  organization: {
    findUnique: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireOrgContext: mockRequireOrgContext,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
}));

import { getClientHubOrgConfig, updateClientHubOrgConfig } from "@/app/app/actions/client-hub-actions";
import { getPersistedHubConfig } from "@/app/portal/[orgSlug]/client-hub/components/config-resolver";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";

// ─── Constants ──────────────────────────────────────────────────────────────

const ORG_ID = "org-123-abc";
const USER_ID = "user-uuid-999";

function setupAuth(orgId = ORG_ID, userId = USER_ID, role = "admin") {
  mockRequireOrgContext.mockResolvedValue({ orgId, userId, role });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Client Hub Org Default persistence & actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getClientHubOrgConfig (read defaults)", () => {
    it("safely falls back to DEFAULT_CLIENT_HUB_CONFIG if config does not exist in DB yet", async () => {
      setupAuth();
      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue(null);

      const config = await getClientHubOrgConfig();
      expect(config).toEqual(DEFAULT_CLIENT_HUB_CONFIG);
      expect(mockDb.clientHubOrgConfig.findUnique).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
      });
    });

    it("loads stored org configuration from database when present", async () => {
      setupAuth();
      const mockSavedConfig = {
        ...DEFAULT_CLIENT_HUB_CONFIG,
        homeDashboard: {
          ...DEFAULT_CLIENT_HUB_CONFIG.homeDashboard,
          heroTitle: "Customized Business Hub Title",
        },
      };

      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue({
        organizationId: ORG_ID,
        config: mockSavedConfig,
      });

      const config = await getClientHubOrgConfig();
      expect(config.homeDashboard.heroTitle).toBe("Customized Business Hub Title");
      expect(config).toEqual(mockSavedConfig);
    });
  });

  describe("updateClientHubOrgConfig (save defaults)", () => {
    it("successfully validates and upserts new default configuration when admin", async () => {
      setupAuth(ORG_ID, USER_ID, "admin");
      mockDb.clientHubOrgConfig.upsert.mockResolvedValue({ id: "rec_1" });

      const updated = {
        ...DEFAULT_CLIENT_HUB_CONFIG,
        about: {
          ...DEFAULT_CLIENT_HUB_CONFIG.about,
          heading: "Fullypersisted about us heading",
        },
      };

      const result = await updateClientHubOrgConfig(updated);
      expect(result.success).toBe(true);
      expect(mockDb.clientHubOrgConfig.upsert).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        create: {
          organizationId: ORG_ID,
          config: updated,
        },
        update: {
          config: updated,
        },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/app/settings/portal/client-hub");
    });

    it("authorizes only admin/owner roles and rejects members", async () => {
      setupAuth(ORG_ID, USER_ID, "member");

      const result = await updateClientHubOrgConfig(DEFAULT_CLIENT_HUB_CONFIG);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Only administrators");
      expect(mockDb.clientHubOrgConfig.upsert).not.toHaveBeenCalled();
    });

    it("validates data payload with Zod schema and rejects invalid colors", async () => {
      setupAuth(ORG_ID, USER_ID, "owner");

      const invalidPayload = {
        ...DEFAULT_CLIENT_HUB_CONFIG,
        branding: {
          ...DEFAULT_CLIENT_HUB_CONFIG.branding,
          accentColor: "invalid-color-not-hex",
        },
      };

      const result = await updateClientHubOrgConfig(invalidPayload);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid configuration values");
      expect(mockDb.clientHubOrgConfig.upsert).not.toHaveBeenCalled();
    });
  });

  describe("getPersistedHubConfig (public portal resolver)", () => {
    it("resolves stored config for valid organization slug", async () => {
      const mockSavedConfig = {
        ...DEFAULT_CLIENT_HUB_CONFIG,
        contact: {
          ...DEFAULT_CLIENT_HUB_CONFIG.contact,
          supportEmail: "hello-world@custom.com",
        },
      };

      mockDb.organization.findUnique.mockResolvedValue({
        id: "org_987",
        clientHubOrgConfig: { config: mockSavedConfig },
      });

      const config = await getPersistedHubConfig("valid-slug");
      expect(config.contact.supportEmail).toBe("hello-world@custom.com");
      expect(mockDb.organization.findUnique).toHaveBeenCalledWith({
        where: { slug: "valid-slug" },
        select: {
          clientHubOrgConfig: { select: { config: true } },
        },
      });
    });

    it("safely falls back to default settings when organization exists but has no custom defaults stored", async () => {
      mockDb.organization.findUnique.mockResolvedValue({
        id: "org_987",
        clientHubOrgConfig: null,
      });

      const config = await getPersistedHubConfig("another-slug");
      expect(config).toEqual(DEFAULT_CLIENT_HUB_CONFIG);
    });

    it("throws 404 when organization slug is not found in database", async () => {
      mockDb.organization.findUnique.mockResolvedValue(null);

      await expect(getPersistedHubConfig("missing-slug")).rejects.toThrow("404");
    });
  });
});
