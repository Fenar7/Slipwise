# Slipwise Mailbox Gmail-Grade Search PRD

**Document Version:** 1.0  
**Date:** June 9, 2026  
**Product:** Slipwise Mailbox  
**Prepared by:** Product / Engineering Planning  
**Status:** Execution PRD for post-Sprint 6.3+ Gmail-grade search work

---

## Table of Contents

1. Executive Summary  
2. Why This PRD Exists  
3. Problem Statement  
4. Product Goals  
5. Explicit Non-Goals  
6. Locked Product Decisions  
7. Current System Truth  
8. Target User Experience  
9. Search Modes and UX Contract  
10. Search Correctness and Completeness Model  
11. Backend Architecture Direction  
12. Data Model and Indexing Direction  
13. UI / UX Requirements  
14. Failure States and Degraded States  
15. Security and Compliance Requirements  
16. Performance Requirements  
17. Delivery Workflow and Branch Strategy  
18. Sprint Breakdown  
19. Acceptance Criteria  
20. Test Plan  
21. Engineering Quality Bar  
22. Open Risks and Warnings  
23. Final Delivery Definition

---

## 1. Executive Summary

Slipwise Mailbox needs a **true Gmail-grade search experience**. The current mailbox search is improved, but it still does not feel native, instant, or fully trustworthy to users who expect Gmail-like behavior.

The current system can:

- return incomplete results when Gmail provider search or hydration degrades
- conflate **thread results** with what users mentally expect as **message results**
- depend too heavily on synchronous provider retrieval for perceived search quality
- show partial-result states that are technically truthful but still operationally unsatisfying

This PRD defines the next body of work to close that gap.

The direction is:

- keep Mailbox operationally **thread-first**
- add a first-class **Messages** search mode
- make search **fast from local indexed data**
- keep Gmail provider search as a supplement and truth source, not the only interactive path
- ensure degraded states are explicit, precise, and operationally useful

This must be implemented as a set of **sub-branches under the current Sprint 6.3+ branch**, then merged back into that branch after review and approval.

---

## 2. Why This PRD Exists

The canonical mailbox PRD already establishes:

- Mailbox is a first-class product area
- Gmail is the first provider
- the inbox must feel production-grade and familiar to Gmail users
- search and filter UX are core mailbox capabilities

What it does **not** yet define in enough detail is the exact follow-on execution needed to make mailbox search feel near-native to Gmail users at production quality.

This PRD fills that gap.

It is not a new mailbox initiative. It is a focused execution PRD for:

- Gmail-grade search completeness
- Gmail-grade search speed
- deterministic dual-mode results
- truthful degraded-state behavior
- production-ready search architecture

---

## 3. Problem Statement

Users expect mailbox search to behave like Gmail:

- fast
- broad
- forgiving
- comprehensive
- understandable

The current search path does not fully satisfy that expectation.

### Current observed problems

1. Searching for terms like `chatgpt` can still feel incomplete.
2. Users may see only a small number of **thread rows** even when many matching **messages** exist.
3. Partial-result warnings appear when provider search or hydration degrades.
4. Search can depend on provider latency and local hydration timing.
5. Search is still not consistently “instant”.

### Root causes

1. The current surface is fundamentally a **thread list**, but user expectations during search are often **message-oriented**.
2. Gmail provider search is exact and useful, but not sufficient on its own for interactive UX.
3. Local normalized search is still not a dedicated mailbox search index.
4. Search completeness is constrained by folder coverage and hydration success.
5. The UI does not yet expose a complete model of search truth and search scope.

---

## 4. Product Goals

This project must deliver all of the following.

### 4.1 Core experience goals

- Search feels fast enough to approximate Gmail expectations.
- Search results are trustworthy.
- Search explains what the user is looking at:
  - matching threads
  - matching messages
  - partial results
  - mailbox-specific degradation

### 4.2 Product goals

