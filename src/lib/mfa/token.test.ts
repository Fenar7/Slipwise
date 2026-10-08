import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { signMfaToken, verifyMfaToken } from "./token";

describe("signMfaToken + verifyMfaToken", () => {
  const originalSecret = process.env.TOTP_SESSION_SECRET;

  beforeAll(async () => {
    process.env.TOTP_SESSION_SECRET = "test-secret-for-mfa-tokens";
  });

  afterAll(() => {
    process.env.TOTP_SESSION_SECRET = originalSecret;
  });

  it("signs and verifies a valid token", async () => {
    const userId = "user-123";
    const token = await signMfaToken(userId);
    const result = await verifyMfaToken(token, process.env.TOTP_SESSION_SECRET!);
    expect(result).toBe(userId);
  });

  it("rejects an expired token", async () => {
    const userId = "user-456";
    const token = await signMfaToken(userId);

    // Fast-forward past the 5-minute expiry
    const originalDateNow = Date.now;
    Date.now = () => originalDateNow() + 6 * 60 * 1000;

    const result = await verifyMfaToken(token, process.env.TOTP_SESSION_SECRET!);
    Date.now = originalDateNow;

    expect(result).toBeNull();
  });

  it("rejects a tampered token", async () => {
    const userId = "user-789";
    const token = await signMfaToken(userId);
    // Tamper with the payload
    const [header, body, sig] = token.split(".");
    const tamperedBody = Buffer.from(body, "base64url")
      .toString("utf8")
      .replace(userId, "attacker");
    const tamperedToken = `${header}.${Buffer.from(tamperedBody).toString("base64url")}.${sig}`;
    const result = await verifyMfaToken(tamperedToken, process.env.TOTP_SESSION_SECRET!);
    expect(result).toBeNull();
  });

  it("rejects an empty string", async () => {
    const result = await verifyMfaToken("", process.env.TOTP_SESSION_SECRET!);
    expect(result).toBeNull();
  });

  it("rejects a token with wrong secret", async () => {
    const userId = "user-abc";
    const token = await signMfaToken(userId);
    const result = await verifyMfaToken(token, "wrong-secret");
    expect(result).toBeNull();
  });

  it("rejects a malformed token", async () => {
    const result = await verifyMfaToken("not.a.jwt", process.env.TOTP_SESSION_SECRET!);
    expect(result).toBeNull();
  });

  it("rejects a token with wrong typ claim", async () => {
    // Create a challenge token (typ: undefined or different) instead of MFA token
    const { signChallengeToken } = await import("@/lib/totp/challenge-session");
    const challengeToken = await signChallengeToken("user-xyz");
    const result = await verifyMfaToken(challengeToken, process.env.TOTP_SESSION_SECRET!);
    expect(result).toBeNull();
  });
});
