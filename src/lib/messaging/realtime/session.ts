import "server-only";

import type { RealtimeSessionClaims } from "./token";

/**
 * Realtime session registry and lifecycle management.
 *
 * Responsibilities:
 * - Track authenticated sessions and their metadata
 * - Maintain per-session conversation subscriptions
 * - Enforce heartbeat-based idle expiry
 * - Provide safe diagnostic introspection
 *
 * The registry is intentionally an abstraction backed by an in-memory Map.
 * In a future scale-out phase, the interface can be backed by Redis or a
 * distributed store without changing consumers.
 */

export interface RealtimeSession {
  sessionId: string;
  userId: string;
  orgId: string;
  role: string;
  representedId: string | null;
  proxyGrantId: string | null;
  proxyScope: string[];
  connectedAt: number;
  lastHeartbeatAt: number;
  expiresAt: number;
  /** Conversation ids the client is currently subscribed to. */
  subscriptions: Set<string>;
  /** Whether the session has been explicitly closed. */
  closed: boolean;
  /** Close reason, if known. */
  closeReason?: string;
}

export interface SessionRegistryStats {
  totalSessions: number;
  totalSubscriptions: number;
  sessionsByOrg: Map<string, number>;
}

export interface SessionRegistry {
  createSession(claims: RealtimeSessionClaims): RealtimeSession;
  getSession(sessionId: string): RealtimeSession | undefined;
  updateHeartbeat(sessionId: string): boolean;
  addSubscription(sessionId: string, conversationId: string): boolean;
  removeSubscription(sessionId: string, conversationId: string): boolean;
  /**
   * Detach the transport connection from a session without invalidating it.
   * Subscriptions are preserved so reconnect/resume can reattach.
   */
  detachSession(sessionId: string): boolean;
  closeSession(sessionId: string, reason: string): boolean;
  removeSession(sessionId: string): boolean;
  getSubscriptions(sessionId: string): Set<string>;
  /** Remove sessions whose lastHeartbeatAt is older than maxIdleMs. */
  sweepExpiredSessions(maxIdleMs: number): Array<{ sessionId: string; reason: string }>;
  getStats(): SessionRegistryStats;
  getSessionsForConversation(conversationId: string): RealtimeSession[];
  getSessionsByOrg(orgId: string): RealtimeSession[];
  /**
   * Remove all subscriptions for a specific user from a conversation.
   * Returns the list of affected session ids.
   */
  pruneSubscriptionsForUser(
    orgId: string,
    conversationId: string,
    userId: string,
  ): string[];
  /**
   * Find any active session with the same userId + orgId + sessionId.
   * Used to detect duplicate connections using the same token.
   */
  findDuplicateSession(sessionId: string): RealtimeSession | undefined;
}

// ---------------------------------------------------------------------------
// Default idle expiry: 60 seconds without heartbeat.
// ---------------------------------------------------------------------------
export const DEFAULT_SESSION_IDLE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// In-memory implementation (production-viable for single-node, swappable)
// ---------------------------------------------------------------------------

export class InMemorySessionRegistry implements SessionRegistry {
  private sessions = new Map<string, RealtimeSession>();
  /** conversationId -> sessionId index for fast fanout lookups. */
  private subscriptionIndex = new Map<string, Set<string>>();

