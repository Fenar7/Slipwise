import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { recordTagEvent } from "../telemetry";

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("recordTagEvent", () => {
  it("logs a tag_created event", async () => {
    await recordTagEvent({
      event: "tag_created",
      orgId: "org_abc",
      tagId: "tag_001",
    });

    expect(console.log).toHaveBeenCalledWith(
      "[tag-telemetry]",
      expect.stringContaining("tag_created")
    );
    expect(console.log).toHaveBeenCalledWith(
      "[tag-telemetry]",
      expect.stringContaining("tag_001")
    );
  });

  it("logs a tag_assigned_to_invoice event with entity info", async () => {
    await recordTagEvent({
      event: "tag_assigned_to_invoice",
      orgId: "org_abc",
      tagId: "tag_001",
      entityType: "invoice",
      entityId: "inv_1",
    });

    const calls = vi.mocked(console.log).mock.calls;
    const eventCall = calls.find((c) => c[0] === "[tag-telemetry]");
    expect(eventCall).toBeDefined();
    const payload = JSON.parse(eventCall![1]);
    expect(payload.event).toBe("tag_assigned_to_invoice");
    expect(payload.entityId).toBe("inv_1");
    expect(payload.timestamp).toBeDefined();
  });

  it("does not log in production by default", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");

    await recordTagEvent({
      event: "tag_created",
      orgId: "org_abc",
      tagId: "tag_001",
    });

    expect(console.log).not.toHaveBeenCalled();
  });
});
