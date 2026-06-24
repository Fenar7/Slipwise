"use client";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const {
  routerPushMock,
  routerReplaceMock,
  routerRefreshMock,
  locationAssignMock,
  fetchMock,
} = vi.hoisted(() => ({
  routerPushMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  routerRefreshMock: vi.fn(),
  locationAssignMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    refresh: routerRefreshMock,
  }),
}));

const authenticatePasskeyMock = vi.fn();
const browserSupportsWebAuthnMock = vi.fn().mockReturnValue(true);

vi.mock("@/lib/passkey/client", () => ({
  authenticatePasskey: (...args: unknown[]) => authenticatePasskeyMock(...args),
  browserSupportsWebAuthn: () => browserSupportsWebAuthnMock(),
}));

describe("LoginForm", () => {
  function getEmailInput() {
    const input = document.querySelector('input[type="email"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Email input not found");
    }
    return input;
  }

  function getPasswordInput() {
    const input = document.querySelector('input[type="password"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Password input not found");
    }
    return input;
  }

  beforeEach(() => {
    routerPushMock.mockReset();
    routerReplaceMock.mockReset();
    routerRefreshMock.mockReset();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ redirectTo: "/onboarding" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.stubGlobal("location", {
      ...window.location,
      assign: locationAssignMock,
      origin: "http://localhost:3001",
    });
  });

  it("navigates to the redirect destination after a successful password sign-in", async () => {
    render(<LoginForm />);

    fireEvent.change(getEmailInput(), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(getPasswordInput(), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/password-login",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );
      expect(locationAssignMock).toHaveBeenCalledWith("/onboarding");
    });

    expect(routerPushMock).not.toHaveBeenCalled();
    expect(routerReplaceMock).not.toHaveBeenCalled();
    expect(routerRefreshMock).not.toHaveBeenCalled();
  });

  it("passes session persistence when remember me is disabled", async () => {
    render(<LoginForm />);

    fireEvent.change(getEmailInput(), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(getPasswordInput(), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByLabelText(/remember me/i));
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(options?.body).toContain('"rememberMe":false');
  });

  it("shows inline API errors and does not navigate", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: "Invalid email or password" }),
    });

    render(<LoginForm />);

    fireEvent.change(getEmailInput(), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(getPasswordInput(), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await screen.findByText("Invalid email or password");
    expect(routerReplaceMock).not.toHaveBeenCalled();
  });

  it("renders server-returned login errors and preserves the submitted email", async () => {
    render(
      <LoginForm
        initialError="Invalid email or password"
        initialEmail="user@example.com"
      />,
    );

    expect(screen.getByDisplayValue("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
  });

  it("routes unconfirmed users to verify email", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: vi.fn().mockResolvedValue({ code: "email_not_confirmed" }),
    });

    render(<LoginForm />);

    fireEvent.change(getEmailInput(), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(getPasswordInput(), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/auth/verify-email?email=user%40example.com",
      );
    });
  });

  it("hard redirects after a successful primary passkey sign-in", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          options: { challenge: "challenge_1" },
          signinSessionId: "session_1",
          callbackUrl: "/app",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          callbackUrl: "/app",
          mfaToken: "test-mfa-token",
        }),
      });

    authenticatePasskeyMock.mockResolvedValue({
      id: "cred_1",
      rawId: "cred_1",
      response: {},
      clientExtensionResults: {},
      type: "public-key",
    });

    render(<LoginForm />);

    const passkeyButton = await screen.findByRole("button", { name: /sign in with passkey/i });
    fireEvent.click(passkeyButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        "/api/auth/passkey/signin-options",
        expect.objectContaining({ method: "POST" })
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        "/api/auth/passkey/signin",
        expect.objectContaining({ method: "POST" })
      );
      expect(locationAssignMock).toHaveBeenCalledWith("/app?mfaToken=test-mfa-token");
    });
  });

  it("shows error when passkey sign-in fails", async () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        options: { challenge: "challenge_1" },
        signinSessionId: "session_1",
        callbackUrl: "/app",
      }),
    });

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ success: false, error: "Passkey verification failed" }),
    });

    authenticatePasskeyMock.mockResolvedValue({
      id: "cred_1",
      rawId: "cred_1",
      response: {},
      clientExtensionResults: {},
      type: "public-key",
    });

    render(<LoginForm />);

    const passkeyButton = await screen.findByRole("button", { name: /sign in with passkey/i });
    fireEvent.click(passkeyButton);

    expect(
      await screen.findByText("Passkey verification failed")
    ).toBeInTheDocument();
  });
});
