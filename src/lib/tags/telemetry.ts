import { trackEvent } from "@/lib/analytics";

export function trackTagCreated(properties?: Record<string, unknown>) {
  trackEvent("tag_created", properties).catch(() => {});
}

export function trackTagApplied(docType: "invoice" | "voucher", tagCount: number) {
  trackEvent("tag_applied", { doc_type: docType, tag_count: tagCount }).catch(() => {});
}

export function trackTagRemoved(docType: "invoice" | "voucher") {
  trackEvent("tag_removed", { doc_type: docType }).catch(() => {});
}

export function trackTagReportFiltered(reportType: "invoice" | "voucher", tagCount: number) {
  trackEvent("tag_report_filtered", { report_type: reportType, tag_count: tagCount }).catch(() => {});
}

export function trackTagAnalyticsViewed(mode: string) {
  trackEvent("tag_analytics_viewed", { mode }).catch(() => {});
}

export function trackTagDrilldownOpened(docType: "invoice" | "voucher") {
  trackEvent("tag_drilldown_opened", { doc_type: docType }).catch(() => {});
}

export function trackTagDefaultsUpdated(entityType: "customer" | "vendor", tagCount: number) {
  trackEvent("tag_defaults_updated", { entity_type: entityType, tag_count: tagCount }).catch(() => {});
}

export function trackBulkTaggingStarted(docType: "invoice" | "voucher", docCount: number) {
  trackEvent("tag_bulk_started", { doc_type: docType, doc_count: docCount }).catch(() => {});
}

// ─── Structured event recorder (used by tag-telemetry tests) ──────────────────

export type TagEventPayload = {
  event: string;
  orgId: string;
  tagId: string;
  entityType?: string;
  entityId?: string;
  [key: string]: unknown;
};

export async function recordTagEvent(payload: TagEventPayload): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  console.log("[tag-telemetry]", JSON.stringify({ ...payload, timestamp: new Date().toISOString() }));
}
