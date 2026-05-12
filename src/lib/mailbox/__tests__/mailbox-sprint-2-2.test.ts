/**
 * Mailbox Phase 2 Sprint 2.2 — unit tests
 *
 * Covers:
 * - Secure credential store: store, read, rotate, revoke — org scoping
 * - Raw tokens never written to MailboxConnection
 * - tokenRef is opaque (CUID, not a token value)
 * - Gmail provider adapter: error mapping, connect, refresh, verify, disconnect
 * - Gmail OAuth service: callback handling, reconnect-required transitions,
 *   refresh lifecycle, disconnect
 * - Rate-limit constants present for mailbox auth surfaces
 * - Org scoping on all auth/connect/reconnect flows
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  db: {
    mailboxCredential: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    mailboxConnection: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    mailboxAuditEvent: {
      create: vi.fn(),
    },
    member: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/crypto/gateway-secrets", () => ({
  encryptGatewaySecret: vi.fn((plaintext: string) => `encrypted:${plaintext}`),
  decryptGatewaySecret: vi.fn((stored: string) => stored.replace("encrypted:", "")),
}));

// Mock fetch globally for provider HTTP calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { db } from "@/lib/db";
import { encryptGatewaySecret, decryptGatewaySecret } from "@/lib/crypto/gateway-secrets";

import {
  storeMailboxCredential,
  readMailboxCredential,
  rotateMailboxCredential,
  revokeMailboxCredential,
} from "@/lib/mailbox/credential-store";
import type { MailboxCredentialPayload } from "@/lib/mailbox/credential-store";

import { RATE_LIMITS } from "@/lib/rate-limit";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORG_A = "org-aaa";
const ORG_B = "org-bbb";
const TOKEN_REF = "cred-cuid-001";

const SAMPLE_PAYLOAD: MailboxCredentialPayload = {
  accessToken: "ya29.access-token",
  refreshToken: "1//refresh-token",
  expiresAtMs: Date.now() + 3600_000,
  tokenType: "Bearer",
  scope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email",
};

const mockDb = db as unknown as {
  mailboxCredential: {
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  mailboxConnection: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  mailboxAuditEvent: { create: ReturnType<typeof vi.fn> };
  member: { findUnique: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

function setupTransaction() {
  mockDb.$transaction.mockImplementation(
    async (cb: (tx: typeof mockDb) => Promise<unknown>) => cb(mockDb),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default env vars for Gmail config
  process.env.GMAIL_CLIENT_ID = "test-client-id";
  process.env.GMAIL_CLIENT_SECRET = "test-client-secret";
  process.env.GMAIL_REDIRECT_URI = "http://localhost:3001/api/mailbox/gmail/callback";
});

// ─── Credential store ─────────────────────────────────────────────────────────

describe("storeMailboxCredential", () => {
  it("encrypts the payload before writing to DB", async () => {
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });

    await storeMailboxCredential(ORG_A, SAMPLE_PAYLOAD);

    expect(encryptGatewaySecret).toHaveBeenCalledWith(
      JSON.stringify(SAMPLE_PAYLOAD),
    );
    expect(mockDb.mailboxCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orgId: ORG_A,
          encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
        }),
      }),
    );
  });

  it("returns the credential row id as the opaque tokenRef", async () => {
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });
    const ref = await storeMailboxCredential(ORG_A, SAMPLE_PAYLOAD);
    expect(ref).toBe(TOKEN_REF);
  });

  it("tokenRef does not contain the raw access token", async () => {
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });
    const ref = await storeMailboxCredential(ORG_A, SAMPLE_PAYLOAD);
    expect(ref).not.toContain("ya29");
    expect(ref).not.toContain("access-token");
    expect(ref).not.toContain("refresh-token");
  });
});

describe("readMailboxCredential", () => {
  it("returns null when credential does not exist", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue(null);
    const result = await readMailboxCredential(ORG_A, TOKEN_REF);
    expect(result).toBeNull();
  });

  it("scopes the query to orgId — cannot read another org's credential", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue(null);
    await readMailboxCredential(ORG_B, TOKEN_REF);
    expect(mockDb.mailboxCredential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TOKEN_REF, orgId: ORG_B } }),
    );
  });

  it("decrypts and returns the payload", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    const result = await readMailboxCredential(ORG_A, TOKEN_REF);
    expect(result).toEqual(SAMPLE_PAYLOAD);
    expect(decryptGatewaySecret).toHaveBeenCalled();
  });

  it("returns null on decryption failure (does not throw)", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: "corrupted-data",
    });
    (decryptGatewaySecret as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("decryption failed");
    });
    const result = await readMailboxCredential(ORG_A, TOKEN_REF);
    expect(result).toBeNull();
  });
});

describe("rotateMailboxCredential", () => {
  it("throws when credential does not exist for org", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue(null);
    await expect(
      rotateMailboxCredential(ORG_A, TOKEN_REF, SAMPLE_PAYLOAD),
    ).rejects.toThrow();
    expect(mockDb.mailboxCredential.update).not.toHaveBeenCalled();
  });

  it("encrypts the new payload and updates in-place", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({ id: TOKEN_REF });
    mockDb.mailboxCredential.update.mockResolvedValue({});

    const newPayload: MailboxCredentialPayload = {
      ...SAMPLE_PAYLOAD,
      accessToken: "ya29.new-access-token",
    };
    await rotateMailboxCredential(ORG_A, TOKEN_REF, newPayload);

    expect(mockDb.mailboxCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TOKEN_REF },
        data: expect.objectContaining({
          encryptedPayload: `encrypted:${JSON.stringify(newPayload)}`,
        }),
      }),
    );
  });

  it("does not change the tokenRef (same id)", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({ id: TOKEN_REF });
    mockDb.mailboxCredential.update.mockResolvedValue({});
    // rotate does not return a new id — the tokenRef stays the same
    await rotateMailboxCredential(ORG_A, TOKEN_REF, SAMPLE_PAYLOAD);
    expect(mockDb.mailboxCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TOKEN_REF } }),
    );
  });
});

describe("revokeMailboxCredential", () => {
  it("deletes the credential scoped to orgId", async () => {
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });
    await revokeMailboxCredential(ORG_A, TOKEN_REF);
    expect(mockDb.mailboxCredential.deleteMany).toHaveBeenCalledWith({
      where: { id: TOKEN_REF, orgId: ORG_A },
    });
  });

  it("does not throw on DB failure (best-effort)", async () => {
    mockDb.mailboxCredential.deleteMany.mockRejectedValue(new Error("DB error"));
    await expect(revokeMailboxCredential(ORG_A, TOKEN_REF)).resolves.not.toThrow();
  });
});

// ─── Rate-limit constants ─────────────────────────────────────────────────────

describe("RATE_LIMITS — mailbox auth surfaces", () => {
  it("has mailboxConnect limit", () => {
    expect(RATE_LIMITS.mailboxConnect).toBeDefined();
    expect(RATE_LIMITS.mailboxConnect.maxRequests).toBeGreaterThan(0);
  });

  it("has mailboxReconnect limit", () => {
    expect(RATE_LIMITS.mailboxReconnect).toBeDefined();
    expect(RATE_LIMITS.mailboxReconnect.maxRequests).toBeGreaterThan(0);
  });

  it("has mailboxTokenRefresh limit", () => {
    expect(RATE_LIMITS.mailboxTokenRefresh).toBeDefined();
    expect(RATE_LIMITS.mailboxTokenRefresh.maxRequests).toBeGreaterThan(0);
  });
});

// ─── Gmail provider adapter ───────────────────────────────────────────────────

import { gmailProviderAdapter, buildGmailAuthUrl, GMAIL_OAUTH_SCOPES } from "@/lib/mailbox/gmail-provider";
import { isMailboxProviderError } from "@/lib/mailbox/provider-contracts";

function mockTokenResponse(overrides: Record<string, unknown> = {}) {
  return {
    access_token: "ya29.new-access",
    refresh_token: "1//new-refresh",
    expires_in: 3600,
    token_type: "Bearer",
    scope: GMAIL_OAUTH_SCOPES,
    ...overrides,
  };
}

function mockUserInfo(overrides: Record<string, unknown> = {}) {
  return {
    sub: "google-uid-123",
    email: "ops@example.com",
    name: "Ops Inbox",
    email_verified: true,
    ...overrides,
  };
}

function mockGmailProfile() {
  return { emailAddress: "ops@example.com", messagesTotal: 42 };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    clone: () => ({ json: async () => body }),
    json: async () => body,
  };
}

describe("buildGmailAuthUrl", () => {
  it("includes required OAuth params", () => {
    const url = buildGmailAuthUrl("test-state-abc");
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("response_type=code");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("state=test-state-abc");
  });

  it("includes least-privilege scopes only", () => {
    const url = buildGmailAuthUrl("s");
    expect(url).toContain("gmail.readonly");
    expect(url).toContain("userinfo.email");
    // Must NOT include send scope (Sprint 2.3+)
    expect(url).not.toContain("gmail.send");
    expect(url).not.toContain("gmail.compose");
    expect(url).not.toContain("gmail.modify");
  });
});

describe("gmailProviderAdapter.connect", () => {
  it("returns MailboxConnectionIdentity on success", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTokenResponse()))   // token exchange
      .mockResolvedValueOnce(jsonResponse(mockUserInfo()));        // userinfo

    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });

    const result = await gmailProviderAdapter.connect({
      orgId: ORG_A,
      authorizationCode: "auth-code-xyz",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(isMailboxProviderError(result)).toBe(false);
    if (!isMailboxProviderError(result)) {
      expect(result.providerAccountId).toBe("google-uid-123");
      expect(result.emailAddress).toBe("ops@example.com");
      expect(result.tokenRef).toBe(TOKEN_REF);
      // tokenRef must not be the raw token
      expect(result.tokenRef).not.toContain("ya29");
    }
  });

  it("does not expose raw tokens in the returned identity", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTokenResponse()))
      .mockResolvedValueOnce(jsonResponse(mockUserInfo()));
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });

    const result = await gmailProviderAdapter.connect({
      orgId: ORG_A,
      authorizationCode: "code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(isMailboxProviderError(result)).toBe(false);
    if (!isMailboxProviderError(result)) {
      const resultStr = JSON.stringify(result);
      expect(resultStr).not.toContain("ya29");
      expect(resultStr).not.toContain("refresh");
    }
  });

  it("maps 401 token response to auth_expired error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "invalid_grant" }, 401),
    );

    const result = await gmailProviderAdapter.connect({
      orgId: ORG_A,
      authorizationCode: "bad-code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(isMailboxProviderError(result)).toBe(true);
    if (isMailboxProviderError(result)) {
      expect(result.category).toBe("auth_expired");
      expect(result.retryable).toBe(false);
    }
  });

  it("maps 429 to rate_limited error", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ error: "rateLimitExceeded" }, 429),
    );

    const result = await gmailProviderAdapter.connect({
      orgId: ORG_A,
      authorizationCode: "code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(isMailboxProviderError(result)).toBe(true);
    if (isMailboxProviderError(result)) {
      expect(result.category).toBe("rate_limited");
      expect(result.retryable).toBe(true);
    }
  });

  it("maps 500 to provider_unavailable (retryable)", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 500));

    const result = await gmailProviderAdapter.connect({
      orgId: ORG_A,
      authorizationCode: "code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(isMailboxProviderError(result)).toBe(true);
    if (isMailboxProviderError(result)) {
      expect(result.category).toBe("provider_unavailable");
      expect(result.retryable).toBe(true);
    }
  });
});

describe("gmailProviderAdapter.refreshAuthorization", () => {
  it("returns updated tokenRef and tokenExpiry on success", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockDb.mailboxCredential.update.mockResolvedValue({});
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTokenResponse()));

    const result = await gmailProviderAdapter.refreshAuthorization({
      orgId: ORG_A,
      tokenRef: TOKEN_REF,
    });

    expect(isMailboxProviderError(result)).toBe(false);
    if (!isMailboxProviderError(result)) {
      expect(result.tokenRef).toBe(TOKEN_REF);
      expect(result.tokenExpiry).toBeInstanceOf(Date);
    }
  });

  it("returns auth_expired when credential is missing", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue(null);

    const result = await gmailProviderAdapter.refreshAuthorization({
      orgId: ORG_A,
      tokenRef: TOKEN_REF,
    });

    expect(isMailboxProviderError(result)).toBe(true);
    if (isMailboxProviderError(result)) {
      expect(result.category).toBe("auth_expired");
    }
  });

  it("returns auth_expired when refresh token is null", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify({ ...SAMPLE_PAYLOAD, refreshToken: null })}`,
    });

    const result = await gmailProviderAdapter.refreshAuthorization({
      orgId: ORG_A,
      tokenRef: TOKEN_REF,
    });

    expect(isMailboxProviderError(result)).toBe(true);
    if (isMailboxProviderError(result)) {
      expect(result.category).toBe("auth_expired");
    }
  });

  it("retains existing refresh token when Google does not return a new one", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockDb.mailboxCredential.update.mockResolvedValue({});
    // Google response without refresh_token
    mockFetch.mockResolvedValueOnce(
      jsonResponse(mockTokenResponse({ refresh_token: undefined })),
    );

    await gmailProviderAdapter.refreshAuthorization({ orgId: ORG_A, tokenRef: TOKEN_REF });

    const updateCall = mockDb.mailboxCredential.update.mock.calls[0][0];
    const storedPayload = JSON.parse(
      updateCall.data.encryptedPayload.replace("encrypted:", ""),
    ) as MailboxCredentialPayload;
    // Should retain the original refresh token
    expect(storedPayload.refreshToken).toBe(SAMPLE_PAYLOAD.refreshToken);
  });
});

describe("gmailProviderAdapter.verifyConnection", () => {
  it("returns account summary on success", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUserInfo()));

    const result = await gmailProviderAdapter.verifyConnection({
      orgId: ORG_A,
      tokenRef: TOKEN_REF,
    });

    expect(isMailboxProviderError(result)).toBe(false);
    if (!isMailboxProviderError(result)) {
      expect(result.isAccessible).toBe(true);
      expect(result.emailAddress).toBe("ops@example.com");
    }
  });

  it("returns auth_expired when credential is missing", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue(null);

    const result = await gmailProviderAdapter.verifyConnection({
      orgId: ORG_A,
      tokenRef: TOKEN_REF,
    });

    expect(isMailboxProviderError(result)).toBe(true);
    if (isMailboxProviderError(result)) {
      expect(result.category).toBe("auth_expired");
    }
  });
});

describe("gmailProviderAdapter.disconnect", () => {
  it("calls Google revoke endpoint and deletes credential", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce({ ok: true }); // revoke call
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });

    await gmailProviderAdapter.disconnect({ orgId: ORG_A, tokenRef: TOKEN_REF });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("oauth2.googleapis.com/revoke"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(mockDb.mailboxCredential.deleteMany).toHaveBeenCalledWith({
      where: { id: TOKEN_REF, orgId: ORG_A },
    });
  });

  it("still deletes credential even if provider revoke call fails", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      gmailProviderAdapter.disconnect({ orgId: ORG_A, tokenRef: TOKEN_REF }),
    ).resolves.not.toThrow();

    expect(mockDb.mailboxCredential.deleteMany).toHaveBeenCalled();
  });
});

// ─── Gmail OAuth service ──────────────────────────────────────────────────────

import {
  handleGmailCallback,
  refreshGmailAuthorization,
  markConnectionReconnectRequired,
  verifyGmailConnection,
  disconnectGmailMailbox,
} from "@/lib/mailbox/gmail-oauth-service";

// We need connection-service mocked for handleGmailCallback
vi.mock("@/lib/mailbox/connection-service", () => ({
  createMailboxConnection: vi.fn(),
  findMailboxConnectionByProviderAccount: vi.fn(),
  updateMailboxConnectionStatus: vi.fn(),
  getMailboxConnection: vi.fn(),
  listMailboxConnections: vi.fn(),
  disableMailboxConnection: vi.fn(),
}));

import {
  createMailboxConnection,
  findMailboxConnectionByProviderAccount,
} from "@/lib/mailbox/connection-service";

const mockCreateConnection = createMailboxConnection as ReturnType<typeof vi.fn>;
const mockFindByProviderAccount = findMailboxConnectionByProviderAccount as ReturnType<typeof vi.fn>;

function makeConnectionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "conn-001",
    orgId: ORG_A,
    provider: "GMAIL" as const,
    providerAccountId: "google-uid-123",
    emailAddress: "ops@example.com",
    displayName: "Ops Inbox",
    status: "ACTIVE" as const,
    tokenRef: TOKEN_REF,
    tokenExpiry: new Date("2026-06-01T00:00:00Z"),
    watchMetadata: null,
    lastSyncAt: null,
    lastSyncError: null,
    lastSyncErrorCategory: null,
    disabledAt: null,
    connectedBy: "00000000-0000-0000-0000-000000000001",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-05-01T10:00:00Z"),
    ...overrides,
  };
}

describe("handleGmailCallback — new connection", () => {
  it("creates a new connection when no existing connection for this provider account", async () => {
    // Adapter connect: token exchange + userinfo
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTokenResponse()))
      .mockResolvedValueOnce(jsonResponse(mockUserInfo()));
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });

    mockFindByProviderAccount.mockResolvedValue(null);
    mockCreateConnection.mockResolvedValue(makeConnectionRow());

    const result = await handleGmailCallback({
      orgId: ORG_A,
      actorId: "00000000-0000-0000-0000-000000000001",
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.isReconnect).toBe(false);
      expect(result.connection.orgId).toBe(ORG_A);
    }
    expect(mockCreateConnection).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: ORG_A, provider: "GMAIL" }),
    );
  });

  it("does not write raw tokens to MailboxConnection", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTokenResponse()))
      .mockResolvedValueOnce(jsonResponse(mockUserInfo()));
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });
    mockFindByProviderAccount.mockResolvedValue(null);
    mockCreateConnection.mockResolvedValue(makeConnectionRow());

    await handleGmailCallback({
      orgId: ORG_A,
      actorId: "00000000-0000-0000-0000-000000000001",
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    const createArgs = mockCreateConnection.mock.calls[0][0] as Record<string, unknown>;
    // tokenRef must be the opaque CUID, not a raw token
    expect(createArgs.tokenRef).toBe(TOKEN_REF);
    expect(String(createArgs.tokenRef)).not.toContain("ya29");
    expect(String(createArgs.tokenRef)).not.toContain("refresh");
    // No accessToken or refreshToken fields on the connection input
    expect(createArgs).not.toHaveProperty("accessToken");
    expect(createArgs).not.toHaveProperty("refreshToken");
  });

  it("returns auth_failed when token exchange fails", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, 401));

    const result = await handleGmailCallback({
      orgId: ORG_A,
      actorId: "actor-1",
      authorizationCode: "bad-code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("auth_failed");
    }
    expect(mockCreateConnection).not.toHaveBeenCalled();
  });

  it("cleans up credential if connection creation fails", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTokenResponse()))
      .mockResolvedValueOnce(jsonResponse(mockUserInfo()));
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });
    mockFindByProviderAccount.mockResolvedValue(null);
    mockCreateConnection.mockRejectedValue(new Error("DB constraint"));

    // disconnect call for cleanup: credential read + revoke
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce({ ok: true }); // revoke
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });

    const result = await handleGmailCallback({
      orgId: ORG_A,
      actorId: "actor-1",
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("internal_error");
  });
});

describe("handleGmailCallback — reconnect (existing connection)", () => {
  it("updates existing connection instead of creating a duplicate", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTokenResponse()))
      .mockResolvedValueOnce(jsonResponse(mockUserInfo()));
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });
    mockFindByProviderAccount.mockResolvedValue(makeConnectionRow());

    setupTransaction();
    mockDb.mailboxConnection.update.mockResolvedValue(makeConnectionRow());
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const result = await handleGmailCallback({
      orgId: ORG_A,
      actorId: "actor-1",
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.isReconnect).toBe(true);
    // Must NOT create a new connection
    expect(mockCreateConnection).not.toHaveBeenCalled();
    // Must update the existing one
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conn-001" },
        data: expect.objectContaining({ status: "ACTIVE", tokenRef: TOKEN_REF }),
      }),
    );
  });

  it("emits CONNECTION_RECONNECTED audit event on re-authorization", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(mockTokenResponse()))
      .mockResolvedValueOnce(jsonResponse(mockUserInfo()));
    mockDb.mailboxCredential.create.mockResolvedValue({ id: TOKEN_REF });
    mockFindByProviderAccount.mockResolvedValue(makeConnectionRow());

    setupTransaction();
    mockDb.mailboxConnection.update.mockResolvedValue(makeConnectionRow());
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await handleGmailCallback({
      orgId: ORG_A,
      actorId: "actor-1",
      authorizationCode: "auth-code",
      redirectUri: "http://localhost:3001/api/mailbox/gmail/callback",
    });

    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONNECTION_RECONNECTED", orgId: ORG_A }),
      }),
    );
  });
});

describe("refreshGmailAuthorization", () => {
  it("updates tokenExpiry on successful refresh", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockDb.mailboxCredential.update.mockResolvedValue({});
    mockFetch.mockResolvedValueOnce(jsonResponse(mockTokenResponse()));
    mockDb.mailboxConnection.updateMany.mockResolvedValue({ count: 1 });

    const result = await refreshGmailAuthorization({
      orgId: ORG_A,
      connectionId: "conn-001",
      tokenRef: TOKEN_REF,
      actorId: "actor-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tokenExpiry).toBeInstanceOf(Date);
    expect(mockDb.mailboxConnection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "conn-001", orgId: ORG_A },
        data: expect.objectContaining({ tokenExpiry: expect.any(Date) }),
      }),
    );
  });

  it("transitions to RECONNECT_REQUIRED when refresh token is expired", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "invalid_grant" }, 401));

    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRow({ status: "ACTIVE" }),
    );
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: "RECONNECT_REQUIRED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const result = await refreshGmailAuthorization({
      orgId: ORG_A,
      connectionId: "conn-001",
      tokenRef: TOKEN_REF,
      actorId: "actor-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("auth_expired");
      expect(result.reconnectRequired).toBe(true);
    }
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RECONNECT_REQUIRED" }),
      }),
    );
  });
});

describe("markConnectionReconnectRequired", () => {
  it("sets status to RECONNECT_REQUIRED and emits audit event", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRow({ status: "ACTIVE" }),
    );
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: "RECONNECT_REQUIRED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await markConnectionReconnectRequired({
      orgId: ORG_A,
      connectionId: "conn-001",
      actorId: "actor-1",
      reason: "Refresh token expired",
    });

    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "RECONNECT_REQUIRED" }),
      }),
    );
    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONNECTION_DEGRADED", orgId: ORG_A }),
      }),
    );
  });

  it("is idempotent — does not re-emit if already RECONNECT_REQUIRED", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRow({ status: "RECONNECT_REQUIRED" }),
    );

    await markConnectionReconnectRequired({
      orgId: ORG_A,
      connectionId: "conn-001",
      actorId: "actor-1",
      reason: "Already reconnect required",
    });

    expect(mockDb.mailboxConnection.update).not.toHaveBeenCalled();
    expect(mockDb.mailboxAuditEvent.create).not.toHaveBeenCalled();
  });

  it("is a no-op when connection does not belong to org", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);

    await markConnectionReconnectRequired({
      orgId: ORG_B,
      connectionId: "conn-001",
      actorId: "actor-1",
      reason: "test",
    });

    expect(mockDb.mailboxConnection.update).not.toHaveBeenCalled();
  });
});

describe("verifyGmailConnection", () => {
  it("returns ok with email/displayName on success", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse(mockUserInfo()));

    const result = await verifyGmailConnection({
      orgId: ORG_A,
      connectionId: "conn-001",
      tokenRef: TOKEN_REF,
      actorId: "actor-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.emailAddress).toBe("ops@example.com");
    }
  });

  it("transitions to RECONNECT_REQUIRED on auth_expired from verify", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 401));

    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRow({ status: "ACTIVE" }),
    );
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: "RECONNECT_REQUIRED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    const result = await verifyGmailConnection({
      orgId: ORG_A,
      connectionId: "conn-001",
      tokenRef: TOKEN_REF,
      actorId: "actor-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reconnectRequired).toBe(true);
    }
  });
});

describe("disconnectGmailMailbox", () => {
  it("revokes provider auth, deletes credential, sets DISCONNECTED, emits audit", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(
      makeConnectionRow({ tokenRef: TOKEN_REF }),
    );
    // credential read for disconnect
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce({ ok: true }); // revoke
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });
    mockDb.mailboxConnection.update.mockResolvedValue(
      makeConnectionRow({ status: "DISCONNECTED" }),
    );
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});

    await disconnectGmailMailbox({
      orgId: ORG_A,
      connectionId: "conn-001",
      actorId: "actor-1",
    });

    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "DISCONNECTED",
          tokenRef: null,
          tokenExpiry: null,
        }),
      }),
    );
    expect(mockDb.mailboxAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CONNECTION_DISCONNECTED", orgId: ORG_A }),
      }),
    );
  });

  it("throws when connection does not belong to org", async () => {
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);

    await expect(
      disconnectGmailMailbox({ orgId: ORG_B, connectionId: "conn-001", actorId: "actor-1" }),
    ).rejects.toThrow();
  });
});

describe("org scoping invariants", () => {
  it("credential store read uses orgId in query — cannot read cross-org", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue(null);
    await readMailboxCredential(ORG_B, TOKEN_REF);
    const call = mockDb.mailboxCredential.findFirst.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(call.where.orgId).toBe(ORG_B);
    expect(call.where.id).toBe(TOKEN_REF);
  });

  it("credential store revoke uses orgId in deleteMany — cannot delete cross-org", async () => {
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 0 });
    await revokeMailboxCredential(ORG_B, TOKEN_REF);
    expect(mockDb.mailboxCredential.deleteMany).toHaveBeenCalledWith({
      where: { id: TOKEN_REF, orgId: ORG_B },
    });
  });

  it("markConnectionReconnectRequired uses orgId in findFirst", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue(null);

    await markConnectionReconnectRequired({
      orgId: ORG_B,
      connectionId: "conn-001",
      actorId: "actor-1",
      reason: "test",
    });

    expect(mockDb.mailboxConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "conn-001", orgId: ORG_B } }),
    );
  });
});

// ─── Fix 1: Cookie path uses correct prefix ───────────────────────────────────
import {
  getIntegrationOAuthStateCookieOptions,
  getClearedIntegrationOAuthStateCookieOptions,
} from "@/lib/integrations/oauth-state";
describe("getIntegrationOAuthStateCookieOptions — pathPrefix", () => {
  it("uses /api/integrations prefix by default (quickbooks, zoho unchanged)", () => {
    expect(getIntegrationOAuthStateCookieOptions("quickbooks").path).toBe(
      "/api/integrations/quickbooks/callback",
    );
    expect(getIntegrationOAuthStateCookieOptions("zoho").path).toBe(
      "/api/integrations/zoho/callback",
    );
  });
  it("uses /api/mailbox prefix when pathPrefix is /api/mailbox", () => {
    expect(
      getIntegrationOAuthStateCookieOptions("gmail", "/api/mailbox").path,
    ).toBe("/api/mailbox/gmail/callback");
  });
  it("getClearedIntegrationOAuthStateCookieOptions propagates pathPrefix", () => {
    expect(
      getClearedIntegrationOAuthStateCookieOptions("gmail", "/api/mailbox").path,
    ).toBe("/api/mailbox/gmail/callback");
  });
});

// ─── Fix 2: Revoke refresh token on disconnect ────────────────────────────────
describe("gmailProviderAdapter.disconnect — token revocation", () => {
  it("uses refreshToken for revocation when present", async () => {
    const payloadWithRefresh: MailboxCredentialPayload = {
      ...SAMPLE_PAYLOAD,
      accessToken: "ya29.access",
      refreshToken: "1//refresh-token-value",
    };
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(payloadWithRefresh)}`,
    });
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });
    await gmailProviderAdapter.disconnect({ orgId: ORG_A, tokenRef: TOKEN_REF });
    const revokeUrl = mockFetch.mock.calls[0][0] as string;
    expect(revokeUrl).toContain(encodeURIComponent("1//refresh-token-value"));
    expect(revokeUrl).not.toContain("ya29.access");
  });
  it("falls back to accessToken when refreshToken is null", async () => {
    const payloadNoRefresh: MailboxCredentialPayload = {
      ...SAMPLE_PAYLOAD,
      accessToken: "ya29.access-only",
      refreshToken: null,
    };
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(payloadNoRefresh)}`,
    });
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });
    await gmailProviderAdapter.disconnect({ orgId: ORG_A, tokenRef: TOKEN_REF });
    const revokeUrl = mockFetch.mock.calls[0][0] as string;
    expect(revokeUrl).toContain("ya29.access-only");
  });
});

// ─── Fix 3: DB transaction before provider revoke ─────────────────────────────
describe("disconnectGmailMailbox — operation order", () => {
  it("resolves even if provider revoke throws after DB transaction succeeds", async () => {
    setupTransaction();
    mockDb.mailboxConnection.findFirst.mockResolvedValue({
      id: "conn-001",
      orgId: ORG_A,
      tokenRef: TOKEN_REF,
      emailAddress: "test@example.com",
      status: "ACTIVE",
    });
    mockDb.mailboxConnection.update.mockResolvedValue({});
    mockDb.mailboxAuditEvent.create.mockResolvedValue({});
    // Credential read succeeds, but provider fetch throws
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    mockDb.mailboxCredential.deleteMany.mockResolvedValue({ count: 1 });
    await expect(
      disconnectGmailMailbox({ orgId: ORG_A, connectionId: "conn-001", actorId: "actor-1" }),
    ).resolves.toBeUndefined();
    // DB update must have been called before provider revoke attempted
    expect(mockDb.mailboxConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "DISCONNECTED", tokenRef: null }),
      }),
    );
  });
});

// ─── Fix 5: verifyConnection makes only one HTTP call ────────────────────────
describe("gmailProviderAdapter.verifyConnection — single HTTP call", () => {
  it("makes exactly one fetch call to userinfo endpoint", async () => {
    mockDb.mailboxCredential.findFirst.mockResolvedValue({
      encryptedPayload: `encrypted:${JSON.stringify(SAMPLE_PAYLOAD)}`,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        sub: "google-uid-123",
        email: "user@example.com",
        name: "Test User",
      }),
    });
    const result = await gmailProviderAdapter.verifyConnection({
      orgId: ORG_A,
      tokenRef: TOKEN_REF,
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect((mockFetch.mock.calls[0][0] as string)).toContain("userinfo");
    expect(result).toMatchObject({ emailAddress: "user@example.com" });
  });
});

// ─── Fix 6: mailboxDisconnect rate-limit constant ─────────────────────────────
describe("RATE_LIMITS — mailboxDisconnect", () => {
  it("has a dedicated mailboxDisconnect limit separate from mailboxConnect", () => {
    expect(RATE_LIMITS.mailboxDisconnect).toBeDefined();
    expect(RATE_LIMITS.mailboxDisconnect.maxRequests).toBeGreaterThan(0);
    expect(RATE_LIMITS).toHaveProperty("mailboxDisconnect");
  });
});