  createSession(claims: RealtimeSessionClaims): RealtimeSession {
    const now = Date.now();
    const session: RealtimeSession = {
      sessionId: claims.sid,
      userId: claims.sub,
      orgId: claims.org,
      role: claims.role,
      representedId: claims.rep,
      proxyGrantId: claims.pg,
      proxyScope: claims.ps,
      connectedAt: now,
      lastHeartbeatAt: now,
      expiresAt: claims.exp * 1000,
      subscriptions: new Set(),
      closed: false,
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  getSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }

  updateHeartbeat(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return false;
    session.lastHeartbeatAt = Date.now();
    return true;
  }

  addSubscription(sessionId: string, conversationId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return false;

    session.subscriptions.add(conversationId);

    let indexSet = this.subscriptionIndex.get(conversationId);
    if (!indexSet) {
      indexSet = new Set();
      this.subscriptionIndex.set(conversationId, indexSet);
    }
    indexSet.add(sessionId);
    return true;
  }

  removeSubscription(sessionId: string, conversationId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const removed = session.subscriptions.delete(conversationId);
    if (!removed) return false;

    const indexSet = this.subscriptionIndex.get(conversationId);
    if (indexSet) {
      indexSet.delete(sessionId);
      if (indexSet.size === 0) {
        this.subscriptionIndex.delete(conversationId);
      }
    }
    return true;
  }

  detachSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) return false;
    // Transport disconnect does NOT close the logical session.
    // Subscriptions remain intact for reconnect/resume.
    return true;
  }

  closeSession(sessionId: string, reason: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.closed = true;
    session.closeReason = reason;

    // Clean up subscription index
    for (const conversationId of session.subscriptions) {
      const indexSet = this.subscriptionIndex.get(conversationId);
      if (indexSet) {
        indexSet.delete(sessionId);
        if (indexSet.size === 0) {
          this.subscriptionIndex.delete(conversationId);
        }
      }
    }
    session.subscriptions.clear();
    return true;
  }

  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Ensure index is clean even if closeSession was not called first.
    for (const conversationId of session.subscriptions) {
      const indexSet = this.subscriptionIndex.get(conversationId);
      if (indexSet) {
        indexSet.delete(sessionId);
        if (indexSet.size === 0) {
          this.subscriptionIndex.delete(conversationId);
        }
      }
    }

    this.sessions.delete(sessionId);
    return true;
  }

  getSubscriptions(sessionId: string): Set<string> {
    const session = this.sessions.get(sessionId);
    return session ? new Set(session.subscriptions) : new Set();
  }

  sweepExpiredSessions(maxIdleMs: number): Array<{ sessionId: string; reason: string }> {
    const now = Date.now();
    const evicted: Array<{ sessionId: string; reason: string }> = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.closed) continue;

      const idleMs = now - session.lastHeartbeatAt;
      const expired = now > session.expiresAt;

      if (expired || idleMs > maxIdleMs) {
        const reason = expired ? "token_expired" : "idle_timeout";
        this.closeSession(sessionId, reason);
        evicted.push({ sessionId, reason });
      }
    }

    return evicted;
  }

  getStats(): SessionRegistryStats {
    let totalSubscriptions = 0;
    const sessionsByOrg = new Map<string, number>();

    for (const session of this.sessions.values()) {
      totalSubscriptions += session.subscriptions.size;
      sessionsByOrg.set(session.orgId, (sessionsByOrg.get(session.orgId) ?? 0) + 1);
    }

    return {
      totalSessions: this.sessions.size,
      totalSubscriptions,
      sessionsByOrg,
    };
  }

  getSessionsForConversation(conversationId: string): RealtimeSession[] {
    const indexSet = this.subscriptionIndex.get(conversationId);
    if (!indexSet) return [];

    const result: RealtimeSession[] = [];
    for (const sessionId of indexSet) {
      const session = this.sessions.get(sessionId);
      if (session && !session.closed) {
        result.push(session);
      }
    }
    return result;
  }

  getSessionsByOrg(orgId: string): RealtimeSession[] {
    const result: RealtimeSession[] = [];
    for (const session of this.sessions.values()) {
      if (session.orgId === orgId && !session.closed) {
        result.push(session);
      }
    }
    return result;
  }

  pruneSubscriptionsForUser(
    orgId: string,
    conversationId: string,
    userId: string,
  ): string[] {
    const pruned: string[] = [];
    for (const [sessionId, session] of this.sessions) {
      if (session.orgId !== orgId || session.userId !== userId) continue;
      if (!session.subscriptions.has(conversationId)) continue;

      session.subscriptions.delete(conversationId);
      const indexSet = this.subscriptionIndex.get(conversationId);
      if (indexSet) {
        indexSet.delete(sessionId);
        if (indexSet.size === 0) {
          this.subscriptionIndex.delete(conversationId);
        }
      }
      pruned.push(sessionId);
    }
    return pruned;
  }

  findDuplicateSession(sessionId: string): RealtimeSession | undefined {
    return this.sessions.get(sessionId);
  }
}
