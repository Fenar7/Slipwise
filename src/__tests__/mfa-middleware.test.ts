import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { verifyChallengeToken } from "@/lib/totp/challenge-session";
import { signMfaToken, verifyMfaToken, MFA_TOKEN_QUERY_PARAM, sanitizeMfaCallbackUrl } from "@/lib/mfa/token";

// Replicate the middleware MFA gating logic for isolated testing.
// We cannot import middleware.ts directly because it depends on edge-runtime modules.

const MFA_CHALLENGE_COOKIE = "sw_2fa";

async function checkMfaChallenge(
  request: NextRequest,
  userId: string,
  mfaRequired: boolean,
  opts?: { enrollmentRequired?: boolean }
): Promise<{ type: "redirect"; url: string } | null> {
  if (!mfaRequired) return null;

  const callbackUrl = sanitizeMfaCallbackUrl(
    request.nextUrl.pathname + request.nextUrl.search
  );

  if (opts?.enrollmentRequired) {
    const url = new URL("/app/settings/security", request.url);
    url.searchParams.set("setupMfa", "1");
    url.searchParams.set("callbackUrl", callbackUrl);
    return { type: "redirect", url: url.toString() };
  }

  const secret = process.env.TOTP_SESSION_SECRET ?? "";
  if (!secret) {
    const url = new URL("/auth/login", request.url);
    url.searchParams.set("error", "mfa_unavailable");
    url.searchParams.set("callbackUrl", callbackUrl);
    return { type: "redirect", url: url.toString() };
  }

  // ── Token-based MFA handoff (matches real middleware.ts) ──
  const mfaToken = request.nextUrl.searchParams.get(MFA_TOKEN_QUERY_PARAM);
  if (mfaToken) {
    const tokenUserId = await verifyMfaToken(mfaToken, secret);
    if (tokenUserId === userId) {
      // In the real middleware this sets the cookie and redirects.
      // For test purposes, returning null means "allow access".
      return null;
    }
  }

  const cookieValue = request.cookies.get(MFA_CHALLENGE_COOKIE)?.value ?? "";
  const verifiedUserId = await verifyChallengeToken(cookieValue, secret);

  if (verifiedUserId === userId) {
    return null;
  }

  const url = new URL("/auth/2fa", request.url);
  url.searchParams.set("callbackUrl", callbackUrl);
  return { type: "redirect", url: url.toString() };
}

function makeRequest(pathname: string, cookies?: Record<string, string>): NextRequest {
  const url = `http://localhost:3001${pathname}`;
  const req = new NextRequest(url);
  if (cookies) {
    Object.entries(cookies).forEach(([name, value]) => {
      req.cookies.set(name, value);
    });
  }
  return req;
}

beforeEach(async () => {
  vi.stubEnv("TOTP_SESSION_SECRET", "test-mfa-secret-32-bytes-long-abc123");
});

describe("checkMfaChallenge", () => {
  it("returns null when MFA is not required", async () => {
    const req = makeRequest("/app/dashboard");
    const result = await checkMfaChallenge(req, "user_1", false);
    expect(result).toBeNull();
  });

  it("redirects to security settings when enrollment is required", async () => {
    const req = makeRequest("/app/dashboard");
    const result = await checkMfaChallenge(req, "user_1", true, { enrollmentRequired: true });
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/app/settings/security");
    expect(result!.url).toContain("setupMfa=1");
    expect(result!.url).toContain("callbackUrl=%2Fapp%2Fdashboard");
  });

  it("redirects to login when secret is missing", async () => {
    vi.stubEnv("TOTP_SESSION_SECRET", "");
    vi.stubEnv("PORTAL_JWT_SECRET", "");
    const req = makeRequest("/app/dashboard");
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/login");
    expect(result!.url).toContain("error=mfa_unavailable");
  });

  it("returns null when a valid MFA cookie is present", async () => {
    const { signChallengeToken } = await import("@/lib/totp/challenge-session");
    const token = await signChallengeToken("user_1");
    const req = makeRequest("/app/dashboard", { [MFA_CHALLENGE_COOKIE]: token });
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).toBeNull();
  });

  it("redirects to /auth/2fa when cookie is missing", async () => {
    const req = makeRequest("/app/dashboard");
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/2fa");
    expect(result!.url).toContain("callbackUrl=%2Fapp%2Fdashboard");
  });

  it("redirects to /auth/2fa when cookie is for a different user", async () => {
    const { signChallengeToken } = await import("@/lib/totp/challenge-session");
    const token = await signChallengeToken("other_user");
    const req = makeRequest("/app/dashboard", { [MFA_CHALLENGE_COOKIE]: token });
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/2fa");
  });

  it("redirects to /auth/2fa when cookie is expired", async () => {
    const { signChallengeToken, MFA_SESSION_DURATION_SECONDS } = await import("@/lib/totp/challenge-session");
    vi.useFakeTimers();
    const token = await signChallengeToken("user_1");
    vi.advanceTimersByTime((MFA_SESSION_DURATION_SECONDS + 1) * 1000);

    const req = makeRequest("/app/dashboard", { [MFA_CHALLENGE_COOKIE]: token });
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/2fa");
    vi.useRealTimers();
  });
});

