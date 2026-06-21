# Mailbox Platform — Operations Runbook

> **Scope:** Sprint 8.3 — QA, Telemetry, Docs, and Launch Readiness
> **Last Updated:** 2026-06-18
> **Owner:** Platform Engineering

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Org Tenant Boundary                         │
│                                                                     │
│  ┌──────────────────┐      ┌──────────────────────────────────────┐ │
│  │  MailboxConnection│─────▶│       MailboxCredential              │ │
│  │  (provider acct) │      │  (AES-256-GCM encrypted token store) │ │
│  └────────┬─────────┘      └──────────────────────────────────────┘ │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐      ┌──────────────────────────────────────┐ │
│  │  MailboxSyncRun  │      │      MailboxFolderCoverage            │ │
│  │  RUNNING /       │      │  (per-folder pagination checkpoint)   │ │
│  │  COMPLETED /     │      └──────────────────────────────────────┘ │
│  │  FAILED          │                                               │
│  └────────┬─────────┘                                               │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────┐      ┌──────────────────────────────────────┐ │
│  │  MailboxThread   │──────│         MailboxMessage               │ │
│  └──────────────────┘      └──────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Purpose |
|---|---|---|
| `runMailboxSync` | `mailbox-sync-service.ts` | Orchestrates full/delta sync lifecycle |
| `sendDraft` | `send-service.ts` | Sends outbound messages with idempotency |
| `createMailboxConnection` | `connection-service.ts` | Connects a new mailbox provider account |
| `withMailboxLock` | `mailbox-lock-service.ts` | PostgreSQL advisory lock preventing concurrent syncs |
| `logMailboxTelemetry` | `telemetry.ts` | Structured stdout telemetry events |
| `captureMailboxError` | `telemetry.ts` | PII-safe Sentry error forwarding |
| `getMailboxHealthMetrics` | `metrics.ts` | Aggregate sync health statistics |
| `getMailboxAdoptionMetrics` | `metrics.ts` | Connection adoption counts by status/provider |

---

## 2. Sync Recovery & Replay Flow

### Normal Sync Lifecycle

```
runMailboxSync
  └─ acquireSyncLease()            ← Sets syncLeaseToken + expiry on MailboxConnection
  └─ withMailboxLock()             ← pg_try_advisory_xact_lock (per-connection)
      └─ db.mailboxSyncRun.create  ← status=RUNNING
      └─ [telemetry: sync_started]
      └─ adapter.syncDelta()       ← Fetches threads from provider
      └─ ingestSyncedThreads()     ← Upserts threads/messages/attachments
      └─ upsertMailboxCursor()     ← Advances cursor ONLY after success
      └─ db.mailboxSyncRun.update  ← status=COMPLETED
      └─ [telemetry: sync_completed]
  └─ releaseSyncLease()            ← Guaranteed in outer finally block
```

### Error Classification & Recovery Actions

| Error Category | Failure Class | Connection Status | Recovery Action |
|---|---|---|---|
| `auth_expired` | `auth_failure` | `RECONNECT_REQUIRED` | User must reconnect |
| `auth_insufficient` | `auth_failure` | `RECONNECT_REQUIRED` | User must reconnect |
| `rate_limited` | `rate_limit` | `DEGRADED` | Auto-retry next scheduled sync |
| `quota_exceeded` | `rate_limit` | `DEGRADED` | Auto-retry next scheduled sync |
| `provider_unavailable` | `transient` | `DEGRADED` | Auto-retry with backoff |
| `cursor_invalid` | `replay_required` | Unchanged | Cursor cleared → next sync is INITIAL |
| `unknown` | `unknown` | `DEGRADED` | Manual investigation |

### Replay Required

When `isReplayRequired(failureClass)` is true:
1. All cursors for the connection are deleted (`deleteMailboxCursors`).
2. Per-folder coverage cursors are reset (`resetFolderCoverageCursor`).
3. The next sync automatically runs in `INITIAL` mode.

> [!WARNING]
> A replay sync re-ingests all historical threads. For large mailboxes this can take 20–60 minutes. Do not trigger manual syncs repeatedly during this window.

---

## 3. Stall Mitigation

### What Is a Stall?

A stall is a `MailboxSyncRun` with `status=RUNNING` whose `lastHeartbeatAt` (or `startedAt` if no heartbeat) is more than **30 minutes** old.

