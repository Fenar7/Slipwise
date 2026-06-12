# Project Context Handoff

Last updated: 2026-05-09  
Repo: `payslip-generator`

## Current Working State

- Current branch: `feature/internal-messaging-phase-1-sprint-2-conversation-reading`
- Current HEAD: `8fe66913`
- Working tree status:
  - only untracked files remain:
    - `context.md`
    - `docs/PRD/INTERNAL_MESSAGING_PLATFORM_PRD.md`
    - `docs/opencode/2026-05-08-18-41-context.md`
  - no tracked-file edits are left uncommitted

## Active Parallel Workflows

### Mailbox workflow

- Root branch: `feature/mailbox-platform`
- Phase 2 branch: `feature/mailbox-platform-phase-2-foundation`
- Sprint 2.1 branch: `feature/mailbox-platform-phase-2-sprint-2-1-schema-provider-contracts`
- Sprint 2.1 PR: `#327`
- PR target: `feature/mailbox-platform-phase-2-foundation`
- Sprint 2.1 is still open and not approved/merged when last discussed

Latest known Sprint 2.1 state:
- Kiro reported the final remediation is complete
- latest pushed commit reported by Kiro: `b4339f3a`
- claimed status:
  - added `@@unique([id, orgId])` to `MailboxConnection`
  - `MailboxProviderCursor` now uses composite org-safe relation
  - `MailboxDraft` uses the same composite FK pattern
  - `MailboxAuditEvent` keeps nullable single-column FK plus service guard and schema comment
  - `npx prisma validate` clean
  - `npx prisma generate` clean
  - `63/63` tests passing

Latest prompt I provided for next mailbox work:
- full Kiro prompt for **Mailbox Phase 2 Sprint 2.2**
- Sprint 2.2 branch to create:
  - `feature/mailbox-platform-phase-2-sprint-2-2-gmail-oauth-token-lifecycle`
- it must stack on Sprint 2.1
- Sprint 2.2 PR target should be:
  - `feature/mailbox-platform-phase-2-sprint-2-1-schema-provider-contracts`

### Internal messaging workflow

- Parent branch for this module: `feature/platform-rebrand-redesign`
- Messaging root branch: `feature/internal-messaging-platform`
- Messaging Phase 1 branch: `feature/internal-messaging-phase-1-static-design`
- Sprint 1.1 branch: `feature/internal-messaging-phase-1-sprint-1-workspace-shell`
- Sprint 1.1 PR: `#328`
- Sprint 1.2 branch: `feature/internal-messaging-phase-1-sprint-2-conversation-reading`
- Sprint 1.2 PR: `#329`
- Sprint 1.2 PR target:
  - `feature/internal-messaging-phase-1-sprint-1-workspace-shell`
- Sprint 1.2 is a stacked PR on top of Sprint 1.1
- Sprint 1.1 was not yet approved/merged when Sprint 1.2 was opened

## Internal Messaging PR Review History

### Sprint 1.1 review findings on PR `#328`

Initial review found:
- syntax break in `src/components/layout/suite-nav-items.ts`
- mobile/tablet shell unreachable because left rail disappeared with no fallback
- core nav interactions were not keyboard-accessible

That remediation was completed earlier and reported as:
- commit: `98497120`
- message: `fix(messaging): harden sprint 1.1 shell accessibility`

### Sprint 1.2 review findings on PR `#329`

I reviewed Sprint 1.2 and found three material issues:

1. Mobile/tablet users could not select conversations in `channels` / `dms` / `groups`
- root cause:
  - `conversation-list-column` was hidden below `md` in `messaging-workspace.tsx`
  - users got stuck in the no-selection reading pane

2. Selecting different conversations still showed the wrong static message history
- root cause:
  - `messaging-reading-workspace.tsx` used one hardcoded feed per kind:
    - channels always finance
    - DMs always Arjun
    - groups always Q2 Close Team

3. Public groups rendered private-group cues incorrectly
- root cause:
  - group icon logic depended on `groupMemberCount`, which is truthy
  - result: group icon/header cue resolved to private even for public groups

## Sprint 1.2 Fixes Applied

These fixes were implemented directly on:
- `feature/internal-messaging-phase-1-sprint-2-conversation-reading`

Files changed:
- `src/app/app/messaging/types.ts`
- `src/app/app/messaging/mock-data.ts`
- `src/app/app/messaging/messaging-conversation-list.tsx`
- `src/app/app/messaging/messaging-reading-workspace.tsx`
- `src/app/app/messaging/messaging-workspace.tsx`
- `src/app/app/messaging/__tests__/messaging-sprint-1-2.test.tsx`

