# Codex Context — 2026-06-06

This document is the current handoff context for the three active workflows in this repo:

- Client Hub
- Internal Messaging
- Mailbox / Email

It records current workflow status, branch discipline, PR state, review standards, and code writing rules that must remain in force.

Last updated: **2026-06-06**

---

## 1. Operating Rules

### 1.1 Workflow isolation

Each workflow must stay isolated.

- Client Hub work must not spill into Internal Messaging, Mailbox, PDF Studio, tags, TOTP, or unrelated platform code.
- Internal Messaging work must not spill into Client Hub, Mailbox, PDF Studio, tags, TOTP, or unrelated platform code.
- Mailbox work must not spill into Client Hub, Internal Messaging, PDF Studio, tags, TOTP, or unrelated platform code.

If a PR contains unrelated files from another workflow, that is a blocker until cleaned up.

### 1.2 Branch discipline

Required branch model:

1. Workflow branch
2. Phase branch from the workflow branch
3. Sprint branch from the phase branch
4. Sprint PR into the phase branch
5. Phase promotion PR into the workflow branch

Always distinguish clearly between:

- `feature-complete` — implementation done, not yet fully reviewed
- `approval-ready` — no remaining review blockers in the PR diff
- `merge-ready` — approval-ready and GitHub mergeability / CI are green
- `merged` — landed on the target base branch

Do not collapse these states together.

### 1.3 Repo truth first

Context docs are handoff aids, not source of truth.

When continuing or reviewing work:

- inspect current branch
- inspect `git status`
- inspect recent commits
- inspect PR diff against base
- inspect GitHub PR state
- prefer repo truth over stale notes

### 1.4 Worktree / local state cautions

- The root repo currently has persistent untracked local artifacts under `docs/codex/`, `src/app/invoice/[token]/proof/__tests__/node_modules/`, and `worktrees/`
- Do not blindly clean these unless explicitly asked
- `git fetch` / `git pull` can fail in this repo because of a broken remote ref (`origin/redesign/Icon?`)
- When a merged commit already exists locally, updating branch refs directly may be safer than relying on `git pull`

---

## 2. Engineering Bar

### 2.1 Production-ready only

All sprint code must be:

- production-ready
- secure by default
- fail-closed on auth / visibility uncertainty
- edge-case aware
- truthful in UI and state semantics
- bounded and supportable

Strictly avoid:

- AI slop
- spaghetti code
- placeholder behavior in production paths
- fake mock-backed production responses
- misleading empty / success / degraded states
- broad cleanup outside sprint scope

### 2.2 Code writing rules

- Keep route handlers and page entrypoints thin
- Put business logic in focused server helpers / services
- Always org-scope and customer-scope portal reads and writes
- Never trust client-provided identity when session-derived identity exists
- Prefer explicit `select` in Prisma queries on hot paths
- Preserve idempotency on retryable actions
- Preserve truthful UI copy and state contracts
- Add concise comments only where logic is genuinely non-obvious
- Do not use broad casts or lint disables to hide bad contracts

### 2.3 Security expectations

Always preserve:

- strict org isolation
- customer/session ownership enforcement
- fail-closed visibility gating
- no hidden-state leakage through metadata, counts, or fallback lookups
- no stale-session reuse after revocation or disablement
- no raw internal error leakage in client-facing UI

### 2.4 Review rules

Default review stance is strict engineering review.

Review output should:

1. list findings first
2. order by severity
3. include file references where possible
4. give verdict after findings

A PR is not approval-ready if it has any of:

- security / permission bugs
- untruthful UI or state contracts
- placeholder production behavior
- scope contamination
- retry / idempotency gaps on critical actions
- PRD contradictions
- broken runtime/type contracts hidden by casts

---

## 3. Workflow Status — Client Hub

### 3.1 What Client Hub is

Client Hub is the external customer-facing portal for invoices, payments, quotes, informational pages, and related client-facing modules under the platform redesign stream.

### 3.2 Branch state

| Name | Value |
|---|---|
| Workflow branch | `feature/platform-rebrand-redesign-client-hub` |
| Workflow branch local tip | `43c2f5c2` |
| Current phase branch | `feature/platform-rebrand-redesign-client-hub-phase-7-hardening-analytics-compatibility-closeout` |
| Current sprint branch | `feature/platform-rebrand-redesign-client-hub-phase-7-sprint-1-edge-case-and-security-hardening` |
| Current checked out root branch | `feature/platform-rebrand-redesign-client-hub-phase-7-sprint-1-edge-case-and-security-hardening` |

### 3.3 Phase status

- Phase 5 is merged into the workflow branch via PR `#432`
- Phase 6 is complete and merged into the workflow branch via PR `#442`
- Phase 7 has 3 PRD sprints total:
  1. edge-case and security hardening
  2. analytics, supportability, and audit closeout
  3. legacy compatibility, final regression, and release closeout

### 3.4 Phase 6 status

Phase 6 is complete on the workflow branch.

Merged PR chain:

- `#433` — Sprint 6.1 dashboard / balances / pending actions
- `#434` — Sprint 6.2 invoices / payment experience
- `#439` — Sprint 6.3 quotes / response experience
- `#441` — Sprint 6.4 products/services, jobs/projects style modules, About, Contact, polish
- `#442` — Phase 6 promotion into workflow branch

### 3.5 Current Sprint 7.1 PR

- PR `#443`
- Title: `feat(client-hub): Phase 7 Sprint 7.1 — edge-case and security hardening`
- Base: `feature/platform-rebrand-redesign-client-hub-phase-7-hardening-analytics-compatibility-closeout`
- Head: `feature/platform-rebrand-redesign-client-hub-phase-7-sprint-1-edge-case-and-security-hardening`
- GitHub state: `OPEN`
- Mergeability state: `UNSTABLE`

