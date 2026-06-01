import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

vi.mock("@/app/api/messaging/_utils", () => {
  const requireMessagingApiContext = vi.fn();
  const messagingApiResponse = vi.fn((data: any, status = 200) => {
    return new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  const handleMessagingApiError = vi.fn((err: any) => {
    const status = err.status ?? 500;
    return new Response(
      JSON.stringify({ success: false, error: err.message ?? "Error" }),
      {
        status,
        headers: { "content-type": "application/json" },
      }
    );
  });
  const safeRead = vi.fn(async (promise: any) => {
    try {
      return await promise;
    } catch (e: any) {
      throw e;
    }
  });

  return {
    requireMessagingApiContext,
    messagingApiResponse,
    handleMessagingApiError,
    safeRead,
  };
});

vi.mock("@/lib/messaging/read-models", () => ({
  getUnifiedCalendar: vi.fn(),
}));

import { requireMessagingApiContext } from "@/app/api/messaging/_utils";
import { getUnifiedCalendar } from "@/lib/messaging/read-models";
import { GET as getCalendar } from "../calendar/route";

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

describe("Calendar API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMessagingApiContext).mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
      role: "member",
    });
  });

  it("successfully fetches unified calendar entries", async () => {
    const mockEntries = [
      { id: "m1", type: "meeting", title: "Sync" },
      { id: "t1", type: "task_due_date", title: "Due: Task" },
    ];
    vi.mocked(getUnifiedCalendar).mockResolvedValue(mockEntries as any);

    const response = await getCalendar(
      makeRequest("http://localhost/api/messaging/calendar?startAt=2026-06-01T00:00:00Z&endAt=2026-06-30T23:59:59Z")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual(mockEntries);
    expect(getUnifiedCalendar).toHaveBeenCalledWith(
      "org-1",
      "user-1",
      expect.any(Date),
      expect.any(Date)
    );
  });
});
