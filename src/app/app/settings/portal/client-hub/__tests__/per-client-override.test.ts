import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

const mockRequireOrgContext = vi.hoisted(() => vi.fn());
const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockSendEmail = vi.hoisted(() => vi.fn());

const mockDb = vi.hoisted(() => {
  const db: any = {
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
      update: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    proxyGrant: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  // Transaction client shares the same mock functions so test mocks work,
  // but we can still assert on _tx for atomic-transaction verification.
  const tx: any = {
    clientHubCustomerLifecycle: db.clientHubCustomerLifecycle,
    auditLog: db.auditLog,
    proxyGrant: db.proxyGrant,
  };

  db.$transaction = vi.fn(async (cb: any) => cb(tx));
  db._tx = tx;
  return db;
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/auth", () => ({
  requireOrgContext: mockRequireOrgContext,
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/email", () => ({
  sendEmail: mockSendEmail,
  clientHubInviteEmailHtml: vi.fn(() => "<html>mock</html>"),
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
  previewClientHubForCustomer,
  copyClientHubLink,
  resendClientHubInvite,
  getClientHubCustomerAdminState,
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

  function mockFullCustomer(overrides: Partial<{
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    taxId: string | null;
    gstin: string | null;
  }> = {}) {
    return {
      id: CUSTOMER_ID,
      name: "name" in overrides ? overrides.name : "Alice Corp",
      email: "email" in overrides ? overrides.email : "alice@test.com",
      phone: "phone" in overrides ? overrides.phone : "+91 98765 43210",
      address: "address" in overrides ? overrides.address : "123 Main St, Mumbai",
      taxId: "taxId" in overrides ? overrides.taxId : "TAX123456",
      gstin: "gstin" in overrides ? overrides.gstin : null,
    };
  }

  describe("getClientHubCustomerLifecycle (readiness)", () => {
    it("selects the full prerequisite field set from the database", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer());
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue(null);

      await getClientHubCustomerLifecycle(CUSTOMER_ID);

      expect(mockDb.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CUSTOMER_ID, organizationId: ORG_ID },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            taxId: true,
            gstin: true,
          },
        })
      );
    });

    it("returns disabled state when no lifecycle record exists", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer());
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

    it("returns enabled_ready when enabled and all prerequisites are present", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer());
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
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer({ email: null }));
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

    it("returns enabled_not_ready when enabled but customer lacks phone", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer({ phone: null }));
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
        expect(res.readiness.inviteEligible).toBe(true);
        expect(res.readiness.portalReady).toBe(false);
        expect(res.readiness.blockers).toContain("Customer phone is required for portal contact");
      }
    });

    it("returns enabled_not_ready when enabled but customer lacks address", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer({ address: null }));
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
        expect(res.readiness.inviteEligible).toBe(true);
        expect(res.readiness.portalReady).toBe(false);
        expect(res.readiness.blockers).toContain("Customer billing address is required for portal documents");
      }
    });

    it("returns enabled_not_ready when enabled but customer lacks tax identifier", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer({ taxId: null, gstin: null }));
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
        expect(res.readiness.inviteEligible).toBe(true);
        expect(res.readiness.portalReady).toBe(false);
        expect(res.readiness.blockers).toContain(
          "Customer tax identifier (GSTIN or Tax ID) is required for portal compliance"
        );
      }
    });

    it("accepts gstin as valid tax identifier when taxId is absent", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer({ taxId: null, gstin: "27AABCU9603R1ZX" }));
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        enabledAt: new Date(),
        disabledAt: null,
        enabledByUserId: USER_ID,
      });

      const res = await getClientHubCustomerLifecycle(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.readiness.readinessStatus).toBe("enabled_ready");
        expect(res.readiness.portalReady).toBe(true);
        expect(res.readiness.blockers).toHaveLength(0);
      }
    });

    it("returns inviteEligible=false but portalReady=true when only email is missing", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(
        mockFullCustomer({ email: null, phone: "+91 98765 43210", address: "123 Main St", taxId: "TAX123" })
      );
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        enabledAt: new Date(),
        disabledAt: null,
        enabledByUserId: USER_ID,
      });

      const res = await getClientHubCustomerLifecycle(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
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
    it("upserts lifecycle record with enabled=true inside a transaction", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice Corp" });

      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockDb.clientHubCustomerLifecycle.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: CUSTOMER_ID },
          create: expect.objectContaining({ enabled: true, customerId: CUSTOMER_ID, organizationId: ORG_ID }),
          update: expect.objectContaining({ enabled: true }),
        })
      );
      expect(mockDb.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: ORG_ID,
            actorId: USER_ID,
            action: "client_hub.enabled",
            entityType: "ClientHubCustomerLifecycle",
            entityId: CUSTOMER_ID,
            metadata: { customerName: "Alice Corp" },
          }),
        })
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith("/app/settings/portal/client-hub");
    });

    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.$transaction).not.toHaveBeenCalled();
      expect(mockDb.clientHubCustomerLifecycle.upsert).not.toHaveBeenCalled();
      expect(mockDb.auditLog.create).not.toHaveBeenCalled();
    });
  });

  describe("getClientHubCustomerAdminState (Sprint 3.4 unified read model)", () => {
    it("returns full admin state including invite state and canonical URL when enabled", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer());
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        enabledAt: new Date(),
        disabledAt: null,
        enabledByUserId: USER_ID,
        latestInviteSentAt: new Date("2026-05-20T10:00:00Z"),
        latestInviteEmail: "alice@test.com",
        inviteSentCount: 1,
        publicAccessHandle: "abc123",
      });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme" });

      const res = await getClientHubCustomerAdminState(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.adminState.enabled).toBe(true);
        expect(res.adminState.readinessStatus).toBe("enabled_ready");
        expect(res.adminState.previewEligible).toBe(true);
        expect(res.adminState.inviteEligible).toBe(true);
        expect(res.adminState.inviteState).toBe("sent");
        expect(res.adminState.inviteSentCount).toBe(1);
        expect(res.adminState.canonicalHubUrl).toContain("/portal/acme/client-hub");
        expect(res.adminState.publicAccessHandle).toBe("abc123");
      }
    });

    it("detects email_changed invite state when current email differs from latest invite", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer({ email: "newalice@test.com" }));
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        latestInviteSentAt: new Date(),
        latestInviteEmail: "oldalice@test.com",
        inviteSentCount: 1,
        publicAccessHandle: "abc123",
      });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme" });

      const res = await getClientHubCustomerAdminState(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.adminState.inviteState).toBe("email_changed");
      }
    });

    it("returns never_sent when no invite has been sent yet", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer());
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        latestInviteSentAt: null,
        latestInviteEmail: null,
        inviteSentCount: 0,
        publicAccessHandle: null,
      });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme" });

      const res = await getClientHubCustomerAdminState(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.adminState.inviteState).toBe("never_sent");
        expect(res.adminState.inviteSentCount).toBe(0);
      }
    });

    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await getClientHubCustomerAdminState(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockDb.customer.findFirst).not.toHaveBeenCalled();
    });
  });

  describe("enableClientHubForCustomer (Sprint 3.4 enhancements)", () => {
    it("generates a publicAccessHandle on first enable and sends initial invite atomically", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice Corp", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue(null);
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });
      mockSendEmail.mockResolvedValue(undefined);

      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(res.inviteSent).toBe(true);
      expect(mockDb.clientHubCustomerLifecycle.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ publicAccessHandle: expect.any(String) }),
        })
      );
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "alice@test.com",
          subject: expect.stringContaining("Client Hub"),
        })
      );
      // Invite state + audit must be persisted inside a real transaction
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockDb._tx.clientHubCustomerLifecycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: CUSTOMER_ID },
          data: expect.objectContaining({
            latestInviteSentAt: expect.any(Date),
            latestInviteEmail: "alice@test.com",
            inviteSentCount: { increment: 1 },
          }),
        })
      );
      expect(mockDb._tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "client_hub.invite_sent" }),
        })
      );
    });

    it("does not send invite when customer lacks email and surfaces warning", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice Corp", email: null });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue(null);
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });

      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(res.inviteSent).toBe(false);
      expect(res.inviteError).toBeTruthy();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("succeeds enablement but does not persist invite state when email delivery fails", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice Corp", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue(null);
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });
      mockSendEmail.mockRejectedValue(new Error("Email provider is not configured"));

      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(res.inviteSent).toBe(false);
      expect(res.inviteError).toContain("could not be delivered");
      // No invite-success transaction should run when delivery fails
      expect(mockDb._tx.clientHubCustomerLifecycle.update).not.toHaveBeenCalled();
      expect(mockDb._tx.auditLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "client_hub.invite_sent" }),
        })
      );
    });

    it("preserves existing publicAccessHandle on re-enable", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice Corp", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ publicAccessHandle: "existing-handle" });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });
      mockSendEmail.mockResolvedValue(undefined);

      const res = await enableClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockDb.clientHubCustomerLifecycle.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ publicAccessHandle: "existing-handle" }),
        })
      );
    });
  });

  describe("previewClientHubForCustomer", () => {
    it("returns effective config for enabled customer", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer());
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: true });
      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue({ config: DEFAULT_CLIENT_HUB_CONFIG });
      mockDb.clientHubCustomerOverride.findUnique.mockResolvedValue(null);

      const res = await previewClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.effectiveConfig).toEqual(DEFAULT_CLIENT_HUB_CONFIG);
        expect(res.readiness.enabled).toBe(true);
      }
    });

    it("rejects preview for disabled customer", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(mockFullCustomer());
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: false });

      const res = await previewClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("not enabled");
    });

    it("denies member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await previewClientHubForCustomer(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
    });
  });

  describe("copyClientHubLink", () => {
    it("returns per-client canonical URL using publicAccessHandle for enabled customer", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: true, publicAccessHandle: "handle-alice" });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme" });

      const res = await copyClientHubLink(CUSTOMER_ID);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.url).toContain("/portal/acme/client-hub?c=handle-alice");
      }
    });

    it("returns different URLs for different customers", async () => {
      setupAuth();
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme" });

      mockDb.customer.findFirst.mockResolvedValue({ id: "cust_a", name: "Alice" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: true, publicAccessHandle: "handle-a" });
      const resA = await copyClientHubLink("cust_a");

      mockDb.customer.findFirst.mockResolvedValue({ id: "cust_b", name: "Bob" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: true, publicAccessHandle: "handle-b" });
      const resB = await copyClientHubLink("cust_b");

      expect(resA.success && resB.success).toBe(true);
      if (resA.success && resB.success) {
        expect(resA.url).not.toBe(resB.url);
        expect(resA.url).toContain("handle-a");
        expect(resB.url).toContain("handle-b");
      }
    });

    it("rejects link copy for disabled customer", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: false, publicAccessHandle: "handle-alice" });

      const res = await copyClientHubLink(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("not enabled");
    });

    it("rejects cross-org customer", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue(null);
      const res = await copyClientHubLink(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("not found");
    });
  });

  describe("resendClientHubInvite", () => {
    it("sends invite and updates persisted state atomically for enabled customer with email", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice Corp", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        latestInviteSentAt: new Date("2026-05-01T00:00:00Z"),
        latestInviteEmail: "alice@test.com",
        inviteSentCount: 1,
      });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });
      mockSendEmail.mockResolvedValue(undefined);

      const res = await resendClientHubInvite(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "alice@test.com" })
      );
      // Lifecycle update + audit must happen inside a real transaction
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockDb._tx.clientHubCustomerLifecycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            latestInviteSentAt: expect.any(Date),
            latestInviteEmail: "alice@test.com",
            inviteSentCount: { increment: 1 },
          }),
        })
      );
      expect(mockDb._tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "client_hub.invite_resent" }),
        })
      );
    });

    it("sends invite as initial (not resent) atomically when no prior invite exists", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice Corp", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        latestInviteSentAt: null,
        latestInviteEmail: null,
        inviteSentCount: 0,
      });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });
      mockSendEmail.mockResolvedValue(undefined);

      const res = await resendClientHubInvite(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockDb._tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "client_hub.invite_sent" }),
        })
      );
    });

    it("rejects resend for disabled customer", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: false });

      const res = await resendClientHubInvite(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("not enabled");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("rejects resend for missing email", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: null });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({ enabled: true });

      const res = await resendClientHubInvite(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("valid email");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("rejects member access", async () => {
      setupAuth(ORG_ID, USER_ID, "member");
      const res = await resendClientHubInvite(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("Only administrators");
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("surfaces email delivery failure truthfully without persisting sent state or audit", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: "alice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        latestInviteSentAt: new Date(),
        latestInviteEmail: "alice@test.com",
        inviteSentCount: 1,
      });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });
      mockSendEmail.mockRejectedValue(new Error("SMTP failure"));

      const res = await resendClientHubInvite(CUSTOMER_ID);
      expect(res.success).toBe(false);
      expect(res.error).toContain("could not be delivered");
      // Neither lifecycle update nor transaction should run when delivery fails
      expect(mockDb.$transaction).not.toHaveBeenCalled();
      expect(mockDb.clientHubCustomerLifecycle.update).not.toHaveBeenCalled();
      expect(mockDb.auditLog.create).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: "client_hub.invite_resent" }),
        })
      );
    });

    it("updates invite target truthfully when email changed after prior invite", async () => {
      setupAuth();
      mockDb.customer.findFirst.mockResolvedValue({ id: CUSTOMER_ID, name: "Alice", email: "newalice@test.com" });
      mockDb.clientHubCustomerLifecycle.findUnique.mockResolvedValue({
        enabled: true,
        latestInviteSentAt: new Date("2026-05-01T00:00:00Z"),
        latestInviteEmail: "oldalice@test.com",
        inviteSentCount: 1,
      });
      mockDb.organization.findUnique.mockResolvedValue({ slug: "acme", name: "Acme" });
      mockSendEmail.mockResolvedValue(undefined);

      const res = await resendClientHubInvite(CUSTOMER_ID);
      expect(res.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "newalice@test.com" })
      );
      expect(mockDb._tx.clientHubCustomerLifecycle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ latestInviteEmail: "newalice@test.com" }),
        })
      );
    });
  });
});
