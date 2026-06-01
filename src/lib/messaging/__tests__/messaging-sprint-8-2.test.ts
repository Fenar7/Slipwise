import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => {
  const mocks = {
    member: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    calendarConnection: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    messagingAuditEvent: {
      create: vi.fn(),
    },
  };
  const db = {
    ...mocks,
    $transaction: vi.fn((cb: unknown) => {
      if (typeof cb === "function") {
        return (cb as (tx: typeof mocks) => Promise<unknown>)(mocks);
      }
      return Promise.resolve();
    }),
  };
  return { db };
});

import { db } from "@/lib/db";
import {
  connectCalendar,
  disconnectCalendar,
  reconnectCalendar,
  updateConnectionHealth,
  getCalendarConnection,
  listCalendarConnections,
} from "../calendar-connection-service";
import { getCalendarProviderAdapter } from "../calendar-providers";
import { encryptIntegrationSecret, decryptIntegrationSecret } from "../../integrations/secrets";

function mockAdminMember() {
  return {
    id: "member-1",
    orgId: "org-1",
    userId: "user-admin",
    role: "admin",
  };
}

function mockConnectionRow(overrides = {}) {
  return {
    id: "conn-1",
    orgId: "org-1",
    provider: "GOOGLE",
    providerAccountId: "google-acc-1",
    emailAddress: "admin@google.com",
    displayName: "Administrator",
    tokenRef: "opaque-ref-1",
    tokenExpiry: new Date("2026-06-15T12:00:00Z"),
    status: "ACTIVE",
    lastSyncAt: null,
    lastSyncError: null,
    disconnectedAt: null,
    connectedBy: "user-admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Sprint 8.2 — Calendar Connection Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Provider adapters", () => {
    it("returns correct adapter type and constructs authentic provider URLs", () => {
      const googleAdapter = getCalendarProviderAdapter("GOOGLE");
      const outlookAdapter = getCalendarProviderAdapter("OUTLOOK");

      expect(googleAdapter.getProviderType()).toBe("GOOGLE");
      expect(outlookAdapter.getProviderType()).toBe("OUTLOOK");

      const gUrl = googleAdapter.getAuthUrl("state-123", "http://localhost/callback");
      const oUrl = outlookAdapter.getAuthUrl("state-123", "http://localhost/callback");

      expect(gUrl).toContain("accounts.google.com");
      expect(gUrl).toContain("state-123");
      expect(oUrl).toContain("login.microsoftonline.com");
      expect(oUrl).toContain("state-123");
    });

    it("simulates provider code exchanges deterministically", async () => {
      const googleAdapter = getCalendarProviderAdapter("GOOGLE");
      const outlookAdapter = getCalendarProviderAdapter("OUTLOOK");

      const gTokens = await googleAdapter.exchangeCode("google-code-123", "http://localhost/callback");
      const oTokens = await outlookAdapter.exchangeCode("outlook-code-123", "http://localhost/callback");

      expect(gTokens.accessToken).toBe("google-access-google-code-123");
      expect(oTokens.accessToken).toBe("outlook-access-outlook-code-123");
      expect(gTokens.emailAddress).toBe("admin@google-workspace.com");
      expect(oTokens.emailAddress).toBe("admin@outlook-office365.com");
    });
  });

  describe("connectCalendar", () => {
    it("successfully connects a provider for an authorized org admin", async () => {
      const admin = mockAdminMember();
      const conn = mockConnectionRow();

      vi.mocked(db.member.findFirst).mockResolvedValue(admin as any);
      vi.mocked(db.calendarConnection.upsert).mockResolvedValue(conn as any);

      const result = await connectCalendar({
        orgId: "org-1",
        provider: "GOOGLE",
        providerAccountId: "google-acc-1",
        emailAddress: "admin@google.com",
        tokenRef: "encrypted-json-ref",
        connectedBy: "user-admin",
      });

      expect(result.status).toBe("ACTIVE");
      expect(result.providerAccountId).toBe("google-acc-1");
      expect(db.calendarConnection.upsert).toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("rejects connection attempts if user is not an org admin", async () => {
      const nonAdmin = { id: "member-2", role: "member" };
      vi.mocked(db.member.findFirst).mockResolvedValue(nonAdmin as any);

      await expect(
        connectCalendar({
          orgId: "org-1",
          provider: "GOOGLE",
          providerAccountId: "google-acc-1",
          emailAddress: "admin@google.com",
          tokenRef: "encrypted-json-ref",
          connectedBy: "user-member",
        })
      ).rejects.toThrow("connectCalendar: active admin or owner role required");
    });
  });

  describe("disconnectCalendar", () => {
    it("successfully transitions calendar connection to disconnected", async () => {
      const admin = mockAdminMember();
      const conn = mockConnectionRow({ status: "ACTIVE" });
      const disconnectedConn = mockConnectionRow({ status: "DISCONNECTED", disconnectedAt: new Date() });

      vi.mocked(db.member.findFirst).mockResolvedValue(admin as any);
      vi.mocked(db.calendarConnection.findFirst).mockResolvedValue(conn as any);
      vi.mocked(db.calendarConnection.update).mockResolvedValue(disconnectedConn as any);

      const result = await disconnectCalendar({
        orgId: "org-1",
        connectionId: "conn-1",
        disconnectedBy: "user-admin",
      });

      expect(result.status).toBe("DISCONNECTED");
      expect(db.calendarConnection.update).toHaveBeenCalled();
      expect(db.messagingAuditEvent.create).toHaveBeenCalled();
    });

    it("fails if the connection is already disconnected", async () => {
      const admin = mockAdminMember();
      const conn = mockConnectionRow({ status: "DISCONNECTED" });

      vi.mocked(db.member.findFirst).mockResolvedValue(admin as any);
      vi.mocked(db.calendarConnection.findFirst).mockResolvedValue(conn as any);

      await expect(
        disconnectCalendar({
          orgId: "org-1",
          connectionId: "conn-1",
          disconnectedBy: "user-admin",
        })
      ).rejects.toThrow("Calendar is already disconnected");
    });
  });

  describe("reconnectCalendar", () => {
    it("successfully repairs and re-activates a connection with a new token", async () => {
      const admin = mockAdminMember();
      const conn = mockConnectionRow({ status: "RECONNECT_REQUIRED" });
      const reconnectedConn = mockConnectionRow({ status: "ACTIVE", tokenRef: "opaque-ref-new" });

      vi.mocked(db.member.findFirst).mockResolvedValue(admin as any);
      vi.mocked(db.calendarConnection.findFirst).mockResolvedValue(conn as any);
      vi.mocked(db.calendarConnection.update).mockResolvedValue(reconnectedConn as any);

      const result = await reconnectCalendar({
        orgId: "org-1",
        connectionId: "conn-1",
        tokenRef: "opaque-ref-new",
        reconnectedBy: "user-admin",
      });

      expect(result.status).toBe("ACTIVE");
      expect(result.tokenRef).toBe("opaque-ref-new");
      expect(db.calendarConnection.update).toHaveBeenCalled();
    });
  });

  describe("updateConnectionHealth", () => {
    it("updates status and last sync error truthfully for degraded state", async () => {
      const conn = mockConnectionRow({ status: "ACTIVE" });
      const degradedConn = mockConnectionRow({
        status: "ACTIVE",
        lastSyncError: "Provider rate limits exceeded",
      });

      vi.mocked(db.calendarConnection.findFirst).mockResolvedValue(conn as any);
      vi.mocked(db.calendarConnection.update).mockResolvedValue(degradedConn as any);

      const result = await updateConnectionHealth({
        orgId: "org-1",
        connectionId: "conn-1",
        lastSyncError: "Provider rate limits exceeded",
        actorId: "user-admin",
      });

      expect(result.lastSyncError).toBe("Provider rate limits exceeded");
      expect(db.calendarConnection.update).toHaveBeenCalled();
    });
  });
});
