# Mailbox Phase 3 Sprint 3.1 Kimi K2.6 Execution Prompt

You are working in the Slipwise repository at:

`/Users/mac/Fenar/Zenxvio/product-works/payslip-generator`

This is a new chat. Assume no prior context beyond what is written here.

Your task is to execute **Mailbox Platform — Phase 3, Sprint 3.1: Initial Sync Pipeline**.

## Branch workflow

Current base branch:

- `feature/mailbox-platform`

Phase workflow for mailbox is now:

1. create a dedicated **phase branch** from `feature/mailbox-platform`
2. create a **sprint branch** from that phase branch
3. implement one sprint only on the sprint branch
4. open a PR from sprint branch into the phase branch
5. after review/approval, merge sprint PR into the phase branch
6. after all Phase 3 sprints are complete and verified, merge the phase branch into `feature/mailbox-platform`

For this task, use:

- phase branch: `feature/mailbox-platform-phase-3-sync-ingestion-mailbox-state`
- sprint branch: `feature/mailbox-platform-phase-3-sprint-1-initial-sync-pipeline`

If the phase branch does not exist locally yet, create it from `feature/mailbox-platform`. Then create the sprint branch from the phase branch and do all work there.

## What is already complete

Phase 1 and Phase 2 mailbox work already exist on `feature/mailbox-platform`.

That means the repo already has:

- mailbox static UI foundation
- mailbox schema and provider contracts
- Gmail OAuth and token lifecycle
- mailbox connection registry/admin flows
- mailbox visibility policy and org-scoped access rules
- mailbox audit helpers
- mailbox provider cursor service

Important existing implementation facts:

- `src/lib/mailbox/provider-contracts.ts` already defines the provider-neutral contract surface
- `src/lib/mailbox/gmail-provider.ts` currently has stubbed `syncDelta()` and `fetchThreadDetail()` implementations from Phase 2
- `src/lib/mailbox/connection-service.ts` and `src/lib/mailbox/cursor-service.ts` already establish service-layer patterns and org-safe DB access
- `src/lib/mailbox/audit.ts` already defines mailbox audit logging
- `src/lib/mailbox/index.ts` is the public mailbox service barrel
- `prisma/schema.prisma` already contains `MailboxConnection`, `MailboxProviderCursor`, `MailboxAuditEvent`, `MailboxDraft`, `MailboxAssignment`, and `MailboxThreadLink`

## Canonical product spec to follow

Read and follow:

- `docs/PRD/MAILBOX_PLATFORM_PRD.md`

Use the **Phase 3** section, especially:

- **Sprint 3.1 — Initial sync pipeline**

Phase 3 PRD summary:

- Goal: ingest Gmail mailbox data into Slipwise reliably enough to power real inbox experiences
- Sprint 3.1 scope:
  - mailbox bootstrap sync
  - provider fetch orchestration
  - raw-to-normalized ingestion path
  - initial thread/message creation
  - sync bookkeeping for first load
- Sprint 3.1 acceptance:
  - a newly connected mailbox can produce normalized mailbox data
  - ingestion is idempotent enough for rerun safety
  - first-sync state is observable

## Scope for this sprint

Implement **Sprint 3.1 only**.

In scope:

- initial mailbox bootstrap sync
- normalized persistence foundation for mailbox data
- Gmail initial sync implementation behind the existing provider contract
- first-sync observability and bookkeeping
- manual/service-triggered sync seam for this sprint
- tests for the whole Sprint 3.1 path

Out of scope for this sprint:

- Sprint 3.2 incremental delta advancement model
- watch/subscription renewal
- sync scheduling/cron infrastructure
- full degraded/recovery model from Sprint 3.4
- real inbox UI wiring to live mailbox data
- send/reply workflows
- broad Phase 4 UI consumption work

Do not silently pull Sprint 3.2 to 3.4 into this PR. Leave clean seams for later sprints instead.

## Required architecture and implementation decisions

Lock these decisions and implement accordingly:

1. **Use existing sync observability surfaces where possible**
   - Keep using:
     - `MailboxProviderCursor`
     - `MailboxConnection.lastSyncAt`
     - `MailboxConnection.lastSyncError`
   - Add a new **`MailboxSyncRun`** model for explicit run-level observability
   - Do **not** introduce a separate `MailboxSyncState` table in Sprint 3.1

2. **Provider-neutral service boundary**
   - The core sync orchestration must depend on the existing provider contracts
   - Do not leak Gmail-specific shapes into core mailbox service types
   - Provider-specific metadata may remain inside JSON metadata fields only

