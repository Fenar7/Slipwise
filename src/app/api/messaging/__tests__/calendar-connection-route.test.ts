import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/app/api/messaging/_utils", () => {
  const mockAuth = {
    requireMessagingApiContext: vi.fn(),
    messagingApiResponse: vi.fn((data: any, status = 200) => {
      return new Response(JSON.stringify({ success: true, data }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }),
    handleMessagingApiError: vi.fn((err: any) => {
      const status = err.status ?? 500;
      return new Response(
        JSON.stringify({ success: false, error: err.message ?? "Error" }),
        {
          status,
          headers: { "content-type": "application/json" },
        }
      );
    }),
    requireStringField: vi.fn((val: any) => val),
  };
  return mockAuth;
});

vi.mock("@/lib/db", () => {
  return {
    db: {
      member: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
      },
      calendarConnection: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    },
  };
});

vi.mock("@/lib/messaging/calendar-connection-service", () => ({
  listCalendarConnections: vi.fn(),
  disconnectCalendar: vi.fn(),
  reconnectCalendar: vi.fn(),
  connectCalendar: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServer: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })),
    },
  })),
}));

import { requireMessagingApiContext } from "@/app/api/messaging/_utils";
import { db } from "@/lib/db";
import {
  listCalendarConnections,
  disconnectCalendar,
  reconnectCalendar,
} from "@/lib/messaging/calendar-connection-service";
import { GET as listConnections } from "../calendar/connections/route";
import { DELETE as disconnect } from "../calendar/connections/[id]/route";
import { POST as reconnect } from "../calendar/connections/[id]/reconnect/route";
import { GET as connectInitiate } from "../calendar/connections/[provider]/connect/route";
import { GET as connectCallback } from "../calendar/connections/[provider]/callback/route";
import { createCalendarOAuthState, getCalendarOAuthStateCookieName } from "@/lib/messaging/oauth-state";