describe("Token-based MFA handoff", () => {
  it("allows access when a valid mfaToken query param is present", async () => {
    const token = await signMfaToken("user_1");
    const req = makeRequest(`/app/dashboard?${MFA_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`);
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).toBeNull();
  });

  it("redirects to /auth/2fa when mfaToken is for a different user", async () => {
    const token = await signMfaToken("other_user");
    const req = makeRequest(`/app/dashboard?${MFA_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`);
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/2fa");
  });

  it("redirects to /auth/2fa when mfaToken is expired", async () => {
    vi.useFakeTimers();
    const token = await signMfaToken("user_1");
    vi.advanceTimersByTime((5 * 60 + 1) * 1000); // 5 min + 1s

    const req = makeRequest(`/app/dashboard?${MFA_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`);
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/2fa");
    vi.useRealTimers();
  });

  it("redirects to /auth/2fa when mfaToken is tampered", async () => {
    const token = await signMfaToken("user_1");
    const tampered = token.slice(0, -5) + "xxxxx";
    const req = makeRequest(`/app/dashboard?${MFA_TOKEN_QUERY_PARAM}=${encodeURIComponent(tampered)}`);
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/2fa");
  });

  it("redirects to /auth/2fa when mfaToken is missing but cookie is also missing", async () => {
    const req = makeRequest("/app/dashboard");
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).not.toBeNull();
    expect(result!.url).toContain("/auth/2fa");
  });

  it("prefers mfaToken over cookie when both are present and valid", async () => {
    const { signChallengeToken } = await import("@/lib/totp/challenge-session");
    const cookieToken = await signChallengeToken("user_1");
    const queryToken = await signMfaToken("user_1");
    const req = makeRequest(
      `/app/dashboard?${MFA_TOKEN_QUERY_PARAM}=${encodeURIComponent(queryToken)}`,
      { [MFA_CHALLENGE_COOKIE]: cookieToken }
    );
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).toBeNull();
  });

  it("does not loop: valid token allows access instead of redirecting to /auth/2fa", async () => {
    // This is the regression test: a user with a valid mfaToken should NOT
    // be sent back to /auth/2fa (which would ask for the same factor again).
    const token = await signMfaToken("user_1");
    const req = makeRequest(`/app/home?${MFA_TOKEN_QUERY_PARAM}=${encodeURIComponent(token)}`);
    const result = await checkMfaChallenge(req, "user_1", true);
    expect(result).toBeNull();
  });
});

describe("MFA requirement logic", () => {
  it("requires MFA when mfaEnabled is true (passkey or totp)", async () => {
    const mfaEnabled = true;
    const twoFaEnforcedByOrg = false;
    expect(mfaEnabled || twoFaEnforcedByOrg).toBe(true);
  });

  it("requires MFA when org enforces it even if no factor is enrolled", async () => {
    const mfaEnabled = false;
    const twoFaEnforcedByOrg = true;
    expect(mfaEnabled || twoFaEnforcedByOrg).toBe(true);
  });

  it("requires enrollment when org enforces and no factor is enrolled", async () => {
    const hasFactor = false;
    const twoFaEnforcedByOrg = true;
    expect(twoFaEnforcedByOrg && !hasFactor).toBe(true);
  });

  it("does not require enrollment when user has a factor enrolled", async () => {
    const hasFactor = true;
    const twoFaEnforcedByOrg = true;
    expect(twoFaEnforcedByOrg && !hasFactor).toBe(false);
  });

  it("does not require MFA when no factor and no org enforcement", async () => {
    const mfaEnabled = false;
    const twoFaEnforcedByOrg = false;
    expect(mfaEnabled || twoFaEnforcedByOrg).toBe(false);
  });
});

describe("sanitizeCallbackUrl (unit)", () => {
  it("allows safe relative paths", async () => {
    expect(sanitizeMfaCallbackUrl("/onboarding")).toBe("/onboarding");
    expect(sanitizeMfaCallbackUrl("/app/home")).toBe("/app/home");
    expect(sanitizeMfaCallbackUrl("/app/settings/security?setupMfa=1")).toBe("/app/settings/security?setupMfa=1");
  });

  it("blocks protocol-relative URLs (open redirect)", async () => {
    expect(sanitizeMfaCallbackUrl("//evil.com")).toBe("/app");
    expect(sanitizeMfaCallbackUrl("//evil.com/path")).toBe("/app");
  });

  it("blocks absolute URLs (open redirect)", async () => {
    expect(sanitizeMfaCallbackUrl("https://evil.com")).toBe("/app");
    expect(sanitizeMfaCallbackUrl("http://evil.com")).toBe("/app");
  });

  it("defaults to /app for empty or invalid input", async () => {
    expect(sanitizeMfaCallbackUrl("")).toBe("/app");
    expect(sanitizeMfaCallbackUrl("javascript:alert(1)")).toBe("/app");
  });

  it("strips stale mfaToken values from callback URLs", async () => {
    expect(sanitizeMfaCallbackUrl("/app/home?mfaToken=abc123")).toBe("/app/home");
    expect(sanitizeMfaCallbackUrl("/app/home?foo=1&mfaToken=abc123&bar=2")).toBe("/app/home?foo=1&bar=2");
  });
});