3. **Strict service-layer ownership**
   - No raw Prisma access in route handlers
   - DB access belongs in mailbox service modules
   - All mailbox queries and mutations must remain org-scoped

4. **Idempotent-enough initial ingestion**
   - Re-running Sprint 3.1 initial sync for the same mailbox must not create duplicate normalized records
   - Use provider identifiers and org/mailbox scoping to upsert or reconcile safely

5. **Sprint 3.1 is a mailbox bootstrap sync**
   - Treat `cursor = null` as initial sync
   - Do not build generalized scheduling infrastructure now
   - Do not implement full Gmail history-based incremental sync logic yet unless a small seam is needed to avoid rework later

## New persistence foundation to add

Implement the normalized mailbox persistence layer required for Sprint 3.1.

Add Prisma models for:

### `MailboxThread`

Use the PRD section 22.2 as the baseline. Expected shape:

- `id`
- `orgId`
- `mailboxConnectionId`
- `providerThreadId`
- `subject`
- `participantsSummary`
- `lastMessageAt`
- `unreadCount`
- `status`
- `assigneeId`
- `isFlagged`
- `primaryLinkSummary`
- `createdAt`
- `updatedAt`

Design notes:

- keep this mailbox/org scoped
- unique it strongly enough to support idempotent sync for a provider thread within a mailbox connection
- `participantsSummary` and `primaryLinkSummary` can be JSON if needed at this stage
- do not over-design thread workflow fields beyond what Sprint 3.1 needs

### `MailboxMessage`

Use PRD section 22.3 as the baseline. Expected shape:

- `id`
- `orgId`
- `threadId`
- `providerMessageId`
- `rfcMessageId`
- `direction`
- `from`
- `to`
- `cc`
- `bcc`
- `subject`
- `htmlBody`
- `textBody`
- `snippet`
- `sentAt`
- `receivedAt`
- `attachmentCount`
- `providerMetadata`
- `createdAt`
- `updatedAt`

Design notes:

- allow provider metadata JSON
- message uniqueness must support idempotent re-sync by provider message ID within a thread/org-safe boundary
- `from` / `to` / `cc` / `bcc` may be stored as JSON if that is the cleanest fit for Sprint 3.1

### `MailboxAttachment`

Use PRD section 22.4 as the baseline. Expected shape:

- `id`
- `messageId`
- `providerAttachmentId`
- `filename`
- `mimeType`
- `size`
- `isInline`
- `storageRef`

Design notes:

- Sprint 3.1 only needs metadata ingestion foundation
- actual file storage/download can remain unimplemented
- `storageRef` can be nullable or stub-friendly if raw file persistence is not part of this sprint

### `MailboxSyncRun`

Add a run-level table to make first sync observable and supportable.

Minimum required behavior:

- one record per attempted manual/bootstrap sync run
- tracks org, mailbox connection, provider, status, startedAt, completedAt
- stores safe error summary if failed
- stores enough metadata to observe first sync progress/result counts

Suggested fields:

- `id`
- `orgId`
- `mailboxConnectionId`
- `provider`
- `status`
- `startedAt`
- `completedAt`
- `errorCategory`
- `errorSummary`
- `stats`
- `createdBy`
- `createdAt`
- `updatedAt`

Choose an enum/status model that is minimal and supportable for Sprint 3.1, for example:

- `RUNNING`
- `COMPLETED`
- `FAILED`

Do not overbuild replay/retry orchestration yet.

## Service-layer work required

### 1. Extend mailbox domain/service types

Add domain record types and any required helper enums/types for the new Phase 3 models.

Keep the same pattern used by existing mailbox service modules:

- domain records are separate from raw Prisma types
- repo-facing service modules return typed domain records
- mailbox public barrel exports stay coherent

### 2. Implement `mailbox-sync-service.ts`

Create a dedicated service module as the Sprint 3.1 orchestration entrypoint.

It should:

- load the mailbox connection org-safely
- verify the mailbox exists for the org
- verify the mailbox is operational before attempting sync
- load the provider adapter from the existing provider surface
- load the current cursor through `getMailboxCursor()`
- call provider `syncDelta()` with `cursor = null` for initial sync or existing cursor where applicable
- normalize and ingest thread/message data
- persist or advance the provider cursor after success
- update connection sync fields like `lastSyncAt` / `lastSyncError`
- write a `MailboxSyncRun` record for each attempt
- emit mailbox audit events for:
  - sync manually triggered
  - sync completed
  - sync failed

The service should return a clean result shape suitable for later route/admin use.

### 3. Implement normalized ingestion helpers