- Preserve thread-first operational Mailbox workflows.
- Add first-class message search for Gmail-like expectations.
- Prevent silent result loss when provider search or hydration degrades.
- Support multi-mailbox organizations without cross-connection confusion.
- Ensure results remain secure and permission-scoped.

### 4.3 Engineering goals

- production-ready code only
- no AI slop
- no spaghetti control flow
- no duplicated policy logic
- no UI-only correctness guarantees
- no hidden provider-specific leakage into the core mailbox domain model where avoidable

---

## 5. Explicit Non-Goals

This effort does **not** do the following:

- replace Mailbox with a raw Gmail clone
- abandon thread-first operational workflow
- implement full Gmail parity for every advanced search operator
- widen into new providers beyond what the provider abstraction already supports
- redesign the full Mailbox shell or navigation
- solve every old branch-wide lint or React compiler issue unrelated to search behavior
- redesign linked context, assignment, or workflow state beyond what is needed to keep search results coherent

---

## 6. Locked Product Decisions

These decisions are fixed for execution.

### 6.1 Dual mode search is required

Mailbox search will support:

- **Threads** mode
- **Messages** mode

Default mode:

- **Threads**

Reason:

- operational inbox work stays thread-first
- Gmail-like “show every matching email” requires message-level results
- a single mode cannot satisfy both expectations cleanly

### 6.2 Thread search remains the main triage mode

The main mailbox experience remains:

- thread list
- reading pane
- operational metadata
- assignment/state/linking

### 6.3 Message search is a search mode, not a second inbox

Messages mode is:

- a search projection
- not a new mailbox list model
- not a new ownership model
- not a new conversation system

### 6.4 Search must be local-first for responsiveness

Interactive search must not depend on synchronous provider fetches alone.

Gmail provider search remains important, but the product must use a **local mailbox search index** for fast, deterministic rendering.

### 6.5 Partial results must never masquerade as complete

If search completeness is degraded, the UI must say so clearly and precisely.

---

## 7. Current System Truth

As of this PRD:

- the main mailbox work is on branch:
  - `feature/mailbox-gmail-grade-coverage-sprint-6-3-plus`
- the current search system already contains:
  - provider-backed Gmail search path
  - improved pagination cursor safety
  - local fuzzy fallback supplementation
  - search metadata for partial-result truth
- the current system still lacks:
  - dual-mode search
  - dedicated mailbox search index
  - provider-hit shell rendering
  - mailbox-specific degraded search diagnostics
  - message search result rendering

Also important:

- folder coverage truth exists
- archive coverage is not modeled as a separate required folder in the current Sprint 6.3+ design
- the current mailbox list is a **thread list**, not a message list

---

## 8. Target User Experience

### 8.1 When the user types a plain query like `chatgpt`

The user should be able to:

- stay in **Threads** mode and see matching conversations quickly
- switch to **Messages** mode and see every matching email quickly
- understand whether results are complete
- understand which mailbox is degraded if not complete

### 8.2 Thread mode behavior

Each thread row should be able to communicate:

- thread subject
- best-match snippet
- sender identity or latest relevant sender
- mailbox identity
- count of matching messages inside the thread, when greater than 1
- timestamp
- workflow state

### 8.3 Message mode behavior

Each result row should communicate:

- matched message sender
- subject
- matched snippet
- timestamp
- parent thread context
- mailbox identity

Click behavior:

- open the parent thread
- focus or emphasize the matched message in the reading pane

### 8.4 Search truth

The UI must always communicate:

- current mode: Threads or Messages
- whether result counts are exact
- whether results are partial
- what mailbox is degraded if applicable

---

## 9. Search Modes and UX Contract

### 9.1 Threads mode

Purpose:

- operational triage
- workflow ownership
- conversation-level search

Returned unit:

- mailbox thread

Expected behavior:

- multiple matching emails in one thread collapse into one thread result
- thread should surface count of matching messages where applicable
- best-match snippet should be preferred over default preview when available

### 9.2 Messages mode

Purpose:

- Gmail-like search behavior
- find the exact email the user remembers