### Automatic Stall Cleanup

`cleanStaleSyncRuns()` is called at the top of every `runMailboxSync` call. It bulk-updates:

```sql
UPDATE mailbox_sync_run
SET status = 'FAILED',
    completed_at = NOW(),
    error_category = 'unknown',
    error_summary = 'Sync run abandoned — did not complete within expected time'
WHERE org_id = $1
  AND mailbox_connection_id = $2
  AND status = 'RUNNING'
  AND started_at < NOW() - INTERVAL '30 minutes';
```

### Sync Lease Release Guarantee

The sync lease is released in an **outer `finally` block** in `runMailboxSync`, ensuring the lease is freed even if:
- `withMailboxLock` throws `MAILBOX_LOCKED`
- The callback throws an unexpected error
- The provider API times out mid-sync

### Manual Stall Remediation

If a sync appears stuck in the UI but automated cleanup hasn't fired:

```sql
-- Identify stalled runs
SELECT id, org_id, mailbox_connection_id, started_at, last_heartbeat_at
FROM mailbox_sync_run
WHERE status = 'RUNNING'
  AND COALESCE(last_heartbeat_at, started_at) < NOW() - INTERVAL '30 minutes';

-- Force-fail them
UPDATE mailbox_sync_run
SET status = 'FAILED',
    completed_at = NOW(),
    error_summary = 'Manually force-failed by operator'
WHERE status = 'RUNNING'
  AND COALESCE(last_heartbeat_at, started_at) < NOW() - INTERVAL '30 minutes';

-- Clear the sync lease on the connection
UPDATE mailbox_connection
SET sync_lease_token = NULL,
    sync_lease_expires_at = NULL
WHERE id = '<connection_id>';
```

---

## 4. Monitoring Guidelines

### Structured Telemetry Events

All telemetry events are written to **stdout** as single-line JSON prefixed with `[MAILBOX_TELEMETRY]`. Query them in your log aggregator (Datadog, CloudWatch, Loki) with:

```
[MAILBOX_TELEMETRY] {"timestamp":"...","event":"sync_completed",...}
```

#### Event Reference

| Event | Emitted By | Key Fields |
|---|---|---|
| `sync_started` | `mailbox-sync-service.ts` | `orgId`, `connectionId`, `provider`, `syncMode`, `triggerSource`, `runId` |
| `sync_progress` | `mailbox-sync-service.ts` | `orgId`, `connectionId`, `runId`, `threadCount`, `messageCount`, `syncPhase` |
| `sync_completed` | `mailbox-sync-service.ts` | `orgId`, `connectionId`, `runId`, `threadCount`, `messageCount`, `durationMs` |
| `sync_failed` | `mailbox-sync-service.ts` | `orgId`, `connectionId`, `runId`, `errorCategory`, `errorSummary`, `durationMs` |
| `send_attempt_started` | `send-service.ts` | `orgId`, `userId`, `draftId`, `mailboxConnectionId`, `mode` |
| `send_attempt_completed` | `send-service.ts` | `orgId`, `draftId`, `mailboxConnectionId`, `providerMessageId` |
| `send_attempt_failed` | `send-service.ts` | `orgId`, `draftId`, `errorCategory`, `errorSummary`, `retryable` |
| `connection_created` | `connection-service.ts` | `orgId`, `connectionId`, `provider`, `emailAddress`, `connectedBy` |
| `connection_status_updated` | `connection-service.ts` | `orgId`, `connectionId`, `newStatus`, `reason` |
| `connection_deleted` | `connection-service.ts` | `orgId`, `connectionId` |
| `mailbox_error_captured` | `telemetry.ts` | `errorMessage`, context fields |

### Sentry Alert Configuration

Sentry receives errors only for **unexpected, non-transient** failures. Transient categories (`rate_limited`, `quota_exceeded`, `provider_unavailable`, `concurrent_sync_running`) are suppressed to prevent alert fatigue.

Recommended Sentry alert rules:
- Alert if `mailbox_error_captured` events spike > 10/min for a single org.
- Alert on any new error fingerprint not seen in the past 24 hours.
- Alert if `sync_failed` with `errorCategory=auth_expired` fires for the same connection > 3 times/hour (token refresh loop).

### Key Metrics Queries (using `getMailboxHealthMetrics`)

