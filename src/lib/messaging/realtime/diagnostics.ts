import "server-only";

import type { RealtimeErrorCode } from "./protocol";

/**
 * Connection-state telemetry and supportability helpers.
 *
 * Goals:
 * - Provide enough traceability to diagnose session problems in production.
 * - Never log sensitive token contents, message bodies, or user PII.
 * - Keep logs concise and structured for aggregation.
 */

export type RealtimeDiagnosticEvent =
  | { kind: "bootstrap_success"; orgId: string; userId: string; sessionId: string }
  | { kind: "bootstrap_denied"; orgId?: string; userId?: string; reason: string; code: RealtimeErrorCode }
  | { kind: "connect_success"; sessionId: string; orgId: string; userId: string }
  | { kind: "connect_denied"; reason: string; code: RealtimeErrorCode; clientIp?: string }
  | { kind: "subscription_denied"; sessionId: string; conversationId: string; reason: string }
  | { kind: "subscription_accepted"; sessionId: string; conversationId: string }
  | { kind: "heartbeat_expired"; sessionId: string; idleMs: number }
  | { kind: "disconnect"; sessionId: string; reason: string }
  | { kind: "session_sweep"; sessionId: string; reason: string }
  | { kind: "command_rejected"; sessionId: string; commandType: string; reason: string }
  // Sprint 4.2
  | { kind: "event_published"; eventType: string; conversationId: string; recipientCount: number }
  | { kind: "event_dropped"; eventType: string; conversationId: string; reason: string; sessionId?: string }
  | { kind: "presence_updated"; sessionId: string; orgId: string; userId: string; status: string }
  | { kind: "typing_started"; sessionId: string; conversationId: string; userId: string }
  | { kind: "typing_stopped"; sessionId: string; conversationId: string; userId: string }
  | { kind: "typing_expired"; sessionId: string; conversationId: string; userId: string }
  // Sprint 4.4
  | { kind: "downstream_event_consumed"; consumerType: string; orgId: string; eventCount: number; afterCursor?: string }
  | { kind: "downstream_checkpoint_saved"; consumerType: string; orgId: string; cursor: string; conversationId?: string }
  | { kind: "degraded_mode_entered"; sessionId: string; reason: string; rehydrateRecommended?: boolean }
  | { kind: "degraded_mode_recovered"; sessionId: string; reason: string }
  | { kind: "subscription_limit_denied"; sessionId: string; conversationId: string; currentCount: number; limit: number }
  | { kind: "rate_limit_denied"; sessionId: string; commandType: string; remaining: number; resetAt: number }
  | { kind: "backpressure_activated"; sessionId: string; reason: string; outstandingEvents: number }
  | { kind: "backpressure_released"; sessionId: string; outstandingEvents: number }
  | { kind: "payload_size_denied"; sessionId: string; byteLength: number; limit: number }
  | { kind: "presence_degraded"; sessionId: string; reason: string }
  | { kind: "typing_degraded"; sessionId: string; reason: string }
  | { kind: "replay_degraded"; sessionId: string; conversationId: string; reason: string }
  | { kind: "fanout_degraded"; conversationId: string; reason: string; recipientCount: number };

export interface RealtimeDiagnostics {
  emit(event: RealtimeDiagnosticEvent): void;
}