Returned unit:

- mailbox message

Expected behavior:

- each matching email can appear as its own result
- multiple messages from the same thread can appear
- selecting a message navigates into its parent thread and emphasizes the match

### 9.3 URL/query-state contract

Search mode must be persisted in mailbox query state.

Recommended query key:

- `searchMode=threads|messages`

Saved views may preserve:

- search mode
- query string
- operational filters

### 9.4 Default behavior

If the user has not explicitly chosen a mode:

- use `threads`

---

## 10. Search Correctness and Completeness Model

### 10.1 Results must be completeness-aware

Search is not binary complete/incomplete. It has states.

Required states:

- complete
- partial due to coverage
- partial due to provider failure
- partial due to hydration failure
- partial due to auth/connection degradation

### 10.2 Thread mode retrieval model

Thread mode must merge:

1. local indexed thread/message matches
2. Gmail provider search hits
3. hydrated provider hits not yet fully normalized

Deduplication key:

- org + mailboxConnectionId + providerThreadId

### 10.3 Message mode retrieval model

Message mode must merge:

1. local indexed message matches
2. Gmail provider message hits
3. hydrated message shells where full normalization is pending

Deduplication key:

- org + mailboxConnectionId + providerMessageId

### 10.4 Provider hits must not silently disappear

If Gmail returns a hit and Slipwise cannot fully hydrate it yet:

- the hit should render as a shell result if safe
- not be silently dropped

### 10.5 Coverage truth matters

Search completeness must be aware of:

- required Gmail folder coverage state
- whether the local index is considered complete enough for the current mailbox scope

If coverage is incomplete:

- results must be marked partial
- not falsely presented as exhaustive

---

## 11. Backend Architecture Direction

### 11.1 Separate search orchestration service

Introduce a dedicated mailbox search orchestration layer rather than continuing to grow `thread-service` into a monolith.

Recommended new service:

- `mailbox-search-service`

Responsibilities:

- search mode dispatch
- provider search orchestration
- local index query orchestration
- merge + rank + dedupe
- degraded-state computation
- result metadata generation

### 11.2 Existing services should remain focused

- `thread-service` should continue to own thread listing/detail concerns
- provider adapters should remain provider-specific
- sync/coverage services should remain separate
- UI hooks should stay thin

### 11.3 Provider adapter additions

The provider contract may expand to support:

- thread search
- message search
- shell hydration fetches by message or thread
- provider hit ranking metadata where available

Provider-specific behavior must stay inside the adapter layer.

---

## 12. Data Model and Indexing Direction

### 12.1 New local search index is required

Ad hoc `contains` queries on thread/message fields are not sufficient for Gmail-grade interactive search.

Add a dedicated search index model.

Recommended model:

- `MailboxSearchDocument`

### 12.2 Minimum fields

Required persisted fields:

- `id`
- `orgId`
- `mailboxConnectionId`
- `threadId`
- `messageId` nullable
- `documentType` = `THREAD` or `MESSAGE`
- `providerThreadId`
- `providerMessageId` nullable
- `searchText`
- `subjectText`
- `snippetText`
- `fromDisplayName`
- `fromEmail`
- normalized recipient text
- `lastActivityAt`
- `sentAt`
- `isUnread`
- `isFlagged`
- `status`
- `assigneeId`
- `createdAt`
- `updatedAt`

### 12.3 Indexing rules

The index must update on:

- initial ingestion
- thread summary recalculation
- body recovery / hydration
- send/reply that adds new messages

### 12.4 Soft consistency policy

The UI may render from local index immediately while hydration catches up, but:

- stale entries must not remain indefinitely
- provider-backed corrections must reconcile deterministically

---

## 13. UI / UX Requirements

### 13.1 Search mode switch

Add a visible control in the mailbox search surface:

- Threads
- Messages

This must feel native to the mailbox command/search bar, not bolted on.

### 13.2 Counts and labels

Thread mode:

- use “threads”
- where possible surface exact count
- otherwise surface loaded count + partial/exactness truth

