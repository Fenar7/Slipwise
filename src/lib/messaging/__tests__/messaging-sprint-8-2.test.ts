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
import { toCalendarConnectionSummary } from "../mappers";

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
      // Ensure env vars are present so getAuthUrl does not fail closed
      vi.stubEnv("GOOGLE_CLIENT_ID", "mock-g-client-id");
      vi.stubEnv("OUTLOOK_CLIENT_ID", "mock-o-client-id");

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

    it("getAuthUrl fails closed when GOOGLE_CLIENT_ID is missing", () => {
      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      const googleAdapter = getCalendarProviderAdapter("GOOGLE");
      expect(() =>
        googleAdapter.getAuthUrl("state-abc", "http://localhost/callback")
      ).toThrow("Google Calendar integration is not configured: missing GOOGLE_CLIENT_ID");
    });

    it("getAuthUrl fails closed when OUTLOOK_CLIENT_ID is missing", () => {
      vi.stubEnv("OUTLOOK_CLIENT_ID", "");
      const outlookAdapter = getCalendarProviderAdapter("OUTLOOK");
      expect(() =>
        outlookAdapter.getAuthUrl("state-abc", "http://localhost/callback")
      ).toThrow("Outlook Calendar integration is not configured: missing OUTLOOK_CLIENT_ID");
    });

    it("handles real provider code exchanges with mock fetch responses", async () => {
      // 1. Test missing environment variables
      const googleAdapter = getCalendarProviderAdapter("GOOGLE");
      const outlookAdapter = getCalendarProviderAdapter("OUTLOOK");

      vi.stubEnv("GOOGLE_CLIENT_ID", "");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
      vi.stubEnv("OUTLOOK_CLIENT_ID", "");
      vi.stubEnv("OUTLOOK_CLIENT_SECRET", "");

      await expect(
        googleAdapter.exchangeCode("google-code-123", "http://localhost/callback")
      ).rejects.toThrow("Google Calendar integration is not configured");

      await expect(
        outlookAdapter.exchangeCode("outlook-code-123", "http://localhost/callback")
      ).rejects.toThrow("Outlook Calendar integration is not configured");

      // 2. Test successful exchanges with environment variables and mocked fetch calls
      vi.stubEnv("GOOGLE_CLIENT_ID", "mock-g-client-id");
      vi.stubEnv("GOOGLE_CLIENT_SECRET", "mock-g-client-secret");
      vi.stubEnv("OUTLOOK_CLIENT_ID", "mock-o-client-id");
      vi.stubEnv("OUTLOOK_CLIENT_SECRET", "mock-o-client-secret");

      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("oauth2.googleapis.com/token")) {
          return Promise.resolve(new Response(JSON.stringify({
            access_token: "google-access-token-123",
            refresh_token: "google-refresh-token-123",
            expires_in: 3600,
          }), { status: 200 }));
        }
        if (url.includes("googleapis.com/oauth2/v3/userinfo")) {
          return Promise.resolve(new Response(JSON.stringify({
            sub: "google-sub-123",
            email: "admin@google-workspace.com",
            name: "Google Org Administrator",
          }), { status: 200 }));
        }
        if (url.includes("login.microsoftonline.com")) {
          return Promise.resolve(new Response(JSON.stringify({
            access_token: "outlook-access-token-123",
            refresh_token: "outlook-refresh-token-123",
            expires_in: 3600,
          }), { status: 200 }));
        }
        if (url.includes("graph.microsoft.com/v1.0/me")) {
          return Promise.resolve(new Response(JSON.stringify({
            id: "outlook-id-123",
            mail: "admin@outlook-office365.com",
            displayName: "Outlook Org Administrator",
          }), { status: 200 }));
        }
        return Promise.reject(new Error(`Unhandled mock fetch for ${url}`));
      });
      vi.stubGlobal("fetch", mockFetch);

      const gTokens = await googleAdapter.exchangeCode("google-code-123", "http://localhost/callback");
      const oTokens = await outlookAdapter.exchangeCode("outlook-code-123", "http://localhost/callback");

      expect(gTokens.accessToken).toBe("google-access-token-123");
      expect(gTokens.providerAccountId).toBe("google-sub-123");
      expect(gTokens.emailAddress).toBe("admin@google-workspace.com");

      expect(oTokens.accessToken).toBe("outlook-access-token-123");
      expect(oTokens.providerAccountId).toBe("outlook-id-123");
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

  describe("CalendarConnectionSummary — no-leak shape", () => {
    it("toCalendarConnectionSummary omits tokenRef, tokenExpiry, providerAccountId, connectedBy, orgId, updatedAt", () => {
      const record = {
        id: "conn-safe",
        orgId: "org-1",
        provider: "GOOGLE" as const,
        providerAccountId: "should-not-appear",
        emailAddress: "admin@example.com",
        displayName: "Org Admin",
        tokenRef: "secret-token-ref",
        tokenExpiry: new Date("2026-12-31T00:00:00Z"),
        status: "ACTIVE" as const,
        lastSyncAt: new Date("2026-06-01T10:00:00Z"),
        lastSyncError: null,
        disconnectedAt: null,
        connectedBy: "user-admin-id",
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
      };

      const summary = toCalendarConnectionSummary(record);

      // Safe fields present
      expect(summary.id).toBe("conn-safe");
      expect(summary.provider).toBe("GOOGLE");
      expect(summary.emailAddress).toBe("admin@example.com");
      expect(summary.displayName).toBe("Org Admin");
      expect(summary.status).toBe("ACTIVE");
      expect(summary.lastSyncError).toBeNull();
      expect(summary.disconnectedAt).toBeNull();
      expect(summary.createdAt).toBe("2026-05-01T00:00:00.000Z");

      // Sensitive fields must NOT appear
      expect((summary as any).tokenRef).toBeUndefined();
      expect((summary as any).tokenExpiry).toBeUndefined();
      expect((summary as any).providerAccountId).toBeUndefined();
      expect((summary as any).connectedBy).toBeUndefined();
      expect((summary as any).orgId).toBeUndefined();
      expect((summary as any).updatedAt).toBeUndefined();
    });
  });
});
