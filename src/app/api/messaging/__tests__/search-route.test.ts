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
  const requireNumberRange = vi.fn((val: any, name: string, min: number, max: number) => {
    if (val === undefined || val === null) return undefined;
    const num = Number(val);
    if (!Number.isFinite(num) || num < min || num > max) throw new Error(`${name} out of range`);
    return num;
  });

  return {
    requireMessagingApiContext,
    messagingApiResponse,
    handleMessagingApiError,
    requireNumberRange,
  };
});

vi.mock("@/lib/messaging", () => ({
  searchMessaging: vi.fn(),
}));

import { requireMessagingApiContext } from "@/app/api/messaging/_utils";
import { searchMessaging } from "@/lib/messaging";
import { GET as searchRoute } from "../search/route";

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url), {
    method: "GET",
  });
}

describe("Search API Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireMessagingApiContext).mockResolvedValue({
      userId: "user-1",
      orgId: "org-1",
      role: "member",
    });
  });

  it("successfully parses query, limit, offset, and kinds, and calls searchMessaging", async () => {
    const mockResponse = {
      results: [{ id: "msg-1", kind: "message", title: "User", subtitle: "finance-ops", score: 100 }],
      facets: { message: 1, conversation: 0, task: 0, meeting: 0, file: 0 },
      hasMore: false,
      state: "active",
      unindexedKinds: [],
    };

    vi.mocked(searchMessaging).mockResolvedValue(mockResponse as any);

    const response = await searchRoute(
      makeRequest("http://localhost/api/messaging/search?q=hello&kinds=message,task&limit=10&offset=5&degraded=true")
    );

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(mockResponse);

    expect(searchMessaging).toHaveBeenCalledWith("org-1", "user-1", {
      q: "hello",
      kinds: ["message", "task"],
      limit: 10,
      offset: 5,
      degraded: true,
    });
  });

  it("handles validation errors if limit is out of bounds", async () => {
    const response = await searchRoute(
      makeRequest("http://localhost/api/messaging/search?limit=150")
    );

    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.error).toBe("limit out of range");
  });

  it("passes default limits when params are omitted", async () => {
    vi.mocked(searchMessaging).mockResolvedValue({
      results: [],
      facets: { message: 0, conversation: 0, task: 0, meeting: 0, file: 0 },
      hasMore: false,
      state: "active",
      unindexedKinds: [],
    } as any);

    const response = await searchRoute(makeRequest("http://localhost/api/messaging/search?q=test"));

    const json = await response.json();
    expect(json.success).toBe(true);
    expect(searchMessaging).toHaveBeenCalledWith("org-1", "user-1", {
      q: "test",
      kinds: undefined,
      limit: 20,
      offset: 0,
      degraded: false,
    });
  });
});
