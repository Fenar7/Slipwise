# Sprint 7.3 — Deployment Checklist

## Migration

- [ ] Run `npx prisma migrate deploy`
- [ ] Verify filtered unique index `MailboxConnection_org_displayName_unique` exists on `mailbox_connection` (orgId, displayName) WHERE deletedAt IS NULL
- [ ] Verify index `MailboxConnection_displayName_idx` on mailbox_connection (displayName) WHERE deletedAt IS NULL
- [ ] Rollback plan: `npx prisma migrate resolve --rolled-back 20260702000000_add_new_chat_indexes`

## New Endpoint

- `POST /api/mailbox/connections` — dual mode:
  - **New Chat** (empty body `{}`): creates connection with auto-generated `displayName = "New Chat #<seq>"`, welcome thread + message, masked audit
  - **Provider connection** (with `provider`, `emailAddress`, etc.): existing Sprint 7.2 flow

## Rate Limiting

- New Chat uses `RATE_LIMITS.mailboxCreate` (5 req/min per org)
- Provider connections use `RATE_LIMITS.mailboxPolicyUpdate` (10 req/min)
- Max 1000 active (non-deleted) connections per org returns 429

## Audit

- Action: `CONNECTION_CREATED` (existing enum)
- Metadata stores only `nameSeq` (numeric part) and `visibilityPolicy` — full display name is NOT logged

## Realtime

- Event `mailbox_connection_created` emitted after commit (fail-open)
- Payload: `{ id, orgId }`

## Smoke Test

```bash
# New Chat
curl -X POST -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{}' https://<env>.example.com/api/mailbox/connections -i

# Expected: 201, Location: /app/mailbox/connections/<id>
# Body: { id, displayName: "New Chat #1", visibilityPolicy: "org_shared", notificationSettings: { email: false, sms: false } }

# Verify DB: mailbox_connection row exists, mailbox_thread and mailbox_message rows exist
# Verify audit: mailbox_audit_event with CONNECTION_CREATED, metadata.nameSeq = "1"
```

## Tests

- [ ] `connections-route-sprint-7-3.test.ts` — 18 tests covering:
  - New Chat 201 with Location header
  - Sequential name generation (#1, #6, etc.)
  - Non-empty body rejected (400)
  - Rate limit exceeded (429)
  - Max connections exceeded (429)
  - 999 connections allowed, 1000 rejected
  - Realtime event emission
  - No event emission on failure
  - Auth enforcement (403, 401)
  - Non-JSON body handled gracefully
  - `generateNewChatName` sequence logic
  - Backward compat: Sprint 7.2 provider-based POST still works
- [ ] All existing Sprint 7.1/7.2/6/2-3 tests pass
- [ ] Coverage ≥ 95%

## Rollback

1. Revert code: `git revert <merge-commit>`
2. Reverse migration: `npx prisma migrate resolve --rolled-back 20260702000000_add_new_chat_indexes`
3. Verify in staging before applying to production