/** Production-safe console diagnostics. Swallows errors to avoid destabilizing transport. */
export class ConsoleRealtimeDiagnostics implements RealtimeDiagnostics {
  emit(event: RealtimeDiagnosticEvent): void {
    try {
      const base = `[realtime] ${event.kind}`;

      switch (event.kind) {
        case "bootstrap_success": {
          console.info(`${base} org=${safeId(event.orgId)} user=${safeId(event.userId)} session=${safeId(event.sessionId)}`);
          break;
        }
        case "bootstrap_denied": {
          console.warn(`${base} org=${safeId(event.orgId)} user=${safeId(event.userId)} reason=${event.reason} code=${event.code}`);
          break;
        }
        case "connect_success": {
          console.info(`${base} session=${safeId(event.sessionId)} org=${safeId(event.orgId)} user=${safeId(event.userId)}`);
          break;
        }
        case "connect_denied": {
          console.warn(`${base} reason=${event.reason} code=${event.code}`);
          break;
        }
        case "subscription_denied": {
          console.warn(`${base} session=${safeId(event.sessionId)} conv=${safeId(event.conversationId)} reason=${event.reason}`);
          break;
        }
        case "subscription_accepted": {
          console.info(`${base} session=${safeId(event.sessionId)} conv=${safeId(event.conversationId)}`);
          break;
        }
        case "heartbeat_expired": {
          console.warn(`${base} session=${safeId(event.sessionId)} idleMs=${event.idleMs}`);
          break;
        }
        case "disconnect": {
          console.info(`${base} session=${safeId(event.sessionId)} reason=${event.reason}`);
          break;
        }
        case "session_sweep": {
          console.warn(`${base} session=${safeId(event.sessionId)} reason=${event.reason}`);
          break;
        }
        case "command_rejected": {
          console.warn(`${base} session=${safeId(event.sessionId)} cmd=${event.commandType} reason=${event.reason}`);
          break;
        }
        case "event_published": {
          console.info(`${base} type=${event.eventType} conv=${safeId(event.conversationId)} recipients=${event.recipientCount}`);
          break;
        }
        case "event_dropped": {
          console.warn(`${base} type=${event.eventType} conv=${safeId(event.conversationId)} reason=${event.reason} session=${safeId(event.sessionId)}`);
          break;
        }
        case "presence_updated": {
          console.info(`${base} session=${safeId(event.sessionId)} org=${safeId(event.orgId)} user=${safeId(event.userId)} status=${event.status}`);
          break;
        }
        case "typing_started": {
          console.info(`${base} session=${safeId(event.sessionId)} conv=${safeId(event.conversationId)} user=${safeId(event.userId)}`);
          break;
        }
        case "typing_stopped": {
          console.info(`${base} session=${safeId(event.sessionId)} conv=${safeId(event.conversationId)} user=${safeId(event.userId)}`);
          break;
        }
        case "typing_expired": {
          console.info(`${base} session=${safeId(event.sessionId)} conv=${safeId(event.conversationId)} user=${safeId(event.userId)}`);
          break;
        }
        // Sprint 4.4
        case "downstream_event_consumed": {
          console.info(`${base} consumer=${event.consumerType} org=${safeId(event.orgId)} count=${event.eventCount} afterCursor=${event.afterCursor ?? "-"}`);
          break;
        }
        case "downstream_checkpoint_saved": {
          console.info(`${base} consumer=${event.consumerType} org=${safeId(event.orgId)} cursor=${event.cursor} conv=${safeId(event.conversationId)}`);
          break;
        }
        case "degraded_mode_entered": {
          console.warn(`${base} session=${safeId(event.sessionId)} reason=${event.reason} rehydrate=${event.rehydrateRecommended ?? false}`);
          break;
        }
        case "degraded_mode_recovered": {
          console.info(`${base} session=${safeId(event.sessionId)} reason=${event.reason}`);
          break;
        }
        case "subscription_limit_denied": {
          console.warn(`${base} session=${safeId(event.sessionId)} conv=${safeId(event.conversationId)} current=${event.currentCount} limit=${event.limit}`);
          break;
        }
        case "rate_limit_denied": {
          console.warn(`${base} session=${safeId(event.sessionId)} cmd=${event.commandType} remaining=${event.remaining} resetAt=${event.resetAt}`);
          break;
        }
        case "backpressure_activated": {
          console.warn(`${base} session=${safeId(event.sessionId)} reason=${event.reason} outstanding=${event.outstandingEvents}`);
          break;
        }
        case "backpressure_released": {
          console.info(`${base} session=${safeId(event.sessionId)} outstanding=${event.outstandingEvents}`);
          break;
        }
        case "payload_size_denied": {
          console.warn(`${base} session=${safeId(event.sessionId)} byteLength=${event.byteLength} limit=${event.limit}`);
          break;
        }
        case "presence_degraded": {
          console.warn(`${base} session=${safeId(event.sessionId)} reason=${event.reason}`);
          break;
        }
        case "typing_degraded": {
          console.warn(`${base} session=${safeId(event.sessionId)} reason=${event.reason}`);
          break;
        }
        case "replay_degraded": {
          console.warn(`${base} session=${safeId(event.sessionId)} conv=${safeId(event.conversationId)} reason=${event.reason}`);
          break;
        }
        case "fanout_degraded": {
          console.warn(`${base} conv=${safeId(event.conversationId)} reason=${event.reason} recipients=${event.recipientCount}`);
          break;
        }
      }
    } catch {
      // Diagnostic emission must never throw.
    }
  }
}

/** No-op diagnostics for test environments where console noise is undesirable. */
export class NoopRealtimeDiagnostics implements RealtimeDiagnostics {
  emit(_event: RealtimeDiagnosticEvent): void {
    // intentionally empty — _event is part of the interface contract
    void _event;
  }
}

function safeId(id: string | undefined): string {
  if (!id) return "-";
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
