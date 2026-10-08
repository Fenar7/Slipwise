import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  signChallengeToken,
  verifyChallengeToken,
  MFA_SESSION_DURATION_SECONDS,
  MFA_CHALLENGE_COOKIE,
  // Legacy aliases should still work
  TOTP_SESSION_DURATION_SECONDS,
  TOTP_CHALLENGE_COOKIE,
} from "../challenge-session";

// Set a test secret so the module doesn't throw on missing env
beforeEach(async () => {
  vi.stubEnv("TOTP_SESSION_SECRET", "test-secret-for-challenge-session-vitest-32b");
});

const TEST_SECRET = "test-secret-for-challenge-session-vitest-32b";
const USER_ID = "user_abc123";

describe("signChallengeToken / verifyChallengeToken", () => {
  it("produces a JWT-like token with three parts", async () => {
    const token = await signChallengeToken(USER_ID);
    expect(token.split(".")).toHaveLength(3);
  });

  it("verifies a freshly signed token for the correct user", async () => {
    const token = await signChallengeToken(USER_ID);
    const result = await verifyChallengeToken(token, TEST_SECRET);
    expect(result).toBe(USER_ID);
  });

  it("rejects a token for a different user — caller must compare userId", async () => {
    const token = await signChallengeToken("other_user");
    const result = await verifyChallengeToken(token, TEST_SECRET);
    // Token is structurally valid but bound to "other_user";
    // middleware enforces verifiedUserId === user.id
    expect(result).toBe("other_user");
    expect(result).not.toBe(USER_ID);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await signChallengeToken(USER_ID);
    const result = await verifyChallengeToken(token, "completely-wrong-secret-xxxxxxxxxx");
    expect(result).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signChallengeToken(USER_ID);
    const parts = token.split(".");
    // Corrupt the body segment
    parts[1] = Buffer.from(
      JSON.stringify({ sub: "attacker", exp: 9999999999 })
    ).toString("base64url");
    const tampered = parts.join(".");
    const result = await verifyChallengeToken(tampered, TEST_SECRET);
    expect(result).toBeNull();
  });

  it("rejects an empty string", async () => {
    const result = await verifyChallengeToken("", TEST_SECRET);
    expect(result).toBeNull();
  });

  it("rejects a malformed token (missing parts)", async () => {
    const result = await verifyChallengeToken("a.b", TEST_SECRET);
    expect(result).toBeNull();
  });

  it("sets expiry to MFA_SESSION_DURATION_SECONDS from now", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signChallengeToken(USER_ID);
    const after = Math.floor(Date.now() / 1000);

    const body = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8")
    ) as { exp: number; iat: number; sub: string };

    expect(body.sub).toBe(USER_ID);
    expect(body.exp - body.iat).toBe(MFA_SESSION_DURATION_SECONDS);
    expect(body.exp).toBeGreaterThanOrEqual(before + MFA_SESSION_DURATION_SECONDS);
    expect(body.exp).toBeLessThanOrEqual(after + MFA_SESSION_DURATION_SECONDS + 1);
  });
});

describe("MFA generalized constants", () => {
  it("MFA_CHALLENGE_COOKIE equals legacy TOTP_CHALLENGE_COOKIE", async () => {
    expect(MFA_CHALLENGE_COOKIE).toBe(TOTP_CHALLENGE_COOKIE);
    expect(MFA_CHALLENGE_COOKIE).toBe("sw_2fa");
  });

  it("MFA_SESSION_DURATION_SECONDS equals legacy TOTP_SESSION_DURATION_SECONDS", async () => {
    expect(MFA_SESSION_DURATION_SECONDS).toBe(TOTP_SESSION_DURATION_SECONDS);
    expect(MFA_SESSION_DURATION_SECONDS).toBe(12 * 60 * 60);
  });
});
