import { CalendarProvider } from "./domain-types";

export interface CalendarAuthTokens {
  providerAccountId: string;
  emailAddress: string;
  displayName?: string | null;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number;
}

export interface CalendarProviderAdapter {
  getProviderType(): CalendarProvider;
  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<CalendarAuthTokens>;
}

export class GoogleCalendarAdapter implements CalendarProviderAdapter {
  getProviderType(): CalendarProvider {
    return "GOOGLE";
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "Google Calendar integration is not configured: missing GOOGLE_CLIENT_ID"
      );
    }
    const baseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
    const scope = encodeURIComponent("https://www.googleapis.com/auth/calendar.events");
    return `${baseUrl}?client_id=${clientId}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&access_type=offline&prompt=consent`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<CalendarAuthTokens> {
    if (!code || code.trim() === "") {
      throw new Error("Google exchangeCode: authorization code is required");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google Calendar integration is not configured: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    }

    // Real Google OAuth 2.0 token exchange
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Google OAuth code exchange failed: ${tokenResponse.statusText} - ${errText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresInSeconds = tokenData.expires_in;

    if (!accessToken) {
      throw new Error("Google OAuth did not return an access token");
    }

    // Fetch user profile info (sub, email, name)
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userinfoResponse.ok) {
      throw new Error(`Google Userinfo fetch failed: ${userinfoResponse.statusText}`);
    }

    const userinfo = await userinfoResponse.json();

    if (!userinfo.sub || !userinfo.email) {
      throw new Error("Google Userinfo did not contain required identity fields (sub, email)");
    }

    return {
      providerAccountId: userinfo.sub,
      emailAddress: userinfo.email,
      displayName: userinfo.name || null,
      accessToken,
      refreshToken: refreshToken || "",
      expiresInSeconds,
    };
  }
}

export class OutlookCalendarAdapter implements CalendarProviderAdapter {
  getProviderType(): CalendarProvider {
    return "OUTLOOK";
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    if (!clientId) {
      throw new Error(
        "Outlook Calendar integration is not configured: missing OUTLOOK_CLIENT_ID"
      );
    }
    const baseUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    const scope = encodeURIComponent("https://graph.microsoft.com/Calendars.ReadWrite offline_access");
    return `${baseUrl}?client_id=${clientId}&response_type=code&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_mode=query`;
  }

  async exchangeCode(code: string, redirectUri: string): Promise<CalendarAuthTokens> {
    if (!code || code.trim() === "") {
      throw new Error("Outlook exchangeCode: authorization code is required");
    }

    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Outlook Calendar integration is not configured: missing OUTLOOK_CLIENT_ID or OUTLOOK_CLIENT_SECRET");
    }

    // Real Microsoft Outlook OAuth 2.0 token exchange
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Outlook OAuth code exchange failed: ${tokenResponse.statusText} - ${errText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresInSeconds = tokenData.expires_in;

    if (!accessToken) {
      throw new Error("Outlook OAuth did not return an access token");
    }

    // Fetch user profile from Microsoft Graph
    const meResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!meResponse.ok) {
      throw new Error(`Microsoft Graph /me fetch failed: ${meResponse.statusText}`);
    }

    const me = await meResponse.json();

    if (!me.id || !(me.mail || me.userPrincipalName)) {
      throw new Error("Microsoft Graph did not contain required identity fields (id, mail/userPrincipalName)");
    }

    return {
      providerAccountId: me.id,
      emailAddress: me.mail || me.userPrincipalName,
      displayName: me.displayName || null,
      accessToken,
      refreshToken: refreshToken || "",
      expiresInSeconds,
    };
  }
}

const adapters: Record<CalendarProvider, CalendarProviderAdapter> = {
  GOOGLE: new GoogleCalendarAdapter(),
  OUTLOOK: new OutlookCalendarAdapter(),
};

export function getCalendarProviderAdapter(provider: CalendarProvider): CalendarProviderAdapter {
  const adapter = adapters[provider];
  if (!adapter) {
    throw new Error(`Unsupported calendar provider: ${provider}`);
  }
  return adapter;
}