function makeRequest(url: string, method = "GET", body?: any): NextRequest {
  return new NextRequest(new URL(url), {
    method,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Calendar Connection API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMessagingApiContext).mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
      role: "member",
    });

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
          id_token: "mock-id-token",
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
  });

  describe("GET /api/messaging/calendar/connections", () => {
    it("successfully lists connections in the active organization", async () => {
      const mockConns = [{
        id: "conn-1",
        orgId: "org-1",
        provider: "GOOGLE",
        providerAccountId: "goog-acc-1",
        emailAddress: "admin@example.com",
        displayName: null,
        tokenRef: "secret-ref",
        tokenExpiry: null,
        status: "ACTIVE",
        lastSyncAt: null,
        lastSyncError: null,
        disconnectedAt: null,
        connectedBy: "user-admin",
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
      }];
      vi.mocked(listCalendarConnections).mockResolvedValue(mockConns as any);

      const req = makeRequest("http://localhost/api/messaging/calendar/connections");
      const response = await listConnections(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.connections).toBeDefined();
      expect(json.data.connections).toHaveLength(1);
      expect(json.data.callerRole).toBe("member");
      expect(listCalendarConnections).toHaveBeenCalledWith("org-1");
    });

    it("does not leak tokenRef, tokenExpiry, providerAccountId, or connectedBy in UI payload", async () => {
      // Simulate a full CalendarConnectionRecord coming back from the service
      const fullRecord = {
        id: "conn-safe-1",
        orgId: "org-1",
        provider: "GOOGLE",
        providerAccountId: "goog-internal-id",
        emailAddress: "admin@example.com",
        displayName: "Org Admin",
        tokenRef: "secret-encrypted-ref",
        tokenExpiry: new Date("2026-12-31T00:00:00Z"),
        status: "ACTIVE",
        lastSyncAt: null,
        lastSyncError: null,
        disconnectedAt: null,
        connectedBy: "user-admin-id",
        createdAt: new Date("2026-05-01T00:00:00Z"),
        updatedAt: new Date("2026-06-01T00:00:00Z"),
      };
      vi.mocked(listCalendarConnections).mockResolvedValue([fullRecord] as any);

      const req = makeRequest("http://localhost/api/messaging/calendar/connections");
      const response = await listConnections(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.connections).toHaveLength(1);

      const conn = json.data.connections[0];
      // Safe fields are present
      expect(conn.id).toBe("conn-safe-1");
      expect(conn.provider).toBe("GOOGLE");
      expect(conn.emailAddress).toBe("admin@example.com");
      expect(conn.status).toBe("ACTIVE");

      // Sensitive fields must be absent
      expect(conn.tokenRef).toBeUndefined();
      expect(conn.tokenExpiry).toBeUndefined();
      expect(conn.providerAccountId).toBeUndefined();
      expect(conn.connectedBy).toBeUndefined();
      expect(conn.orgId).toBeUndefined();
    });
  });

  describe("DELETE /api/messaging/calendar/connections/[id]", () => {
    it("successfully disconnects a calendar", async () => {
      const mockConn = { id: "conn-1", status: "DISCONNECTED" };
      vi.mocked(disconnectCalendar).mockResolvedValue(mockConn as any);

      const req = makeRequest("http://localhost/api/messaging/calendar/connections/conn-1", "DELETE");
      const response = await disconnect(req, { params: Promise.resolve({ id: "conn-1" }) });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockConn);
      expect(disconnectCalendar).toHaveBeenCalledWith({
        orgId: "org-1",
        connectionId: "conn-1",
        disconnectedBy: "user-1",
      });
    });
  });

  describe("POST /api/messaging/calendar/connections/[id]/reconnect", () => {
    it("securely executes reconnect flow with client tokenRef", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({ role: "admin" } as any);
      const mockConn = { id: "conn-1", status: "ACTIVE" };
      vi.mocked(reconnectCalendar).mockResolvedValue(mockConn as any);

      const req = makeRequest("http://localhost/api/messaging/calendar/connections/conn-1/reconnect", "POST", {
        tokenRef: "new-token-ref",
      });
      const response = await reconnect(req, { params: Promise.resolve({ id: "conn-1" }) });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toEqual(mockConn);
      expect(reconnectCalendar).toHaveBeenCalledWith({
        orgId: "org-1",
        connectionId: "conn-1",
        tokenRef: "new-token-ref",
        tokenExpiry: null,
        reconnectedBy: "user-1",
      });
    });
  });

  describe("GET /api/messaging/calendar/connections/[provider]/connect", () => {
    it("initiates Google OAuth for org admin", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({ role: "admin" } as any);

      const req = makeRequest("http://localhost/api/messaging/calendar/connections/google/connect");
      const response = await connectInitiate(req, { params: Promise.resolve({ provider: "google" }) });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("accounts.google.com");
      expect(response.cookies.get(getCalendarOAuthStateCookieName("GOOGLE"))).toBeDefined();
    });

    it("rejects connect flow initiation for non-admin", async () => {
      vi.mocked(db.member.findFirst).mockResolvedValue({ role: "member" } as any);

      const req = makeRequest("http://localhost/api/messaging/calendar/connections/google/connect");
      const response = await connectInitiate(req, { params: Promise.resolve({ provider: "google" }) });
      const json = await response.json();

      expect(response.status).toBe(403);
      expect(json.success).toBe(false);
      expect(json.error).toContain("admin or owner role required");
    });
  });

  describe("GET /api/messaging/calendar/connections/[provider]/callback", () => {
    it("rejects callback if anti-forgery state cookie is missing", async () => {
      const req = makeRequest("http://localhost/api/messaging/calendar/connections/google/callback?code=abc&state=xyz");
      const response = await connectCallback(req, { params: Promise.resolve({ provider: "google" }) });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("error=state_missing");
    });

    it("successfully connects provider on valid callback", async () => {
      vi.mocked(db.member.findUnique).mockResolvedValue({ role: "admin" } as any);

      const { state, cookieValue } = createCalendarOAuthState("GOOGLE", "org-1", "user-1");
      const req = makeRequest(`http://localhost/api/messaging/calendar/connections/google/callback?code=auth-code&state=${state}`);
      req.cookies.set(getCalendarOAuthStateCookieName("GOOGLE"), cookieValue);

      const response = await connectCallback(req, { params: Promise.resolve({ provider: "google" }) });

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("connected=google");
    });
  });
});