Behavior changes:

### 1. Conversation list is now reachable below desktop

In `messaging-workspace.tsx`:
- the two-column workspace now becomes stacked on narrow screens:
  - outer layout uses `flex-col md:flex-row`
- the conversation list column is no longer hidden below `md`
- the reading pane stays visible beneath it

Effect:
- mobile/tablet users can browse and select channel/DM/group conversations

### 2. Reading workspace now resolves the correct message feed per selected conversation

In `mock-data.ts`:
- added conversation-specific feeds for:
  - `ch-general`
  - `ch-invoices`
  - `ch-payroll`
  - `ch-compliance`
  - `dm-2`
  - `dm-3`
  - `grp-vendor-onboard`
  - `grp-audit-prep`
- added:
  - `MOCK_MESSAGES_BY_CONVERSATION_ID`
  - `MOCK_THREAD_REPLIES_BY_MESSAGE_ID`
  - `getMessagesForConversation(conversationId)`
  - `getThreadRepliesForMessage(messageId)`

In `messaging-reading-workspace.tsx`:
- replaced hardcoded feed selection with `getMessagesForConversation`
- replaced hardcoded/sliced thread reply logic with `getThreadRepliesForMessage`

Effect:
- selecting a different channel/DM/group now shows that conversation’s own static history

### 3. Public/private group cues are now correct

In `types.ts`:
- `ActiveConversation` gained:
  - `groupIsPrivate?: boolean`

In `messaging-conversation-list.tsx`:
- group selection now passes:
  - `groupIsPrivate: grp.isPrivate`

In `messaging-reading-workspace.tsx`:
- group icon logic now keys off `conversation.groupIsPrivate`
- group badge now renders:
  - `Private group · N members`
  - or `Group · N members`

Effect:
- public groups no longer render private lock cues by mistake

## Sprint 1.2 Test Status

Tests run after the fixes:

1. Focused Sprint 1.2 suite
```bash
npm run test -- src/app/app/messaging/__tests__/messaging-sprint-1-2.test.tsx
```
Result:
- `87/87` passing

2. Combined Sprint 1.1 + 1.2 suites
```bash
npm run test -- src/app/app/messaging/__tests__/messaging-sprint-1-1.test.tsx src/app/app/messaging/__tests__/messaging-sprint-1-2.test.tsx
```
Result:
- `151/151` passing

Test coverage added/updated for:
- mobile/tablet conversation-list availability
- selecting `#general` shows general feed instead of finance feed
- selecting a different DM shows the correct DM feed
- selecting a public group shows the correct group feed
- public groups do not show private-group copy

## Sprint 1.2 Commit / PR Update

- Commit created on current branch:
  - `8fe66913`
- Commit message:
  - `fix(messaging): correct sprint 1.2 conversation state`

Push result:
- branch tracks:
  - `origin/feature/internal-messaging-phase-1-sprint-2-conversation-reading`
- push output said:
  - `Everything up-to-date`

Interpretation:
- the remote already contains the current branch tip, or the branch was already synchronized at the time of push
- PR `#329` should be current with commit `8fe66913`

## Current Messaging Files of Interest

If another AI needs to continue from the current messaging state, start with:

- `src/app/app/messaging/messaging-workspace.tsx`
- `src/app/app/messaging/messaging-reading-workspace.tsx`
- `src/app/app/messaging/messaging-conversation-list.tsx`
- `src/app/app/messaging/mock-data.ts`
- `src/app/app/messaging/types.ts`
- `src/app/app/messaging/__tests__/messaging-sprint-1-2.test.tsx`

## Next Likely Steps

Depending on what is requested next, the likely paths are:

1. Re-review PR `#329` after the applied fixes
- verify no additional UX or structural regressions remain

2. Continue messaging Sprint 1.3
- the previously prepared prompt was for:
  - **Internal Messaging Phase 1 Sprint 1.2**
- a new prompt would be needed for Sprint 1.3 if continuing the static messaging rollout

3. Continue mailbox Sprint 2.2
- use the existing full prompt for:
  - **Mailbox Phase 2 Sprint 2.2 — Gmail OAuth and token lifecycle**

## Important Do-Not-Touch Notes

- Do not disturb mailbox PR `#327`
- Do not retarget stacked messaging PRs unless explicitly asked
- Do not modify or delete the unrelated untracked files unless explicitly asked
- Messaging Sprint 1.2 is stacked on Sprint 1.1, so `#329` must not be merged before `#328`