```typescript
const health = await getMailboxHealthMetrics("org-xxx", {
  startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // last 24h
});
console.log(health.successRate);         // e.g. 0.97
console.log(health.latencyMs.p90);       // e.g. 45000ms
console.log(health.stalledRuns);         // should be 0
console.log(health.errorsByCategory);   // e.g. { auth_expired: 2 }
```

---

## 5. Troubleshooting Steps

### Sync Not Running / Stuck on RUNNING

1. Check for stalled runs using the SQL above.
2. Verify the sync lease: `SELECT sync_lease_token, sync_lease_expires_at FROM mailbox_connection WHERE id = '<id>'`.
3. If lease has expired but status is still `RUNNING`, force-clear it (SQL above).
4. Trigger a manual sync via the admin API: `POST /api/admin/mailbox/[connectionId]/sync`.

### Token Auth Failures (`auth_expired`)

1. Connection status will be `RECONNECT_REQUIRED`.
2. User must navigate to **Settings → Connected Mailboxes** and click **Reconnect**.
3. This triggers a new OAuth flow, stores a fresh `MailboxCredential`, and updates `tokenRef`.
4. After reconnect, trigger a manual sync to verify recovery.

### Provider Rate Limits (`rate_limited` / `quota_exceeded`)

1. Connection status moves to `DEGRADED` — **this is expected, not a bug**.
2. The next scheduled sync will auto-retry after the back-off window.
3. Do **not** trigger manual syncs repeatedly — this will consume quota faster.
4. Check `getMailboxHealthMetrics` to see how frequently rate limits are occurring.

### Cursor Invalid / Replay Required

1. All cursors are cleared automatically — the next sync starts fresh (`INITIAL` mode).
2. Watch for `sync_started` telemetry events with `syncMode=INITIAL` to confirm recovery.
3. Large mailboxes may take multiple sync cycles to fully re-ingest.

### Send Failures

1. Check `send_attempt_failed` telemetry events for `errorCategory`.
2. `auth_expired` / `auth_insufficient` → Reconnect required.
3. `not_found` → Draft or thread was deleted on provider side.
4. `quota_exceeded` → Rate limit; retry after a few minutes.
5. Pending reconciliation attempts auto-resolve on the next `reconcileSendAttempt` call.

---

## 6. Launch Readiness Checklist

> [!IMPORTANT]
> Complete every item before promoting to production.

### Infrastructure

- [ ] `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` environment variable is set in production.
- [ ] `MAILBOX_CREDENTIAL_ENCRYPTION_KEY` is set and is a 32-byte AES-256 key.
- [ ] `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` are set.
- [ ] PostgreSQL advisory lock support confirmed (`pg_try_advisory_xact_lock` available).
- [ ] Supabase Storage RLS policies allow server-side uploads for mailbox attachments.

### Database

- [ ] `prisma migrate deploy` has been run against the production database.
- [ ] `mailbox_sync_run`, `mailbox_connection`, `mailbox_credential`, `mailbox_folder_coverage` tables all exist.
- [ ] Indexes confirmed: `@@index([orgId, mailboxConnectionId, startedAt])` on `mailbox_sync_run`.
- [ ] Run `SELECT COUNT(*) FROM mailbox_sync_run WHERE status = 'RUNNING'` — should be 0 before launch.

### Telemetry

- [ ] Verify `[MAILBOX_TELEMETRY]` lines are appearing in the log aggregator for a test org.
- [ ] Verify Sentry is receiving test exceptions (trigger a manual `captureError` call).
- [ ] Confirm transient categories (`rate_limited`, `quota_exceeded`) do NOT appear in Sentry.

### Test Suite

- [ ] `npx vitest run src/lib/mailbox/` passes — all 759+ tests green.
- [ ] `mailbox-sprint-8-3.test.ts` specifically passes all assertions.
- [ ] No TypeScript errors: `npx tsc --noEmit` exits 0.

### Operational

- [ ] At least one test Gmail account has been successfully connected and synced in staging.
- [ ] Stale run cleanup has been verified: force a stale `RUNNING` run and confirm it gets cleaned.
- [ ] Sync lease release verified: trigger a `MAILBOX_LOCKED` rejection and confirm the lease is still freed.
- [ ] Manual sync trigger tested via admin API endpoint.
- [ ] `getMailboxAdoptionMetrics` and `getMailboxHealthMetrics` return valid data for staging org.
- [ ] Runbook has been reviewed by at least one team member.
