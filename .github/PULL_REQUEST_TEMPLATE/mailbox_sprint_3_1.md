## Summary

Implements the initial sync pipeline for Mailbox Platform Phase 3 Sprint 3.1.

### Schema
- Added `MailboxThread`, `MailboxMessage`, `MailboxAttachment`, `MailboxSyncRun` models
- Added `MailboxSyncRunStatus` enum (`RUNNING`, `COMPLETED`, `FAILED`)
- Extended `MailboxAuditAction` with `SYNC_COMPLETED`, `SYNC_FAILED`
- Migration: `20260511100829_mailbox_sprint_3_1_sync_pipeline`

### Domain & Contracts
- Extended `domain-types.ts` with record types (`MailboxThreadRecord`, `MailboxMessageRecord`, `MailboxAttachmentRecord`, `MailboxSyncRunRecord`)
- Added `mailboxCanSync` helper
- Extended `provider-contracts.ts` with `MailboxAttachmentEnvelope`

### Provider Layer
- Created `provider-registry.ts` to map `MailboxProvider` → adapter
- Enhanced `gmail-provider.ts` with real Gmail API integration:
  - `syncDelta`: `threads.list` + `threads.get` with full message/attachment parsing
  - `fetchThreadDetail`: fetch and parse individual thread details
  - Proper OAuth token refresh and error handling

### Ingestion & Sync
- Created `ingestion-service.ts` with idempotent upsert helpers for threads, messages, and attachments
- Created `mailbox-sync-service.ts` with `runMailboxSync` orchestration:
  - Sync run lifecycle tracking
  - Cursor management (history ID-based)
  - Provider error handling and connection status updates
  - Audit logging for sync events

### API
- Added `POST /api/mailbox/sync` route:
  - Requires integration admin auth
  - Rate-limited per org + connection
  - Triggers `runMailboxSync` and returns results

### Tests
- Existing Sprint 2.1 tests pass: 63/63

### Verification
- [x] `prisma validate` passes
- [x] `prisma generate` passes
- [x] `prisma migrate dev` applies cleanly
- [x] `vitest run src/lib/mailbox/__tests__/mailbox-sprint-2-1.test.ts` passes

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Status |
|------|------------|--------|------------|--------|
| Gmail API rate limiting during initial sync | Medium | Medium | Cursor-based incremental sync + backoff | Mitigated |
| Token expiry mid-sync | Low | High | Adapter auto-refreshes tokens before API calls | Mitigated |

## Post-Merge Actions
- [ ] Monitor sync runs in staging
- [ ] Add Sprint 3.1-specific integration tests in follow-up PR
