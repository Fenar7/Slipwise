import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_CLIENT_HUB_CONFIG } from "@/app/app/settings/portal/client-hub/components/mock-config";

// Hoisted mocks
const mockDb = vi.hoisted(() => {
  const dbObj = {
    $transaction: vi.fn(async (callback) => callback(dbObj)),
    customerPortalAccessLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    externalAccessEvent: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    clientHubOrgConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    clientHubCustomerOverride: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
    brandingProfile: {
      findUnique: vi.fn(),
    },
    orgWhiteLabel: {
      findUnique: vi.fn(),
    },
    orgDomain: {
      findFirst: vi.fn(),
    },
    orgEmailDomain: {
      findFirst: vi.fn(),
    },
    fileAttachment: {
      create: vi.fn(),
    },
    proxyGrant: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };
  return dbObj;
});

const mockRequireOrgContext = vi.hoisted(() => vi.fn().mockResolvedValue({ orgId: "org-1", userId: "user-1", role: "admin" }));
const mockRequireRole = vi.hoisted(() => vi.fn());
const mockLogAuditTx = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLogAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockRevalidatePath = vi.hoisted(() => vi.fn());
const mockRequirePortalSession = vi.hoisted(() => vi.fn().mockResolvedValue({ orgId: "org-1", customerId: "cust-1", orgSlug: "test-org" }));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/auth", () => ({
  requireOrgContext: mockRequireOrgContext,
  requireRole: mockRequireRole,
}));
vi.mock("@/lib/portal-auth", () => ({
  requirePortalSession: mockRequirePortalSession,
  revokePortalSession: vi.fn(),
  checkPortalResendCooldown: vi.fn(),
  logPortalAccess: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({
  logAudit: mockLogAudit,
  logAuditTx: mockLogAuditTx,
}));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("server-only", () => ({}));

import { getPortalAccessLogs } from "@/app/app/settings/portal/actions";
import {
  updateClientHubOrgConfig,
  updateClientHubCustomerOverride,
  clearClientHubCustomerOverride,
} from "@/app/app/actions/client-hub-actions";
import { recordExternalEvent, getPortalAnalyticsSummary } from "@/lib/portal-signals";
import PortalAnalyticsPage from "@/app/app/settings/portal/analytics/page";
import PortalReadinessPage from "@/app/app/settings/portal/readiness/page";
import { uploadPortalAttachmentAction } from "@/app/portal/[orgSlug]/tickets/attachment-actions";

describe("Client Hub Sprint 7.2 Analytics, Supportability, and Audit Closeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to admin role success
    mockRequireRole.mockResolvedValue({ orgId: "org-1", userId: "user-1", role: "admin" });
  });

  describe("Server-Side Admin Role Gating", () => {
    it("allows administrators to access the Portal Analytics page", async () => {
      mockDb.externalAccessEvent.findMany.mockResolvedValue([]);
      mockDb.externalAccessEvent.count.mockResolvedValue(0);

      await expect(
        PortalAnalyticsPage({ searchParams: Promise.resolve({ days: "30" }) })
      ).resolves.not.toThrow();

      expect(mockRequireRole).toHaveBeenCalledWith("admin");
    });

    it("prevents non-admin users from accessing the Portal Analytics page", async () => {
      mockRequireRole.mockRejectedValue(new Error("Insufficient permissions"));

      await expect(
        PortalAnalyticsPage({ searchParams: Promise.resolve({ days: "30" }) })
      ).rejects.toThrow("Insufficient permissions");
    });

    it("allows administrators to access the Portal Readiness page", async () => {
      mockDb.organization.findUnique.mockResolvedValue({
        name: "Test Org",
        slug: "test-org",
        logo: null,
        defaults: {
          portalEnabled: true,
          portalSupportEmail: "support@test.com",
        },
      });
      mockDb.customer.count.mockResolvedValue(0);

      await expect(PortalReadinessPage()).resolves.not.toThrow();
      expect(mockRequireRole).toHaveBeenCalledWith("admin");
    });

    it("prevents non-admin users from accessing the Portal Readiness page", async () => {
      mockRequireRole.mockRejectedValue(new Error("Insufficient permissions"));

      await expect(PortalReadinessPage()).rejects.toThrow("Insufficient permissions");
    });
  });

  describe("Access Logs & Date Boundaries", () => {
    it("safely queries logs with valid dates", async () => {
      mockDb.customerPortalAccessLog.findMany.mockResolvedValue([]);
      mockDb.customerPortalAccessLog.count.mockResolvedValue(0);

      const result = await getPortalAccessLogs("org-1", {
        fromDate: "2026-06-01",
        toDate: "2026-06-05",
      });

      expect(result.logs).toEqual([]);
      expect(mockDb.customerPortalAccessLog.findMany).toHaveBeenCalled();
      const whereClause = mockDb.customerPortalAccessLog.findMany.mock.calls[0][0].where;
      expect(whereClause.accessedAt.gte).toBeInstanceOf(Date);
      expect(whereClause.accessedAt.lte).toBeInstanceOf(Date);
    });

    it("safely ignores invalid date inputs without crashing", async () => {
      mockDb.customerPortalAccessLog.findMany.mockResolvedValue([]);
      mockDb.customerPortalAccessLog.count.mockResolvedValue(0);

      const result = await getPortalAccessLogs("org-1", {
        fromDate: "invalid-date",
        toDate: "another-invalid-date",
      });

      expect(result.logs).toEqual([]);
      const whereClause = mockDb.customerPortalAccessLog.findMany.mock.calls[0][0].where;
      expect(whereClause.accessedAt).toBeUndefined(); // Should omit accessedAt filter if invalid
    });
  });

  describe("Sanitized External Analytics Events", () => {
    it("silently records external access events", async () => {
      mockDb.externalAccessEvent.create.mockResolvedValue({ id: "event-1" });

      await recordExternalEvent({
        orgId: "org-1",
        customerId: "cust-1",
        eventType: "PORTAL_LOGIN",
        ip: "127.0.0.1",
        userAgent: "Chrome",
        metadata: { method: "magic_link" },
      });

      expect(mockDb.externalAccessEvent.create).toHaveBeenCalledWith({
        data: {
          orgId: "org-1",
          customerId: "cust-1",
          userId: null,
          eventType: "PORTAL_LOGIN",
          resourceType: null,
          resourceId: null,
          metadata: { method: "magic_link" },
          ip: "127.0.0.1",
          userAgent: "Chrome",
        },
      });
    });

    it("does not crash if event logging fails", async () => {
      mockDb.externalAccessEvent.create.mockRejectedValue(new Error("Prisma error"));

      await expect(
        recordExternalEvent({
          orgId: "org-1",
          eventType: "QUOTE_VIEWED",
        })
      ).resolves.not.toThrow();
    });

    it("sanitizes file upload metadata by omitting the raw file name", async () => {
      mockDb.fileAttachment.create.mockResolvedValue({ id: "attach-1" });
      mockDb.externalAccessEvent.create.mockResolvedValue({ id: "event-1" });

      const result = await uploadPortalAttachmentAction("sensitive_invoice_invoice123.pdf", 1024, "application/pdf", "portal/attachments/key");

      expect(result.success).toBe(true);
      expect(mockDb.externalAccessEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: "PROOF_UPLOADED",
            metadata: { isTicketAttachment: true, fileSize: 1024 },
          }),
        })
      );
      // Ensure raw file name is NOT logged in metadata to avoid data leaks
      const lastCallData = mockDb.externalAccessEvent.create.mock.calls[0][0].data;
      expect(lastCallData.metadata.fileName).toBeUndefined();
    });
  });

  describe("Truthful Proof Upload Analytics", () => {
    it("excludes ticket reply attachments from the proof-upload KPI count", async () => {
      mockDb.externalAccessEvent.count.mockResolvedValue(0);

      await getPortalAnalyticsSummary("org-1", 30);

      // Verify the count query for PROOF_UPLOADED filters out ticket attachments
      const countCalls = mockDb.externalAccessEvent.count.mock.calls;
      const proofUploadedCall = countCalls.find(
        (call) => call[0].where.eventType === "PROOF_UPLOADED"
      );

      expect(proofUploadedCall).toBeDefined();
      expect(proofUploadedCall[0].where.NOT).toEqual({
        metadata: {
          path: ["isTicketAttachment"],
          equals: true,
        },
      });
    });
  });

  describe("Authoritative Audit Semantics", () => {
    it("transactionally writes audit logs when org config is updated", async () => {
      mockDb.clientHubOrgConfig.upsert.mockResolvedValue({});

      const config = DEFAULT_CLIENT_HUB_CONFIG;
      const result = await updateClientHubOrgConfig(config);

      expect(result.success).toBe(true);
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockLogAuditTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orgId: "org-1",
          actorId: "user-1",
          action: "portal.config_updated",
          entityType: "ClientHubOrgConfig",
          metadata: expect.objectContaining({ config }),
        })
      );
    });

    it("transactionally writes audit logs when customer override is updated", async () => {
      mockDb.customer.findFirst.mockResolvedValue({ id: "cust-1" });
      mockDb.clientHubCustomerOverride.upsert.mockResolvedValue({});
      mockDb.clientHubOrgConfig.findUnique.mockResolvedValue({
        config: DEFAULT_CLIENT_HUB_CONFIG,
      });

      const overrideConfig = {
        ...DEFAULT_CLIENT_HUB_CONFIG,
        branding: {
          ...DEFAULT_CLIENT_HUB_CONFIG.branding,
          removePoweredBy: !DEFAULT_CLIENT_HUB_CONFIG.branding.removePoweredBy,
        },
      };

      const result = await updateClientHubCustomerOverride("cust-1", overrideConfig);

      expect(result.success).toBe(true);
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockLogAuditTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orgId: "org-1",
          actorId: "user-1",
          action: "portal.override_updated",
          entityType: "ClientHubCustomerOverride",
          entityId: "cust-1",
        })
      );
    });

    it("transactionally writes audit logs when customer override is cleared", async () => {
      mockDb.customer.findFirst.mockResolvedValue({ id: "cust-1" });
      mockDb.clientHubCustomerOverride.deleteMany.mockResolvedValue({ count: 1 });

      const result = await clearClientHubCustomerOverride("cust-1");

      expect(result.success).toBe(true);
      expect(mockDb.$transaction).toHaveBeenCalled();
      expect(mockLogAuditTx).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          orgId: "org-1",
          actorId: "user-1",
          action: "portal.override_cleared",
          entityType: "ClientHubCustomerOverride",
          entityId: "cust-1",
        })
      );
    });
  });
});
