import { CalendarProvider } from "./domain-types";

export interface CalendarAuthTokens {
  providerAccountId: string;
  emailAddress: string;
  displayName?: string | null;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number;
}

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  attendeeEmails?: string[];
}

export interface CalendarEventResult {
  providerEventId: string;
  joinUrl?: string | null;
  attendeeResponses?: Record<string, string>;
}

export interface CalendarProviderAdapter {
  getProviderType(): CalendarProvider;
  getAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<CalendarAuthTokens>;
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresInSeconds: number }>;
  
  createEvent(accessToken: string, event: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(accessToken: string, providerEventId: string, event: CalendarEventInput): Promise<CalendarEventResult>;
  deleteEvent(accessToken: string, providerEventId: string): Promise<void>;
  getEvent(accessToken: string, providerEventId: string): Promise<{
    title: string;
    description?: string | null;
    startAt: Date;
    endAt: Date;
    status?: "ACTIVE" | "CANCELLED";
    attendeeResponses?: Record<string, string>;
  } | null>;
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

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Google Calendar integration is not configured: missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google token refresh failed: ${response.statusText} - ${errText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresInSeconds: data.expires_in ?? 3600,
    };
  }

  async createEvent(accessToken: string, event: CalendarEventInput): Promise<CalendarEventResult> {
    const url = "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1";
    
    const body = {
      summary: event.title,
      description: event.description || "",
      start: { dateTime: event.startAt.toISOString() },
      end: { dateTime: event.endAt.toISOString() },
      attendees: event.attendeeEmails?.map(email => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: Math.random().toString(36).substring(2),
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google createEvent failed: ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Calendar API response shape
    const joinUrl = data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri || null;
    const attendeeResponses: Record<string, string> = {};
    if (data.attendees) {
      for (const att of data.attendees) {
        if (att.email) {
          attendeeResponses[att.email] = att.responseStatus || "needsAction";
        }
      }
    }

    return {
      providerEventId: data.id,
      joinUrl,
      attendeeResponses,
    };
  }

  async updateEvent(accessToken: string, providerEventId: string, event: CalendarEventInput): Promise<CalendarEventResult> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${providerEventId}?conferenceDataVersion=1`;
    
    const body = {
      summary: event.title,
      description: event.description || "",
      start: { dateTime: event.startAt.toISOString() },
      end: { dateTime: event.endAt.toISOString() },
      attendees: event.attendeeEmails?.map(email => ({ email })),
    };

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google updateEvent failed: ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Google Calendar API response shape
    const joinUrl = data.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === "video")?.uri || null;
    const attendeeResponses: Record<string, string> = {};
    if (data.attendees) {
      for (const att of data.attendees) {
        if (att.email) {
          attendeeResponses[att.email] = att.responseStatus || "needsAction";
        }
      }
    }

    return {
      providerEventId,
      joinUrl,
      attendeeResponses,
    };
  }

  async deleteEvent(accessToken: string, providerEventId: string): Promise<void> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${providerEventId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`Google deleteEvent failed: ${response.statusText} - ${text}`);
    }
  }

  async getEvent(accessToken: string, providerEventId: string): Promise<{
    title: string;
    description?: string | null;
    startAt: Date;
    endAt: Date;
    status?: "ACTIVE" | "CANCELLED";
    attendeeResponses?: Record<string, string>;
  } | null> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${providerEventId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google getEvent failed: ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    const attendeeResponses: Record<string, string> = {};
    if (data.attendees) {
      for (const att of data.attendees) {
        if (att.email) {
          attendeeResponses[att.email] = att.responseStatus || "needsAction";
        }
      }
    }

    return {
      title: data.summary || "",
      description: data.description ?? null,
      startAt: new Date(data.start?.dateTime || data.start?.date),
      endAt: new Date(data.end?.dateTime || data.end?.date),
      status: data.status === "cancelled" ? "CANCELLED" : "ACTIVE",
      attendeeResponses,
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

  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresInSeconds: number }> {
    const clientId = process.env.OUTLOOK_CLIENT_ID;
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Outlook Calendar integration is not configured: missing OUTLOOK_CLIENT_ID or OUTLOOK_CLIENT_SECRET");
    }

    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Outlook token refresh failed: ${response.statusText} - ${errText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      expiresInSeconds: data.expires_in ?? 3600,
    };
  }

  async createEvent(accessToken: string, event: CalendarEventInput): Promise<CalendarEventResult> {
    const url = "https://graph.microsoft.com/v1.0/me/calendar/events";
    
    const body = {
      subject: event.title,
      body: {
        contentType: "HTML",
        content: event.description || ""
      },
      start: {
        dateTime: event.startAt.toISOString(),
        timeZone: "UTC"
      },
      end: {
        dateTime: event.endAt.toISOString(),
        timeZone: "UTC"
      },
      attendees: event.attendeeEmails?.map(email => ({
        emailAddress: { address: email },
        type: "required"
      })),
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness"
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Outlook createEvent failed: ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    const joinUrl = data.onlineMeeting?.joinUrl || null;
    const attendeeResponses: Record<string, string> = {};
    if (data.attendees) {
      for (const att of data.attendees) {
        const email = att.emailAddress?.address;
        if (email) {
          attendeeResponses[email] = att.status?.response || "none";
        }
      }
    }

    return {
      providerEventId: data.id,
      joinUrl,
      attendeeResponses,
    };
  }

  async updateEvent(accessToken: string, providerEventId: string, event: CalendarEventInput): Promise<CalendarEventResult> {
    const url = `https://graph.microsoft.com/v1.0/me/events/${providerEventId}`;
    
    const body = {
      subject: event.title,
      body: {
        contentType: "HTML",
        content: event.description || ""
      },
      start: {
        dateTime: event.startAt.toISOString(),
        timeZone: "UTC"
      },
      end: {
        dateTime: event.endAt.toISOString(),
        timeZone: "UTC"
      },
      attendees: event.attendeeEmails?.map(email => ({
        emailAddress: { address: email },
        type: "required"
      })),
    };

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Outlook updateEvent failed: ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    const joinUrl = data.onlineMeeting?.joinUrl || null;
    const attendeeResponses: Record<string, string> = {};
    if (data.attendees) {
      for (const att of data.attendees) {
        const email = att.emailAddress?.address;
        if (email) {
          attendeeResponses[email] = att.status?.response || "none";
        }
      }
    }

    return {
      providerEventId,
      joinUrl,
      attendeeResponses,
    };
  }

  async deleteEvent(accessToken: string, providerEventId: string): Promise<void> {
    const url = `https://graph.microsoft.com/v1.0/me/events/${providerEventId}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok && response.status !== 404) {
      const text = await response.text();
      throw new Error(`Outlook deleteEvent failed: ${response.statusText} - ${text}`);
    }
  }

  async getEvent(accessToken: string, providerEventId: string): Promise<{
    title: string;
    description?: string | null;
    startAt: Date;
    endAt: Date;
    status?: "ACTIVE" | "CANCELLED";
    attendeeResponses?: Record<string, string>;
  } | null> {
    const url = `https://graph.microsoft.com/v1.0/me/events/${providerEventId}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Outlook getEvent failed: ${response.statusText} - ${text}`);
    }

    const data = await response.json();
    const attendeeResponses: Record<string, string> = {};
    if (data.attendees) {
      for (const att of data.attendees) {
        const email = att.emailAddress?.address;
        if (email) {
          attendeeResponses[email] = att.status?.response || "none";
        }
      }
    }

    return {
      title: data.subject || "",
      description: data.body?.content ?? null,
      startAt: new Date(data.start?.dateTime + "Z"),
      endAt: new Date(data.end?.dateTime + "Z"),
      status: data.isCancelled ? "CANCELLED" : "ACTIVE",
      attendeeResponses,
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