Build focused helpers/services for:

- upserting mailbox threads
- upserting mailbox messages
- upserting mailbox attachments

Requirements:

- must be idempotent enough for rerun safety
- must be org-safe
- must preserve provider IDs
- must avoid duplicate normalized rows on repeat sync

Do not create an over-general ingestion framework beyond what Sprint 3.1 requires.

### 4. Add a manual sync trigger seam

Add a mailbox service-triggered entrypoint for Sprint 3.1 so initial sync can be invoked deliberately.

This can be:

- a new admin-only route, or
- a service callable that is clearly intended to back an admin/manual route

If you add a route:

- keep `import "server-only"` where appropriate in server modules
- use auth guards
- use org-scoped lookup
- use rate limiting
- use explicit `Promise<NextResponse>`
- avoid raw Prisma in the route

The route should stay minimal and delegate to the service layer.

## Gmail provider work required

Update `src/lib/mailbox/gmail-provider.ts`.

Current state:

- `syncDelta()` returns an empty result stub
- `fetchThreadDetail()` returns empty messages

For Sprint 3.1:

- implement **initial Gmail sync** behind `syncDelta()`
- fetch enough Gmail thread/message metadata to produce normalized mailbox data
- support first-load ingestion path
- return provider-neutral `MailboxThreadEnvelope` and cursor output through the existing contract

Important constraints:

- keep contract compliance with `IMailboxProviderAdapter`
- do not redesign the provider contract
- do not expose Gmail-specific response types to the core service layer
- you may keep the implementation intentionally limited to initial sync mechanics if that avoids premature Sprint 3.2 design

If message bodies are needed for normalized `MailboxMessage`, decide the smallest safe way to obtain them in Sprint 3.1 without overbuilding Phase 4 or Phase 5 concerns.

## Existing files you must read before implementing

- `docs/PRD/MAILBOX_PLATFORM_PRD.md`
- `src/lib/mailbox/provider-contracts.ts`
- `src/lib/mailbox/gmail-provider.ts`
- `src/lib/mailbox/connection-service.ts`
- `src/lib/mailbox/cursor-service.ts`
- `src/lib/mailbox/audit.ts`
- `src/lib/mailbox/index.ts`
- `prisma/schema.prisma`

Also inspect any existing mailbox tests in:

- `src/lib/mailbox/__tests__/`

Follow the established patterns there.

## Coding standards you must keep

- add `import "server-only"` to every server module
- no `any`
- no `as any`
- no `as never`
- no raw Prisma in route handlers
- all mailbox DB access must be org-scoped
- keep audit metadata governance-safe
- do not leak token values, provider internals, or unsafe raw error details
- use existing mailbox mapper/service patterns instead of inventing a parallel style

## Required tests

Add a dedicated Sprint 3.1 mailbox test file and update any existing tests needed for the new schema/services.

The Sprint 3.1 test coverage must include:

1. **initial sync creates normalized rows**
   - mailbox thread rows created
   - mailbox message rows created
   - mailbox attachment metadata rows created where applicable

2. **rerun safety / idempotency**
   - running initial sync again does not create duplicate normalized thread/message rows

3. **cursor bookkeeping**
   - cursor is created or advanced after a successful sync

4. **sync run observability**
   - sync run row is written on start
   - status ends as completed on success
   - status ends as failed on failure

5. **connection sync field updates**
   - `lastSyncAt` updates on success
   - `lastSyncError` is cleared on success and populated safely on failure

6. **auth-expired or provider failure handling**
   - provider auth failure maps to safe mailbox behavior
   - connection status/error handling remains supportable

7. **non-operational mailbox protection**
   - disconnected or unusable connections are rejected safely before sync

8. **org isolation**
   - sync cannot mutate another org’s mailbox data

Run the relevant mailbox-focused tests and report the exact results.

## Deliverables

You must complete all of the following:

1. create the phase branch if missing:
   - `feature/mailbox-platform-phase-3-sync-ingestion-mailbox-state`
2. create the sprint branch from it:
   - `feature/mailbox-platform-phase-3-sprint-1-initial-sync-pipeline`
3. implement Sprint 3.1 fully
4. add/update tests
5. run the relevant tests
6. commit with a clear commit message
7. push the sprint branch
8. open or update the Sprint 3.1 PR into the Phase 3 branch

## Final report format

When done, report back with:

- summary of what changed
- files changed
- tests run and results
- migration details
- commit SHA
- branch pushed
- PR status/link

Do not stop at partial implementation. Complete Sprint 3.1 end-to-end.
