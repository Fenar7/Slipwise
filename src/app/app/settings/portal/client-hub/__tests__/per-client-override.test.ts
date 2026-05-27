import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockRequireOrgContext = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());

const mockDb = vi.hoisted(() => ({
  clientHubOrgConfig: {
    findUnique: vi.fn(),
  },
  clientHubCustomerOverride: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  clientHubCustomerLifecycle: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  customer: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
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

import {
  getClientHubCustomers,
  getClientOverrideEditorState,
  updateClientHubCustomerOverride,
  clearClientHubCustomerOverride,
  getClientHubOrgConfig,
  getClientHubCustomerLifecycle,
  enableClientHubForCustomer,
  disableClientHubForCustomer,
} from "@/app/app/actions/client-hub-actions";
import {
  resolveEffectiveConfig,
  getEffectiveClientHubConfig,
} from "@/app/portal/[orgSlug]/client-hub/components/config-resolver";
import { computeOverrideDiff } from "@/app/portal/[orgSlug]/client-hub/components/customization-contract";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";

// ─── Constants ──────────────────────────────────────────────────────────────

const ORG_ID = "org-123-abc";
const USER_ID = "user-uuid-999";
const CUSTOMER_ID = "cust-456-def";

function setupAuth(orgId = ORG_ID, userId = USER_ID, role = "admin") {
  mockRequireOrgContext.mockResolvedValue({ orgId, userId, role });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Client Hub Per-Client Overrides & Resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("computeOverrideDiff & deepMerge (sparse diffing)", () => {
    it("returns an empty object if edited config is identical to defaults", () => {
      const diff = computeOverrideDiff(DEFAULT_CLIENT_HUB_CONFIG, DEFAULT_CLIENT_HUB_CONFIG);
      expect(diff).toEqual({});
    });

    it("extracts only the modified properties and nests them correctly", () => {
      const edited = {
        ...DEFAULT_CLIENT_HUB_CONFIG,
        branding: {
          ...DEFAULT_CLIENT_HUB_CONFIG.branding,
          accentColor: "#00ff00",
        },
        about: {
          ...DEFAULT_CLIENT_HUB_CONFIG.about,
          heading: "New About Title",
        },
      };

      const diff = computeOverrideDiff(DEFAULT_CLIENT_HUB_CONFIG, edited);
      expect(diff).toEqual({
        branding: { accentColor: "#00ff00" },
        about: { heading: "New About Title" },
      });
    });
  });

  describe("resolveEffectiveConfig (precedence chaining)", () => {
    it("returns org default completely if there is no client override payload", () => {
      const result = resolveEffectiveConfig(DEFAULT_CLIENT_HUB_CONFIG, null);
      expect(result).toEqual(DEFAULT_CLIENT_HUB_CONFIG);
    });

    it("correctly merges partial client override into defaults", () => {
      const override = {
        branding: { accentColor: "#112233" },
        about: { heading: "Client Custom About" },
      };

      const result = resolveEffectiveConfig(DEFAULT_CLIENT_HUB_CONFIG, override);
      expect(result.branding.accentColor).toBe("#112233");
      expect(result.about.heading).toBe("Client Custom About");
      // Unspecified fields should inherit from defaults
      expect(result.branding.removePoweredBy).toBe(DEFAULT_CLIENT_HUB_CONFIG.branding.removePoweredBy);
      expect(result.about.body).toBe(DEFAULT_CLIENT_HUB_CONFIG.about.body);
    });

    it("resiliently ignores invalid override fields and uses defaults", () => {
      const malformedOverride = {
        branding: { accentColor: "invalid-color-not-hex" },
      };

      const result = resolveEffectiveConfig(DEFAULT_CLIENT_HUB_CONFIG, malformedOverride);
      // Fails Zod validation, so gracefully falls back to default accentColor
      expect(result.branding.accentColor).toBe(DEFAULT_CLIENT_HUB_CONFIG.branding.accentColor);
    });
  });

  describe("getEffectiveClientHubConfig (internal resolution helper)", () => {
    it("securely rejects cross-org requests when customer belongs to a different org", async () => {
      mockDb.organization.findUnique.mockResolvedValue({
        clientHubOrgConfig: { config: DEFAULT_CLIENT_HUB_CONFIG },
      });
      // Mock customer belonging to a different org slug
      mockDb.customer.findUnique.mockResolvedValue({
        organization: { slug: "another-org" },
      });

      const config = await getEffectiveClientHubConfig("my-org", CUSTOMER_ID);
      // Customer is in another-org, so returns my-org's defaults (fallback acme DEFAULT)
      expect(config).toEqual(DEFAULT_CLIENT_HUB_CONFIG);
      expect(mockDb.clientHubCustomerOverride.findUnique).not.toHaveBeenCalled();
    });

    it("resolves the client override if active org match succeeds", async () => {
      mockDb.organization.findUnique.mockResolvedValue({
        clientHubOrgConfig: { config: DEFAULT_CLIENT_HUB_CONFIG },
      });
      mockDb.customer.findUnique.mockResolvedValue({
        organization: { slug: "my-org" },
      });
      mockDb.clientHubCustomerOverride.findUnique.mockResolvedValue({
        overrideConfig: { branding: { accentColor: "#aabbcc" } },
      });

      const config = await getEffectiveClientHubConfig("my-org", CUSTOMER_ID);
      expect(config.branding.accentColor).toBe("#aabbcc");
    });
  });

  describe("getClientHubCustomers (listing)", () => {
    it("securely retrieves only customers belonging to active organizationId", async () => {
      setupAuth();
      mockDb.customer.findMany.mockResolvedValue([
        { id: "c1", name: "Alice", email: "alice@test.com" },
      ]);

      const res = await getClientHubCustomers();
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.customers).toHaveLength(1);
        expect(res.customers[0].name).toBe("Alice");
      }
      expect(mockDb.customer.findMany).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      });
    });

    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await getClientHubCustomers();
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.customer.findMany).not.toHaveBeenCalled();
    });

    it("allows owner access", async () => {
      setupAuth(ORG_ID, USER_ID, "owner");
      mockDb.customer.findMany.mockResolvedValue([
        { id: "c1", name: "Alice", email: "alice@test.com" },
      ]);

      const res = await getClientHubCustomers();
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.customers).toHaveLength(1);
      }
    });
  });

  describe("getClientOverrideEditorState (authorization)", () => {
    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await getClientOverrideEditorState(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.customer.findFirst).not.toHaveBeenCalled();
    });

    it("allows admin access", async () => {
      setupAuth(ORG_ID, USER_ID, "admin");
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: "alice@test.com" });
      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue({ config: DEFAULT_CLIENT_HUB_CONFIG });
      mockDb.clientHubCustomerOverride.findUnique.mockResolvedValue(null);

      const res = await getClientOverrideEditorState(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.customer.id).toBe(CUSTOMER_ID);
        expect(res.effectiveConfig).toEqual(DEFAULT_CLIENT_HUB_CONFIG);
      }
    });

    it("allows owner access", async () => {
      setupAuth(ORG_ID, USER_ID, "owner");
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: "alice@test.com" });
      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue({ config: DEFAULT_CLIENT_HUB_CONFIG });
      mockDb.clientHubCustomerOverride.findUnique.mockResolvedValue({
        overrideConfig: { branding: { accentColor: "#aabbcc" } },
      });

      const res = await getClientOverrideEditorState(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.customer.id).toBe(CUSTOMER_ID);
        expect(res.effectiveConfig.branding.accentColor).toBe("#aabbcc");
      }
    });
  });

  describe("updateClientHubCustomerOverride (saving delta)", () => {
    it("enforces admin/owner role and rejects member mutations", async () => {
      setupAuth(ORG_ID, USER_ID, "member");

      const res = await updateClientHubCustomerOverride(CUSTOMER_ID, DEFAULT_CLIENT_HUB_CONFIG);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.clientHubCustomerOverride.upsert).not.toHaveBeenCalled();
    });

    it("enforces customer org scoping boundaries", async () => {
      setupAuth();
      // Mock findFirst returning null indicating customer does not belong to active org
      mockDb.customer.findFirst.mockResolvedValue(null);

      const res = await updateClientHubCustomerOverride(CUSTOMER_ID, DEFAULT_CLIENT_HUB_CONFIG);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Customer context mismatch");
    });

    it("deletes the override record if the computed delta is empty", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID });
      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue({
        config: DEFAULT_CLIENT_HUB_CONFIG,
      });

      const res = await updateClientHubCustomerOverride(CUSTOMER_ID, DEFAULT_CLIENT_HUB_CONFIG);
      expect(res.success).toBe(true);
      expect(res.isCleared).toBe(true);
      expect(mockDb.clientHubCustomerOverride.deleteMany).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID },
      });
      expect(mockDb.clientHubCustomerOverride.upsert).not.toHaveBeenCalled();
    });

    it("upserts the sparse delta when values differ from defaults", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID });
      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue({
        config: DEFAULT_CLIENT_HUB_CONFIG,
      });

      const customConfig = {
        ...DEFAULT_CLIENT_HUB_CONFIG,
        branding: {
          ...DEFAULT_CLIENT_HUB_CONFIG.branding,
          accentColor: "#ff00ff",
        },
      };

      const res = await updateClientHubCustomerOverride(CUSTOMER_ID, customConfig);
      expect(res.success).toBe(true);
      expect(res.isCleared).toBe(false);
      expect(mockDb.clientHubCustomerOverride.upsert).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID },
        create: {
          organizationId: ORG_ID,
          customerId: CUSTOMER_ID,
          overrideConfig: { branding: { accentColor: "#ff00ff" } },
        },
        update: {
          overrideConfig: { branding: { accentColor: "#ff00ff" } },
        },
      });
    });
  });

  describe("clearClientHubCustomerOverride (reset)", () => {
    it("deletes the override record and triggers cache revalidation", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID });

      const res = await clearClientHubCustomerOverride(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockDb.clientHubCustomerOverride.deleteMany).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID },
      });
      expect(mockRevalidatePath).toHaveBeenCalledWith("/app/settings/portal/client-hub");
    });
  });

  describe("getClientHubCustomerLifecycle (readiness)", () => {
    it("returns disabled state when no lifecycle record exists", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue(null);

      const res = await getClientHubCustomerLifecycle(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.readiness.enabled).toBe(false);
        expect(res.readiness.readinessStatus).toBe("disabled");
        expect(res.readiness.previewEligible).toBe(false);
        expect(res.readiness.inviteEligible).toBe(false);
        expect(res.readiness.portalReady).toBe(false);
        expect(res.readiness.blockers).toContain("Client Hub is not enabled for this customer");
      }
    });

    it("returns enabled_ready when enabled and customer has email", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        enabledAt: new Date(),
        disabledAt: null,
        enabledByUserId: USER_ID,
      });

      const res = await getClientHubCustomerLifecycle(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.readiness.enabled).toBe(true);
        expect(res.readiness.readinessStatus).toBe("enabled_ready");
        expect(res.readiness.previewEligible).toBe(true);
        expect(res.readiness.inviteEligible).toBe(true);
        expect(res.readiness.portalReady).toBe(true);
        expect(res.readiness.blockers).toHaveLength(0);
      }
    });

    it("returns enabled_not_ready when enabled but customer lacks email", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: null });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        enabledAt: new Date(),
        disabledAt: null,
        enabledByUserId: USER_ID,
      });

      const res = await getClientHubCustomerLifecycle(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.readiness.readinessStatus).toBe("enabled_not_ready");
        expect(res.readiness.previewEligible).toBe(true);
        expect(res.readiness.inviteEligible).toBe(false);
        expect(res.readiness.portalReady).toBe(false);
        expect(res.readiness.blockers).toContain("Customer email is required for portal invite");
      }
    });

    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await getClientHubCustomerLifecycle(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.clientHubCustomerLifecycle.findUnique).not.toHaveBeenCalled();
    });

    it("rejects cross-org customer", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(null);

      const res = await getClientHubCustomerLifecycle(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Customer not found");
    });
  });

  describe("enableClientHubForCustomer", () => {
    it("upserts lifecycle record with enabled=true", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID });

      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockDb.clientHubCustomerLifecycle.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: CUSTOMER_ID },
          create: expect.objectContaining({ enabled: true, customerId: CUSTOMER_ID, organizationId: ORG_ID }),
          update: expect.objectContaining({ enabled: true }),
        })
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/app/settings/portal/client-hub");
    });

    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.clientHubCustomerLifecycle.upsert).not.toHaveBeenCalled();
    });
  });

  describe("disableClientHubForCustomer", () => {
    it("upserts lifecycle record with enabled=false", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID });

      const res = await disableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockDb.clientHubCustomerLifecycle.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: CUSTOMER_ID },
          create: expect.objectContaining({ enabled: false, customerId: CUSTOMER_ID, organizationId: ORG_ID }),
          update: expect.objectContaining({ enabled: false }),
        })
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/app/settings/portal/client-hub");
    });

    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await disableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.clientHubCustomerLifecycle.upsert).not.toHaveBeenCalled();
    });
  });
});
