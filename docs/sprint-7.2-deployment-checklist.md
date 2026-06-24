# Sprint 7.2 — Deployment Checklist

## Migration

- [ ] Migration SQL reviewed at `prisma/migrations/20260701000000_add_mailbox_connection_settings/migration.sql`
  - Adds `notificationSettings` JSONB column (nullable)
  - Adds `deletedAt` TIMESTAMPTZ column (nullable)
- [ ] `prisma migrate deploy` run against staging and verified
- [ ] Rollback plan: `prisma migrate down 1` removes both columns (no data loss since all existing rows have NULL)

## Schema & Types

- [ ] `MailboxConnectionRecord` includes both `deletedAt` and `notificationSettings` fields
- [ ] `MailboxConnectionListItem` includes `notificationSettings` with null guard
- [ ] Null guards in `toMailboxConnectionListItem` for pre-migration records

## Validation (Zod)

- `src/lib/validation/mailbox.ts`:
  - [ ] `patchConnectionSchema` rejects unknown keys via `.strict()`
  - [ ] `patchConnectionSchema` validates `notificationSettings` shape: `{ email: boolean, sms: boolean }`
  - [ ] `createConnectionSchema` rejects unknown keys via `.strict()`
  - [ ] `paginationQuerySchema` clamps `pageSize` to 1–100, defaults to 20

## Realtime Events

- [ ] `src/lib/realtime.ts` broadcasts on channel `mailbox-connection-events`
- [ ] Fail-open: errors are logged but never propagated to caller
- [ ] Events emitted after DB commit:
  - `mailbox_connection_created` (POST 201)
  - `mailbox_connection_updated` (PATCH 200)
  - `mailbox_connection_deleted` (DELETE 200)

## GET /api/mailbox/connections — Paginated Listing

- [ ] Excludes soft-deleted connections (`deletedAt IS NULL`)
- [ ] Cursor-based pagination: `?cursor=<id>&pageSize=<1–100>`
- [ ] Returns `{ connections: [...], nextCursor: string | null }`
- [ ] `nextCursor` is `null` when the response is the last page
- [ ] Returns 400 for invalid query params
- [ ] Rate-limited via `RATE_LIMITS.api`

## POST /api/mailbox/connections — Create

- [ ] Validates body with `createConnectionSchema` (Zod, strict mode)
- [ ] Checks for duplicate `displayName` per org (409 Conflict)
- [ ] Creates via `createMailboxConnection` in a single Prisma transaction
- [ ] Writes audit event `CONNECTION_CREATED`
- [ ] Emits `mailbox_connection_created` realtime event (fire-and-forget)
- [ ] Returns 201 with `Location` header pointing to the new resource

## PATCH /api/mailbox/connections/[id] — Update Settings

- [ ] Validates body with `patchConnectionSchema` (Zod, strict mode — unknown keys rejected)
- [ ] Supports `displayName`, `visibilityPolicy`, and `notificationSettings` (all optional)
- [ ] At least one field must be provided (400 if none)
- [ ] Delegates to `updateMailboxConnectionSettings` for org-scoped transaction + audit
- [ ] Audit action: `CONNECTION_POLICY_UPDATED` with previous/new values
- [ ] Emits `mailbox_connection_updated` realtime event

## DELETE /api/mailbox/connections/[id] — Soft-Delete

- [ ] Rejects deletion if connection has active `mailboxDraft` records with `status = "ACTIVE"` (409)
- [ ] Rejects if `deletedAt` is already set (410 Gone)
- [ ] Sets `status = "DISCONNECTED"` and `deletedAt = now()`
- [ ] Org-scoped: `findFirst({ where: { id, orgId } })` guard prevents cross-org mutation
- [ ] Writes audit event `CONNECTION_DISCONNECTED`
- [ ] Emits `mailbox_connection_deleted` realtime event

## Security

- [ ] All endpoints guarded by `requireIntegrationAdminRoute()` (admin-level RBAC)
- [ ] All org-scoped queries filter by `orgId` — cross-tenant access returns 404
- [ ] Stack traces never leaked in error responses
- [ ] PII (email) masked in audit metadata
- [ ] Rate-limited per org:
  - GET list: `RATE_LIMITS.api`
  - POST/PATCH/DELETE: `RATE_LIMITS.mailboxPolicyUpdate` (10 req/min)
- [ ] Zod strict mode rejects unknown request body keys

## Tests

- [ ] Sprint 7.1 backward-compat: `connections-route-sprint-7-1.test.ts` passes (10 tests)
- [ ] Sprint 7.2 new tests: `connections-route-sprint-7-2.test.ts` covers:
  - GET success with pagination (cursor, pageSize params)
  - GET empty result set
  - GET last page (nextCursor null)
  - GET passes cursor/pageSize to service
  - GET validation errors (pageSize 0, 101, non-numeric)
  - GET auth/rate-limit errors (403, 401, 429)
  - POST success 201 with Location header
  - POST validation errors (missing field, invalid provider, invalid email, empty name, unknown keys)
  - POST duplicate displayName 409
  - POST auth/rate-limit errors
  - DELETE success 200
  - DELETE 404 (not found)
  - DELETE 409 (active drafts)
  - DELETE 410 (already deleted)
  - DELETE auth/rate-limit errors
  - PATCH notificationSettings only
  - PATCH all three fields
  - PATCH invalid notificationSettings values
  - PATCH unknown keys rejected (400)
  - PATCH missing fields (400)
- [ ] Total mailbox test count: ≥ 1,179

## Rollback

1. Revert code changes: `git revert <merge-commit>`
2. Reverse migration: `prisma migrate down 1`
3. Verify rollback in staging before applying to production
