import "server-only";

import { db } from "@/lib/db";
import {
  CalendarProvider,
  ConversationMeetingRecord,
  MessagingTaskRecord,
  CalendarConnectionRecord,
} from "./domain-types";
import { getCalendarProviderAdapter } from "./calendar-providers";
import { decryptIntegrationSecret, encryptIntegrationSecret } from "../integrations/secrets";
import { logMessagingAuditTx } from "./audit";
import { updateConnectionHealth } from "./calendar-connection-service";
import { toMeetingRecord, toTaskRecord } from "./mappers";
import { ConversationAccessError, NotFoundError } from "./errors";

// Helper to parse and serialize multiple provider event IDs in a single text column
export function parseProviderEventIds(raw: string | null): Record<string, string> {
  if (!raw) return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  } catch {}
  // Fallback / legacy support (flat string assumed as GOOGLE event ID)
  return { GOOGLE: raw } as Record<string, string>;
}

export function serializeProviderEventIds(ids: Record<string, string>): string {
  return JSON.stringify(ids);
}

/**
 * Decrypts the token reference from connection record.
 */
export function getDecryptedTokens(connection: CalendarConnectionRecord) {
  if (!connection.tokenRef) {
    throw new Error("Calendar connection does not contain token reference");
  }
  const parsed = JSON.parse(connection.tokenRef);
  return {
    accessToken: decryptIntegrationSecret(parsed.accessToken),
    refreshToken: decryptIntegrationSecret(parsed.refreshToken),
  };
}

/**
 * Checks connection token expiry, refreshes if expired or close to expiry (within 5 minutes).
 * Persists the encrypted new access token safely and updates DB.
 */
export async function refreshConnectionTokensIfNeeded(
  orgId: string,
  connection: CalendarConnectionRecord,
): Promise<string> {
  const { accessToken, refreshToken } = getDecryptedTokens(connection);

  const bufferMs = 5 * 60 * 1000; // 5 mins buffer
  const isExpired =
    connection.tokenExpiry &&
    new Date().getTime() + bufferMs >= new Date(connection.tokenExpiry).getTime();

  if (!isExpired) {
    return accessToken;
  }

  try {
    const adapter = getCalendarProviderAdapter(connection.provider);
    const refreshed = await adapter.refreshAccessToken(refreshToken);

    const encryptedTokenRef = JSON.stringify({
      accessToken: encryptIntegrationSecret(refreshed.accessToken),
      refreshToken: encryptIntegrationSecret(refreshToken),
    });

    const tokenExpiry = new Date(Date.now() + refreshed.expiresInSeconds * 1000);

    await db.calendarConnection.update({
      where: { id: connection.id, orgId },
      data: {
        tokenRef: encryptedTokenRef,
        tokenExpiry,
        status: "ACTIVE",
        lastSyncError: null,
      },
    });

    return refreshed.accessToken;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Token refresh failed";
    console.error(`[provider-sync] Failed to refresh token for connection ${connection.id}:`, error);
    
    // Shift connection to RECONNECT_REQUIRED state on auth refresh failure
    await updateConnectionHealth({
      orgId,
      connectionId: connection.id,
      status: "RECONNECT_REQUIRED",
      lastSyncError: "Access token refresh failed: authorization revoked or expired.",
      actorId: connection.connectedBy,
    });

    throw new Error("Calendar connection requires reconnect");
  }
}

/**
 * Synchronize a meeting to connected organization providers.
 * Idempotent: creates event if missing, updates if changed, deletes if cancelled.
 */