Message mode:

- use “messages”
- do not label them as threads

### 13.3 Empty states

Empty states must distinguish:

- true no results
- partial search results with no safe rendered rows
- no messages in selected mailbox
- no threads in current smart view

### 13.4 Degraded result banner

When partial:

- show which mailbox is incomplete
- explain whether the issue is:
  - coverage incomplete
  - reconnect/auth problem
  - provider unavailable
  - hydration incomplete

### 13.5 Match emphasis

Where feasible:

- highlight matched terms in snippets
- especially in message mode

### 13.6 Reading pane behavior

When a message result is selected:

- open parent thread
- scroll or expand to matched message
- visually emphasize the matched message

---

## 14. Failure States and Degraded States

All failure states must be product-quality and human-readable.

### 14.1 Required degraded classifications

- provider unavailable
- auth expired / reconnect required
- mailbox coverage incomplete
- hydration incomplete
- partial local index readiness

### 14.2 Required user-facing behavior

- no generic “some connections” banner if exact mailbox identity is known
- no raw Gmail API jargon
- no silent dropping of provider hits
- no fake exact counts

### 14.3 Required operator diagnostics

Engineering/support should be able to inspect:

- provider query success per connection
- count of provider hits
- count of hydrated hits
- count of shell-only hits
- count of local indexed hits
- degraded reason per connection

---

## 15. Security and Compliance Requirements

This search work must remain fully secure.

### 15.1 Access control

- search results must remain org-scoped
- mailbox visibility policies must still apply
- no cross-connection leakage
- no restricted mailbox leakage

### 15.2 Data exposure

- provider-hit shell rendering must not expose data the user cannot access
- highlighted snippets must remain subject to mailbox visibility rules
- no raw provider payloads returned directly to UI beyond safe mapped fields

### 15.3 Logging and observability

- search diagnostics must not log full message bodies in plain text
- query strings may be sensitive; log carefully and minimally

---

## 16. Performance Requirements

### 16.1 User-perceived speed

Typing into search should feel immediate.

Target interaction model:

- local results appear fast
- stale requests cancel cleanly
- mode switch does not stall the UI

### 16.2 Pagination correctness

No:

- duplicate results
- skipped results
- dead “load more” loops

### 16.3 Provider dependence

Interactive UX must not block entirely on provider fetches.

Provider fetches should:

- supplement
- reconcile
- hydrate

not define the entire interactive experience.

---

## 17. Delivery Workflow and Branch Strategy

This work must follow the current mailbox branch workflow.

### 17.1 Parent branch

Current working branch:

- `feature/mailbox-gmail-grade-coverage-sprint-6-3-plus`

All follow-on Gmail-grade search work must branch from this branch.

### 17.2 Sub-branch workflow

Do this as **sub-branches**, not direct unreviewed commits to the parent branch.

Recommended sub-branches:

1. `feature/mailbox-gmail-search-sprint-a-truth-and-coverage`
2. `feature/mailbox-gmail-search-sprint-b-dual-mode-results`
3. `feature/mailbox-gmail-search-sprint-c-local-search-index`
4. `feature/mailbox-gmail-search-sprint-d-gmail-query-semantics-and-ranking`

### 17.3 Merge workflow

Each sub-branch must:

- be implemented in isolation
- have its own focused PR
- be reviewed and approved
- merge back into `feature/mailbox-gmail-grade-coverage-sprint-6-3-plus`

After all approved sub-branches are merged:

- the parent Sprint 6.3+ branch becomes the promotion branch for the larger mailbox workflow

### 17.4 Quality bar for every sub-branch

Every PR must be:

- production-ready
- secure
- edge-case covered
- no AI slop
- no spaghetti code
- no hidden regressions

---

## 18. Sprint Breakdown

### Sprint A — Search Truth and Coverage Readiness

Deliver:

- richer `searchMeta`
- mailbox-specific degraded diagnostics
- search completeness state model
- truthful empty/degraded state UX
- search observability seam