### 3.6 Current Sprint 7.1 review status

Current verdict: **not approval-ready yet**

Known blocker:

- Changed-email hardening regression in `src/lib/portal-auth.ts`
  - verification now rejects when `customer.email !== latestInviteEmail`
  - but fresh OTP / magic-link requests do not realign `latestInviteEmail`
  - result: a client can receive a fresh OTP / link at the new email and still be locked out until a separate invite resend path runs

Relevant files:

- `src/lib/portal-auth.ts`
- `src/app/app/data/actions.ts`
- `src/app/portal/[orgSlug]/actions.ts`
- `src/app/portal/[orgSlug]/client-hub/components/config-resolver.ts`

### 3.7 Client Hub review expectations

For Client Hub specifically, preserve:

- portal session gating on every protected route
- org + customer scoped document access
- truthful empty vs degraded vs stale states
- fail-closed module/page gating from effective config
- no leakage of hidden invoices / quotes / drafts
- idempotent quote response and payment entry behavior

---

## 4. Workflow Status — Internal Messaging

### 4.1 What Internal Messaging is

Internal Messaging is the in-product messaging / meetings / search / notifications workflow branch stream.

### 4.2 Branch state

| Name | Value |
|---|---|
| Workflow branch | `feature/internal-messaging-platform` |
| Current completed phase | Phase 9 |
| Phase 9 branch | `feature/internal-messaging-phase-9-search-notifications-productivity` |
| Active promotion PR | `#440` |

### 4.3 Phase 9 structure

Phase 9 has 5 sprints total:

1. search foundation
2. full file search and attachment indexing
3. notification center, preferences, and alert routing
4. digests and follow-up productivity workflows
5. reliability, diagnostics, performance, and phase closeout

### 4.4 Phase 9 sprint status

All five Sprint 9.x PRs are merged into the Phase 9 branch:

- `#431` — Sprint 9.1
- `#435` — Sprint 9.2
- `#436` — Sprint 9.3
- `#437` — Sprint 9.4
- `#438` — Sprint 9.5

### 4.5 Current promotion PR

- PR `#440`
- Title: `feat(messaging): promote completed Phase 9 search, notifications, digests, and reliability to workflow branch`
- Base: `feature/internal-messaging-platform`
- Head: `feature/internal-messaging-phase-9-search-notifications-productivity`
- GitHub state: `OPEN`
- Mergeability state: `UNSTABLE`

### 4.6 Current review status

Current verdict: **approval-ready, not merge-ready**

What is true:

- Phase 9 functionality is complete on the phase branch
- earlier blockers around checkpoint safety, reminder durability, and raw indexing failure leakage were fixed
- the promotion PR was cleaned of unrelated Mailbox / repo-global contamination

Why it is not merge-ready:

- GitHub `verify` remains red due to repo-wide baseline lint debt outside the PR diff

### 4.7 Messaging review expectations

For Internal Messaging specifically, preserve:

- idempotent background processing
- no silent checkpoint advancement past failed work
- no raw internal failure strings in user-facing search UI
- strict org scoping on notification / indexing / diagnostics paths
- truthful degraded / unavailable states

---

## 5. Workflow Status — Mailbox / Email

### 5.1 What Mailbox is

Mailbox / Email is the Gmail-grade mailbox workspace stream covering folder coverage, truthful sync semantics, smart views, and related provider-backed mailbox behavior.

### 5.2 Branch state

| Name | Value |
|---|---|
| Workflow branch | `feature/mailbox-platform` |
| Active branch | `feature/mailbox-gmail-grade-coverage-sprint-6-3-plus` |
| Current PR | `#404` |

### 5.3 Current PR

- PR `#404`
- Title: `feat(mailbox): Gmail-grade folder coverage with truthful sync semantics`
- Base: `feature/mailbox-platform-phase-6-linking-assignment-smart-views`
- Head: `feature/mailbox-gmail-grade-coverage-sprint-6-3-plus`
- GitHub state: `OPEN`
- Mergeability state: `UNSTABLE`

### 5.4 Current review status

Current verdict: **approval-ready, not merge-ready**

What is true:

- the PR diff was cleaned to mailbox-only scope
- unrelated files were removed from the PR
- mailbox tests were previously reported as passing (`1115` tests across `36` files)
- remaining CI red is baseline lint debt outside the PR’s actual scope

### 5.5 Mailbox review expectations

For Mailbox specifically, preserve:

- truthful sync semantics
- folder-specific degradation semantics
- no raw provider errors in end-user UI
- healthy folders remain usable when another folder is degraded
- no fake “up to date” states when coverage is partial or stale

---

## 6. Current PR Summary

| PR | Workflow | Status |
|---|---|---|
| `#404` | Mailbox | approval-ready, not merge-ready |
| `#440` | Internal Messaging Phase 9 promotion | approval-ready, not merge-ready |
| `#443` | Client Hub Phase 7 Sprint 7.1 | not approval-ready yet |

Recently merged:

- `#442` — Client Hub Phase 6 promotion merged into `feature/platform-rebrand-redesign-client-hub`

---

## 7. Practical Notes for the Next Agent

- Do not assume the latest open PR is approval-ready just because tests passed once; re-check repo truth and current diff
- For Client Hub Sprint 7.1, fix the changed-email auth regression before calling the PR ready
- For Internal Messaging and Mailbox, the main distinction now is approval-ready vs merge-ready because baseline repo lint still affects CI
- When updating local branch pointers after a merge, be careful: `git fetch` / `git pull` may fail because of the broken remote ref issue
- Avoid touching the existing untracked `docs/codex/*`, `node_modules` test artifact, or `worktrees/` entries unless explicitly instructed