export async function syncMeetingToProvider(orgId: string, meetingId: string): Promise<ConversationMeetingRecord> {
  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) {
    throw new NotFoundError("Meeting not found");
  }

  // Enforce archived/locked conversation restrictions
  const conversation = await db.conversation.findFirst({
    where: { id: meeting.conversationId, orgId },
  });

  if (!conversation) {
    throw new NotFoundError("Conversation not found");
  }

  if (conversation.archivedAt || conversation.lockedAt) {
    throw new ConversationAccessError("syncMeetingToProvider: mutation restricted on archived or locked conversation");
  }

  if (!db.calendarConnection) {
    return toMeetingRecord(meeting);
  }

  // Retrieve active connections
  const connections = await db.calendarConnection.findMany({
    where: {
      orgId,
      status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] },
    },
  });

  if (connections.length === 0) {
    return toMeetingRecord(meeting);
  }

  // Map participant emails
  const participants = await db.conversationParticipant.findMany({
    where: { orgId, conversationId: meeting.conversationId, leftAt: null },
    include: {
      user: {
        select: { email: true },
      },
    },
  });

  const attendeeEmails = participants.map((p) => p.user.email).filter(Boolean);
  const currentEventIds = parseProviderEventIds(meeting.providerEventId);
  const updatedEventIds = { ...currentEventIds };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic metadata merge object
  const metadataPatch: Record<string, unknown> = meeting.metadata ? { ...(meeting.metadata as Record<string, unknown>) } : {};

  for (const conn of connections) {
    const provider = conn.provider;
    try {
      const activeAccessToken = await refreshConnectionTokensIfNeeded(orgId, {
        id: conn.id,
        orgId: conn.orgId,
        provider: conn.provider,
        providerAccountId: conn.providerAccountId,
        emailAddress: conn.emailAddress,
        displayName: conn.displayName,
        tokenRef: conn.tokenRef,
        tokenExpiry: conn.tokenExpiry,
        status: conn.status,
        lastSyncAt: conn.lastSyncAt,
        lastSyncError: conn.lastSyncError,
        disconnectedAt: conn.disconnectedAt,
        connectedBy: conn.connectedBy,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      });

      const adapter = getCalendarProviderAdapter(provider);
      
      // Connection-keyed mapping lookup with legacy provider-keyed fallback & migration
      const key = conn.id;
      let remoteEventId = updatedEventIds[key];
      if (!remoteEventId && updatedEventIds[provider]) {
        remoteEventId = updatedEventIds[provider];
        updatedEventIds[key] = remoteEventId;
        delete updatedEventIds[provider];
      }

      if (meeting.status === "CANCELLED") {
        if (remoteEventId) {
          try {
            await adapter.deleteEvent(activeAccessToken, remoteEventId);
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : "";
            const isNotFound = errMsg.includes("404") || errMsg.toLowerCase().includes("not found") || errMsg.includes("notFound");
            if (!isNotFound) {
              throw err;
            }
          }
          delete updatedEventIds[key];
          delete updatedEventIds[provider]; // also clean up legacy if any
        }
      } else {
        const startAt = meeting.scheduledAt;
        const endAt = new Date(startAt.getTime() + meeting.durationMinutes * 60 * 1000);

        if (!remoteEventId) {
          // CREATE
          const result = await adapter.createEvent(activeAccessToken, {
            title: meeting.title,
            description: meeting.description,
            startAt,
            endAt,
            attendeeEmails,
          });

          updatedEventIds[key] = result.providerEventId;
          if (result.joinUrl) {
            metadataPatch.joinUrl = result.joinUrl;
          }
          if (result.attendeeResponses) {
            metadataPatch.attendeeResponses = {
              ...metadataPatch.attendeeResponses,
              ...result.attendeeResponses,
            };
          }
        } else {
          // UPDATE
          try {
            const result = await adapter.updateEvent(activeAccessToken, remoteEventId, {
              title: meeting.title,
              description: meeting.description,
              startAt,
              endAt,
              attendeeEmails,
            });

            if (result.joinUrl) {
              metadataPatch.joinUrl = result.joinUrl;
            }
            if (result.attendeeResponses) {
              metadataPatch.attendeeResponses = {
                ...metadataPatch.attendeeResponses,
                ...result.attendeeResponses,
              };
            }
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : "";
            if (errMsg.includes("404") || errMsg.toLowerCase().includes("not found") || errMsg.includes("notFound")) {
              // Remote event has been deleted. Re-create it!
              const result = await adapter.createEvent(activeAccessToken, {
                title: meeting.title,
                description: meeting.description,
                startAt,
                endAt,
                attendeeEmails,
              });
              updatedEventIds[key] = result.providerEventId;
              if (result.joinUrl) {
                metadataPatch.joinUrl = result.joinUrl;
              }
              if (result.attendeeResponses) {
                metadataPatch.attendeeResponses = {
                  ...metadataPatch.attendeeResponses,
                  ...result.attendeeResponses,
                };
              }
            } else {
              throw err;
            }
          }
        }
      }

      // Mark health as successful
      await db.calendarConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed sync";
      console.error(`[provider-sync] Failed sync for provider ${provider}:`, err);
      // Fail safely without throwing out of the whole loop, register degraded error status
      await db.calendarConnection.update({
        where: { id: conn.id },
        data: { lastSyncError: message },
      });
    }
  }

  // Update meeting record with event IDs & metadata
  const serializedEventIds = serializeProviderEventIds(updatedEventIds);
  const updatedMeeting = await db.$transaction(async (tx) => {
    const res = await tx.conversationMeeting.update({
      where: { id: meetingId },
      data: {
        providerEventId: serializedEventIds,
        metadata: metadataPatch,
        joinUrl: metadataPatch.joinUrl ?? null,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: meeting.scheduledBy,
      action: "MEETING_UPDATED",
      summary: `Meeting calendar synced successfully`,
      conversationId: meeting.conversationId,
      meetingId,
      metadata: { // @ts-ignore syncedProviders: Object.keys(updatedEventIds) },
    });

    return res;
  });

  return toMeetingRecord(updatedMeeting);
}

/**
 * Synchronize a task due date to connected organization providers.
 * Publication Rules:
 *  - Event is created if the task has a dueDate and is in open status (OPEN, IN_PROGRESS, OVERDUE).
 *  - Event is deleted/removed if task is resolved (DONE, CANCELLED) or dueDate is removed.
 *  - Reassignment updates assignee context/details in description.
 */
export async function syncTaskToProvider(orgId: string, taskId: string): Promise<MessagingTaskRecord> {
  const task = await db.messagingTask.findFirst({
    where: { id: taskId, orgId },
  });

  if (!task) {
    throw new NotFoundError("Task not found");
  }

  if (!db.calendarConnection) {
    return toTaskRecord(task);
  }

  const connections = await db.calendarConnection.findMany({
    where: {
      orgId,
      status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] },
    },
  });

  if (connections.length === 0) {
    return toTaskRecord(task);
  }

  // Determine publication eligibility
  const isOpen = task.status === "OPEN" || task.status === "IN_PROGRESS" || task.status === "OVERDUE";
  const isEligible = task.dueDate !== null && isOpen;

  const currentEventIds = parseProviderEventIds(task.providerEventId);
  const updatedEventIds = { ...currentEventIds };

  // Fetch assignee profile if set
  let assigneeName = "Unassigned";
  if (task.assigneeId) {
    const assigneeProfile = await db.profile.findFirst({
      where: { id: task.assigneeId },
      select: { name: true },
    });
    if (assigneeProfile) {
      assigneeName = assigneeProfile.name;
    }
  }

  for (const conn of connections) {
    const provider = conn.provider;
    try {
      const activeAccessToken = await refreshConnectionTokensIfNeeded(orgId, {
        id: conn.id,
        orgId: conn.orgId,
        provider: conn.provider,
        providerAccountId: conn.providerAccountId,
        emailAddress: conn.emailAddress,
        displayName: conn.displayName,
        tokenRef: conn.tokenRef,
        tokenExpiry: conn.tokenExpiry,
        status: conn.status,
        lastSyncAt: conn.lastSyncAt,
        lastSyncError: conn.lastSyncError,
        disconnectedAt: conn.disconnectedAt,
        connectedBy: conn.connectedBy,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      });

      const adapter = getCalendarProviderAdapter(provider);
      
      // Connection-keyed mapping lookup with legacy provider-keyed fallback & migration
      const key = conn.id;
      let remoteEventId = updatedEventIds[key];
      if (!remoteEventId && updatedEventIds[provider]) {
        remoteEventId = updatedEventIds[provider];
        updatedEventIds[key] = remoteEventId;
        delete updatedEventIds[provider];
      }

      if (!isEligible) {
        // DELETE event if previously published but no longer eligible
        if (remoteEventId) {
          try {
            await adapter.deleteEvent(activeAccessToken, remoteEventId);
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : "";
            const isNotFound = errMsg.includes("404") || errMsg.toLowerCase().includes("not found") || errMsg.includes("notFound");
            if (!isNotFound) {
              throw err;
            }
          }
          delete updatedEventIds[key];
          delete updatedEventIds[provider]; // also clean up legacy if any
        }
      } else {
        const startAt = task.dueDate!;
        // End time is a 30-minute block on the due date
        const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

        const eventInput = {
          title: `Due: ${task.title}`,
          description: `Task deadline. Status: ${task.status}. Priority: ${task.priority === 3 ? "critical" : task.priority === 2 ? "high" : task.priority === 1 ? "medium" : "low"}.\nAssignee: ${assigneeName}\nDescription: ${task.description || "None"}`,
          startAt,
          endAt,
        };

        if (!remoteEventId) {
          // CREATE
          const result = await adapter.createEvent(activeAccessToken, eventInput);
          updatedEventIds[key] = result.providerEventId;
        } else {
          // UPDATE
          try {
            await adapter.updateEvent(activeAccessToken, remoteEventId, eventInput);
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : "";
            if (errMsg.includes("404") || errMsg.toLowerCase().includes("not found") || errMsg.includes("notFound")) {
              // Remote event has been deleted. Re-create it!
              const result = await adapter.createEvent(activeAccessToken, eventInput);
              updatedEventIds[key] = result.providerEventId;
            } else {
              throw err;
            }
          }
        }
      }

      await db.calendarConnection.update({
        where: { id: conn.id },
        data: { lastSyncAt: new Date(), lastSyncError: null },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed task sync";
      console.error(`[provider-sync] Failed task sync for provider ${provider}:`, err);
      await db.calendarConnection.update({
        where: { id: conn.id },
        data: { lastSyncError: message },
      });
    }
  }

  const serializedEventIds = serializeProviderEventIds(updatedEventIds);
  const updatedTask = await db.$transaction(async (tx) => {
    const res = await tx.messagingTask.update({
      where: { id: taskId },
      data: {
        providerEventId: serializedEventIds,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId: task.createdBy,
      action: "TASK_UPDATED",
      summary: `Task calendar synced successfully`,
      conversationId: task.conversationId,
      taskId,
      metadata: { // @ts-ignore syncedProviders: Object.keys(updatedEventIds) },
    });

    return res;
  });

  return toTaskRecord(updatedTask);
}

/**
 * Inbound reconciliation: compares local Slipwise meeting details to remote provider-side details.
 * Drift Updates (title, scheduledAt) and Remote Cancellations reconcile back intentionally.
 * Compares and updates local RSVP states as well.
 */
export async function reconcileProviderChangesForMeeting(orgId: string, meetingId: string, actorId: string): Promise<ConversationMeetingRecord> {
  const meeting = await db.conversationMeeting.findFirst({
    where: { id: meetingId, orgId },
  });

  if (!meeting) {
    throw new NotFoundError("Meeting not found");
  }

  // Abort if meeting is locked or cancelled locally (race checks)
  if (meeting.status === "CANCELLED") {
    return toMeetingRecord(meeting);
  }

  const conversation = await db.conversation.findFirst({
    where: { id: meeting.conversationId, orgId },
  });

  if (!conversation || conversation.archivedAt || conversation.lockedAt) {
    // Locked or archived conversation prevents inbound reconciliation modifications
    return toMeetingRecord(meeting);
  }

  const connections = await db.calendarConnection.findMany({
    where: {
      orgId,
      status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] },
    },
  });

  if (connections.length === 0) {
    return toMeetingRecord(meeting);
  }

  const currentEventIds = parseProviderEventIds(meeting.providerEventId);
  const resolvedMeeting = { ...meeting };
  const metadataPatch: { joinUrl?: string | null; attendeeResponses?: Record<string, string>; [key: string]: unknown } = meeting.metadata ? { ...(meeting.metadata as Record<string, unknown>) } : {};
  let statusUpdate: string | null = null;
  let hasDrift = false;

  for (const conn of connections) {
    const provider = conn.provider;
    const remoteEventId = currentEventIds[conn.id] || currentEventIds[provider];
    if (!remoteEventId) continue;

    try {
      const activeAccessToken = await refreshConnectionTokensIfNeeded(orgId, {
        id: conn.id,
        orgId: conn.orgId,
        provider: conn.provider,
        providerAccountId: conn.providerAccountId,
        emailAddress: conn.emailAddress,
        displayName: conn.displayName,
        tokenRef: conn.tokenRef,
        tokenExpiry: conn.tokenExpiry,
        status: conn.status,
        lastSyncAt: conn.lastSyncAt,
        lastSyncError: conn.lastSyncError,
        disconnectedAt: conn.disconnectedAt,
        connectedBy: conn.connectedBy,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      });

      const adapter = getCalendarProviderAdapter(provider);
      const remoteEvent = await adapter.getEvent(activeAccessToken, remoteEventId);

      if (!remoteEvent || remoteEvent.status === "CANCELLED") {
        // Inbound remote cancellation reconciled
        statusUpdate = "CANCELLED";
        delete currentEventIds[conn.id];
        delete currentEventIds[provider];
        hasDrift = true;
      } else {
        // Title or scheduledTime drift checked
        if (remoteEvent.title && remoteEvent.title.trim() !== resolvedMeeting.title) {
          resolvedMeeting.title = remoteEvent.title.trim();
          hasDrift = true;
        }

        const remoteStartMs = remoteEvent.startAt.getTime();
        const localStartMs = resolvedMeeting.scheduledAt.getTime();
        if (Math.abs(remoteStartMs - localStartMs) > 1000) {
          resolvedMeeting.scheduledAt = remoteEvent.startAt;
          
          // Calculate duration in minutes
          const duration = Math.round((remoteEvent.endAt.getTime() - remoteStartMs) / (60 * 1000));
          if (duration > 0) {
            resolvedMeeting.durationMinutes = duration;
          }
          hasDrift = true;
        }

        // Reconcile attendee responses
        if (remoteEvent.attendeeResponses) {
          metadataPatch.attendeeResponses = {
            ...metadataPatch.attendeeResponses,
            ...remoteEvent.attendeeResponses,
          };
          hasDrift = true;
        }

        // Reconcile joinUrl drift
        if (remoteEvent.joinUrl && remoteEvent.joinUrl !== resolvedMeeting.joinUrl) {
          resolvedMeeting.joinUrl = remoteEvent.joinUrl;
          hasDrift = true;
        }
      }
    } catch (err) {
      console.error(`[provider-reconciliation] Failed reconciliation check for provider ${provider}:`, err);
    }
  }

  if (!hasDrift) {
    return toMeetingRecord(meeting);
  }

  const updatedMeeting = await db.$transaction(async (tx) => {
    const updated = await tx.conversationMeeting.update({
      where: { id: meetingId },
      data: {
        title: resolvedMeeting.title,
        scheduledAt: resolvedMeeting.scheduledAt,
        durationMinutes: resolvedMeeting.durationMinutes,
        status: statusUpdate === "CANCELLED" ? "CANCELLED" : resolvedMeeting.status,
        cancelledAt: statusUpdate === "CANCELLED" ? new Date() : resolvedMeeting.cancelledAt,
        cancelledBy: statusUpdate === "CANCELLED" ? actorId : resolvedMeeting.cancelledBy,
        cancelReason: statusUpdate === "CANCELLED" ? "Remote calendar cancellation reconciled" : resolvedMeeting.cancelReason,
        metadata: metadataPatch,
        joinUrl: resolvedMeeting.joinUrl,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId,
      action: statusUpdate === "CANCELLED" ? "MEETING_CANCELLED" : "MEETING_UPDATED",
      summary: statusUpdate === "CANCELLED"
        ? `Reconciled provider cancellation back into Slipwise`
        : `Reconciled provider drift changes (title/time/attendees) back into Slipwise`,
      conversationId: meeting.conversationId,
      meetingId,
      metadata: { // @ts-ignore statusUpdate, reconciledFields: ["title", "scheduledAt", "durationMinutes", "attendees"] },
    });

    return updated;
  });

  return toMeetingRecord(updatedMeeting);
}

/**
 * Inbound reconciliation for task due date.
 */
export async function reconcileProviderChangesForTask(orgId: string, taskId: string, actorId: string): Promise<MessagingTaskRecord> {
  const task = await db.messagingTask.findFirst({
    where: { id: taskId, orgId },
  });

  if (!task) {
    throw new NotFoundError("Task not found");
  }

  if (task.status === "DONE" || task.status === "CANCELLED") {
    return toTaskRecord(task);
  }

  const connections = await db.calendarConnection.findMany({
    where: {
      orgId,
      status: { in: ["ACTIVE", "RECONNECT_REQUIRED"] },
    },
  });

  if (connections.length === 0) {
    return toTaskRecord(task);
  }

  const currentEventIds = parseProviderEventIds(task.providerEventId);
  let resolvedDueDate = task.dueDate;
  let hasDrift = false;

  for (const conn of connections) {
    const provider = conn.provider;
    const remoteEventId = currentEventIds[conn.id] || currentEventIds[provider];
    if (!remoteEventId) continue;

    try {
      const activeAccessToken = await refreshConnectionTokensIfNeeded(orgId, {
        id: conn.id,
        orgId: conn.orgId,
        provider: conn.provider,
        providerAccountId: conn.providerAccountId,
        emailAddress: conn.emailAddress,
        displayName: conn.displayName,
        tokenRef: conn.tokenRef,
        tokenExpiry: conn.tokenExpiry,
        status: conn.status,
        lastSyncAt: conn.lastSyncAt,
        lastSyncError: conn.lastSyncError,
        disconnectedAt: conn.disconnectedAt,
        connectedBy: conn.connectedBy,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      });

      const adapter = getCalendarProviderAdapter(provider);
      const remoteEvent = await adapter.getEvent(activeAccessToken, remoteEventId);

      if (!remoteEvent) {
        // Remote deletion reconciled (remove mapping event ID)
        delete currentEventIds[conn.id];
        delete currentEventIds[provider];
        hasDrift = true;
      } else {
        const remoteDueMs = remoteEvent.startAt.getTime();
        const localDueMs = resolvedDueDate ? resolvedDueDate.getTime() : 0;
        if (Math.abs(remoteDueMs - localDueMs) > 1000) {
          resolvedDueDate = remoteEvent.startAt;
          hasDrift = true;
        }
      }
    } catch (err) {
      console.error(`[provider-reconciliation] Failed task reconciliation check for provider ${provider}:`, err);
    }
  }

  if (!hasDrift) {
    return toTaskRecord(task);
  }

  const serializedEventIds = serializeProviderEventIds(currentEventIds);
  const updatedTask = await db.$transaction(async (tx) => {
    const updated = await tx.messagingTask.update({
      where: { id: taskId },
      data: {
        dueDate: resolvedDueDate,
        providerEventId: serializedEventIds,
      },
    });

    await logMessagingAuditTx(tx, {
      orgId,
      actorId,
      action: "TASK_UPDATED",
      summary: `Reconciled provider task due-date drift changes back into Slipwise`,
      conversationId: task.conversationId,
      taskId,
      metadata: { // @ts-ignore reconciledFields: ["dueDate", "providerEventId"] },
    });

    return updated;
  });

  return toTaskRecord(updatedTask);
}