Must not yet do:

- full message search mode
- new search index persistence

### Sprint B — Dual-Mode Search UI and Retrieval

Deliver:

- `Threads` / `Messages` mode switch
- mode-aware route/query state
- message search result shape
- parent thread open + matched message emphasis
- provider-hit shell rendering

Must not yet do:

- full dedicated local search index

### Sprint C — Local Search Index

Deliver:

- new `MailboxSearchDocument` model
- ingestion/index update path
- local-first indexed search path
- deterministic merge between local index and provider hits

Must not yet do:

- broad ranking tuning beyond what is needed for correctness

### Sprint D — Query Semantics, Ranking, and Polish

Deliver:

- message/thread ranking policy
- sender/display-name/body matching improvements
- advanced operator handling hardening
- better counts, highlights, and exactness semantics
- final search performance/stability polish

---

## 19. Acceptance Criteria

This initiative is not done unless all of the following are true.

### Product acceptance

- users can search in Threads mode and Messages mode
- searching `chatgpt` can show either:
  - matching threads in Threads mode
  - matching individual emails in Messages mode
- results are fast enough to feel near-instant under normal mailbox sizes
- the UI clearly communicates when results are partial

### Engineering acceptance

- search correctness is deterministic
- pagination does not skip or duplicate
- provider hits are not silently lost
- local index is updated reliably

### Security acceptance

- no access-control regressions
- no mailbox visibility leakage
- no cross-org leakage

---

## 20. Test Plan

### 20.1 Service tests

- thread-mode merge of provider hits + local index hits
- message-mode merge of provider hits + local index hits
- dedupe correctness
- pagination correctness
- degraded metadata correctness
- coverage-state correctness

### 20.2 UI tests

- mode switch behavior
- empty states
- partial-result banners
- exact vs non-exact count rendering
- matched message navigation into reading pane

### 20.3 Integration tests

- Gmail provider zero-hit + local index hit
- Gmail provider hit + hydration lag
- partial provider failure on one mailbox in all-inboxes search
- stale request cancellation during fast typing

### 20.4 Security tests

- restricted mailbox hidden from search
- org-scoped isolation
- no provider shell leakage beyond safe mapped fields

### 20.5 Performance tests

- repeated query changes
- load more in both modes
- large mailbox result sets

---

## 21. Engineering Quality Bar

This work must be held to a high engineering bar.

### Required

- production-ready only
- no AI slop
- no spaghetti code
- clear service boundaries
- predictable data flow
- mode-aware but not duplicated logic
- secure-by-default behavior

### Not allowed

- burying search orchestration inside an already-bloated service without structure
- provider-specific leakage into generic UI types where avoidable
- hiding failures by returning empty arrays without degraded metadata
- fake exact counts
- thread/message mode ambiguity

---

## 22. Open Risks and Warnings

### 22.1 Archive coverage gap

Current coverage truth does not model archive as its own required folder.

This means:

- search completeness cannot simply be equated with current folder coverage
- Sprint A must explicitly define what “search complete enough” means under the current model

### 22.2 Existing branch debt

There are already older branch-level lint / React compiler issues in unrelated mailbox files.

This work must:

- not widen into broad unrelated cleanup
- but must not add more debt either

### 22.3 Search index introduction

Adding a new local search index is the biggest architectural change in this plan.

It is justified, but must be:

- narrow
- well tested
- migration-safe
- clearly integrated with current ingestion flows

---

## 23. Final Delivery Definition

The Gmail-grade search effort is complete only when:

- Mailbox search feels fast and trustworthy
- users can explicitly choose Threads vs Messages
- provider degradation is visible and precise
- provider hits do not silently disappear
- local indexed search gives near-instant results
- the system remains secure, production-ready, and maintainable

This work is to be executed as reviewed **sub-branches under**:

- `feature/mailbox-gmail-grade-coverage-sprint-6-3-plus`

and merged back into that branch after approval, following the branch workflow defined above.

