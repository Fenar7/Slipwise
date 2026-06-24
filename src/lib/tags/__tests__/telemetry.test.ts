import { describe, it, expect, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import {
  trackTagCreated,
  trackTagApplied,
  trackTagRemoved,
  trackTagReportFiltered,
  trackTagAnalyticsViewed,
  trackTagDrilldownOpened,
  trackTagDefaultsUpdated,
  trackBulkTaggingStarted,
} from "../telemetry";

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
}));

describe("tag telemetry", () => {
  it("tracks tag creation", () => {
    trackTagCreated({ name: "Urgent" });
    expect(trackEvent).toHaveBeenCalledWith("tag_created", { name: "Urgent" });
  });

  it("tracks tag application", () => {
    trackTagApplied("invoice", 3);
    expect(trackEvent).toHaveBeenCalledWith("tag_applied", { doc_type: "invoice", tag_count: 3 });
  });

  it("tracks tag removal", () => {
    trackTagRemoved("voucher");
    expect(trackEvent).toHaveBeenCalledWith("tag_removed", { doc_type: "voucher" });
  });

  it("tracks tag report filtering", () => {
    trackTagReportFiltered("invoice", 2);
    expect(trackEvent).toHaveBeenCalledWith("tag_report_filtered", { report_type: "invoice", tag_count: 2 });
  });

  it("tracks tag analytics views", () => {
    trackTagAnalyticsViewed("detailed");
    expect(trackEvent).toHaveBeenCalledWith("tag_analytics_viewed", { mode: "detailed" });
  });

  it("tracks tag drilldown views", () => {
    trackTagDrilldownOpened("invoice");
    expect(trackEvent).toHaveBeenCalledWith("tag_drilldown_opened", { doc_type: "invoice" });
  });

  it("tracks tag defaults updates", () => {
    trackTagDefaultsUpdated("customer", 4);
    expect(trackEvent).toHaveBeenCalledWith("tag_defaults_updated", { entity_type: "customer", tag_count: 4 });
  });

  it("tracks bulk tagging starts", () => {
    trackBulkTaggingStarted("voucher", 12);
    expect(trackEvent).toHaveBeenCalledWith("tag_bulk_started", { doc_type: "voucher", doc_count: 12 });
  });
});
