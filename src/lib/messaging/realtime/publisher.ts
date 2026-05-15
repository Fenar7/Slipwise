import "server-only";

import type { RealtimeEvent, RealtimeEventType } from "./protocol";
import type { MessagingGateway } from "./gateway";
import type { PresenceSessionRecord, TypingSessionRecord } from "../domain-types";

/**
 * Realtime publisher abstraction.
 *
 * Bridges the messaging service layer to the WebSocket gateway for live
 * fanout.  Services call publisher methods **after** authoritative
 * persistence succeeds.  The publisher never becomes the source of truth.
 *
 * Design note: in a multi-node deployment this interface will be backed by
 * a distributed bus (Redis, NATS, etc.).  The single-node implementation
 * below delegates directly to the in-memory gateway.
 */

export interface RealtimePublisher {
  /** Publish a conversation-scoped event to all authorized subscribers. */
  publishConversationEvent(
    orgId: string,
    conversationId: string,
    eventType: RealtimeEventType,
    actorId: string | undefined,
    data: unknown,
  ): void;

  /** Publish a presence update to allowed viewers in the org. */
  publishPresenceUpdate(
    orgId: string,
    presence: PresenceSessionRecord,
  ): void;

  /** Publish a typing update to conversation subscribers. */
  publishTypingUpdate(
    orgId: string,
    conversationId: string,
    typing: TypingSessionRecord | null,
  ): void;

  /** Remove all live subscriptions for a user from a conversation. */
  pruneConversationSubscriptions(
    orgId: string,
    conversationId: string,
    userId: string,
  ): void;
}

/** In-memory publisher for single-node deployments. */
export class InMemoryRealtimePublisher implements RealtimePublisher {
  constructor(private gateway: MessagingGateway) {}

  publishConversationEvent(
    orgId: string,
    conversationId: string,
    eventType: RealtimeEventType,
    actorId: string | undefined,
    data: unknown,
  ): void {
    const event: RealtimeEvent = {
      type: "event",
      eventId: `${eventType}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      payload: {
        eventType,
        orgId,
        conversationId,
        occurredAt: Date.now(),
        actorId,
        data,
      },
    };
    this.gateway.publishToConversation(orgId, conversationId, event);
  }

  publishPresenceUpdate(
    orgId: string,
    presence: PresenceSessionRecord,
  ): void {
    const event: RealtimeEvent = {
      type: "event",
      eventId: `presence:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      payload: {
        eventType: "conversation.presence.updated",
        orgId,
        conversationId: "_org", // presence is org-scoped, not conversation-scoped
        occurredAt: Date.now(),
        actorId: presence.userId,
        data: {
          userId: presence.userId,
          status: presence.status,
          activeConversationId: presence.activeConversationId,
        },
      },
    };
    this.gateway.publishToOrg(orgId, event, { senderUserId: presence.userId });
  }

  publishTypingUpdate(
    orgId: string,
    conversationId: string,
    typing: TypingSessionRecord | null,
  ): void {
    const event: RealtimeEvent = {
      type: "event",
      eventId: `typing:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      payload: {
        eventType: "conversation.typing.updated",
        orgId,
        conversationId,
        occurredAt: Date.now(),
        actorId: typing?.userId,
        data: typing
          ? {
              userId: typing.userId,
              status: typing.status,
              expiresAt: typing.expiresAt.toISOString(),
            }
          : { userId: null, status: null },
      },
    };
    this.gateway.publishToConversation(orgId, conversationId, event);
  }

  pruneConversationSubscriptions(
    orgId: string,
    conversationId: string,
    userId: string,
  ): void {
    this.gateway.pruneSubscriptionsForUser(orgId, conversationId, userId);
  }
}

// ---------------------------------------------------------------------------
// Singleton seam — populated at server bootstrap time.
// ---------------------------------------------------------------------------

let globalPublisher: RealtimePublisher | null = null;

export function registerRealtimePublisher(publisher: RealtimePublisher): void {
  globalPublisher = publisher;
}

export function getRealtimePublisher(): RealtimePublisher | null {
  return globalPublisher;
}

class NoopRealtimePublisher implements RealtimePublisher {
  publishConversationEvent(): void {}
  publishPresenceUpdate(): void {}
  publishTypingUpdate(): void {}
  pruneConversationSubscriptions(): void {}
}

const noopPublisher = new NoopRealtimePublisher();

export function getRealtimePublisherOrNoop(): RealtimePublisher {
  return globalPublisher ?? noopPublisher;
}
