# Workflow Context

Last updated: May 31, 2026

## Purpose

This document is the shared operating context for the current multi-workflow execution across this repo family. It is meant to be reused by future AI chats and engineering handoffs so work can continue without re-discovering the same branch rules, review standards, and workflow boundaries.

Keep this file current whenever workflow state changes materially.

## Global Engineering Rules

### Code-writing rules

- Production-ready only.
- No AI slop.
- No spaghetti code.
- Preserve existing patterns unless an intentional refactor is required.
- Use server-owned validation for security-sensitive flows.
- Preserve org scoping; no cross-org leakage.
- Add comments only when logic is genuinely non-obvious.
- Do not broaden scope beyond the active sprint/task.
- Prefer typed, explicit contracts over ad hoc objects.
- Do not trust client input for authorization, ownership, or org-scoped entity selection.

### Workflow isolation rules

- Never mix Client Hub, Internal Messaging, and Mailbox changes in one branch or PR.
- Always verify the current branch/worktree before editing or reviewing.
- Do not trust stale chat summaries over current repo state.
- If a branch/PR is claimed complete, verify the real diff against its base before approving.
- If unrelated files appear in a sprint PR, treat that as a blocker until cleaned up.

### Branch safety rules

- Avoid destructive git operations unless explicitly intended.
- Keep PRs tightly scoped and reviewable.
- Remove unrelated local artifacts from PRs before approval.
- Prefer continuing on the same branch/PR for sprint fixes unless the user explicitly asks for a reset.

## PR Review Rules

### Default review stance

- Review like a senior software engineer and architect.
- Prioritize:
  - bugs
  - behavioral regressions
  - broken route/service contracts
  - security or access-control gaps
  - scope contamination
  - missing test coverage
  - runtime/schema/environment drift

### Approval checklist

- Correct branch and base branch.
- Scope matches the sprint and PRD.
- No unrelated files in the diff.
- Security-sensitive behavior is enforced server-side.
- No auth, org, or route leakage.
- No fake success or fake completion states.
- No hidden overwrites of operator-authored form state.
- Focused tests exist for the changed behavior.
- Runtime/database/schema alignment is correct when applicable.

### Review output rules

- Findings first, ordered by severity.
- Include file references for blockers.
- State clearly whether the PR is approval-ready.
- If blocked, provide a clean follow-up prompt for the coding model on the same branch/PR unless the user asks for a reset.

## Workflow Overview

### Client Hub

- Repo/worktree: `/Users/mac/Fenar/Zenxvio/product-works/payslip-generator`
- Base branch: `feature/platform-rebrand-redesign-client-hub`
- Current focus: Phase 4
- Current active sprint/PR:
  - Sprint 4.4
  - Branch: `feature/platform-rebrand-redesign-client-hub-phase-4-sprint-4-shared-client-defaulting-system`
  - PR: `#417`
- Latest known state:
  - Sprint 4.3 is complete and merged into the Client Hub base branch.
  - Sprint 4.4 is in review/fix loop.
- Workflow boundaries:
  - invoices
  - quotes
  - vouchers
  - org defaults
  - client-linked creation/defaulting flows
- Do not mix any Internal Messaging or Mailbox work here.

### Internal Messaging

- Repo/worktree: `/Users/mac/Fenar/Zenxvio/product-works/payslip-generator`
- Base branch: `feature/internal-messaging-phase-7-tasks-work-coordination`
- Current active sprint/PR:
  - Sprint 7.4
  - Branch: `feature/internal-messaging-phase-7-sprint-4-audit-governance`
  - PR: `#415`
- Latest known state:
  - Sprint 7.1 complete
  - Sprint 7.2 complete
  - Sprint 7.3 complete
  - Sprint 7.4 is approval-ready after the final secure route/auth fixes
- Workflow boundaries:
  - conversations
  - tasks
  - reminders
  - audit trail
  - governance/supportability
- Do not mix any Client Hub or Mailbox work here.

### Mailbox

- Repo/worktree: `/Users/mac/Fenar/Zenxvio/product-works/payslip-generator-mailbox`
- Active branch: `feature/mailbox-gmail-grade-coverage-sprint-6-3-plus`
- Current active PR: `#404`
- Latest known state:
  - Sprint 6.3+ mailbox hardening is in review/fix loop.
  - Search, folder coverage, and draft-path correctness were the main active review themes.
- Workflow boundaries:
  - mailbox sync
  - folder coverage
  - mailbox search
  - drafts
  - mailbox UI/API behavior
- Do not mix any Client Hub or Internal Messaging work here.

## Per-Workflow Current Review Notes

### Client Hub

- Sprint 4.4 shared defaulting must centralize precedence for real, not just move logic into thin wrappers that still duplicate policy.
- Voucher template choice must not be reset during vendor rehydration.
- The shared defaulting system should be server-owned and authoritative across invoice, quote, and voucher flows.

### Internal Messaging

- Sprint 7.4 now includes:
  - transactional task audit writes
  - permission-gated timeline and diagnostics
  - surfaced secure server actions/routes
  - correct auth status handling
  - task-conversation route contract enforcement
- Review expectation: keep task audit/governance scope tight; do not broaden into phase 7.5 polish/realtime work.

### Mailbox

- Draft search must be truthful across:
  - live provider drafts
  - DB-fallback provider drafts
  - local active drafts
- `in:draft` must not pretend to work through normal thread search if drafts remain on a separate path.
- Folder/type contracts must stay aligned with the real mailbox domain.

## How Future Chats Should Start

- Inspect the current branch/worktree first.
- Verify the PR diff against its base before trusting any summary.
- Keep prompts workflow-specific.
- If the user asks, “is this approval-ready?”, verify repo truth before answering.
- If blocked, return the exact fix prompt on the same branch/PR unless the user explicitly wants cleanup/reset.
- If restarting a sprint, confirm whether the old branch/PR still exists before giving execution instructions.
