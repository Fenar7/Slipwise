# Internal Messaging Phase 5 — Core Chat Functionality and Rich Chat Completion

This document defines a practical Sprint 5.1–5.5 delivery breakdown and a detailed Phase 5 PRD for Internal Messaging, grounded in the canonical Internal Messaging PRD and the now-merged Phase 4 realtime baseline.

## 1. Purpose

Phase 5 exists to turn Internal Messaging from a secure, realtime-capable subsystem into a real end-user chat product that teams can use for day-to-day communication.

Phase 4 established:

- authenticated realtime transport
- subscription-safe live delivery
- replay and reconnect behavior
- presence and typing propagation
- degraded-mode and transport safety rules
- durable delivery seams and diagnostics

That is necessary infrastructure, but it is not the same as a complete live messaging product.

Phase 5 must now deliver the product layer that sits on top of that infrastructure:

- real workspace hydration from backend data
- live channels, DMs, and groups as product-real surfaces
- trustworthy message, thread, and read-state behavior
- rich chat interactions such as mentions, reactions, edit/delete, and draft recovery
- secure file attachments and file-surface completion

This phase is intentionally broader than the original canonical shorthand of “core chat functionality.” The repo now has enough foundation and realtime safety to pull key rich-chat behavior into Phase 5 without dragging tasks, meetings, search, or notification-product completion into scope prematurely.

The result should be a production-grade internal chat system that feels credible for daily team communication before later productivity phases continue on top of it.

---

## 2. Canonical source alignment

This Phase 5 PRD extends the canonical document:

- `docs/PRD/INTERNAL_MESSAGING_PLATFORM_PRD.md`

It is also explicitly downstream of:

- `docs/PRD/INTERNAL_MESSAGING_PHASE_4_REALTIME_TRANSPORT_AND_DELIVERY_PRD.md`

Relevant canonical sections:

- `## 10. Messaging Workspace Design`
- `## 11. Conversation Model`
- `## 12. Channels, DMs, and Groups`
- `## 13. Message Composer, Threads, and Rich Content`
- `## 14. Mentions, Reactions, Presence, and Read State`
- `## 15. Files and Media Experience`
- `## 22. Permissions and Governance`
- `## 23. Domain Model and Internal Interfaces`
- `## 24. Realtime, Delivery, and Reliability Model`
- `## 25. Security, Audit, and Compliance`
- `## 26. Metrics, Diagnostics, and Supportability`
- `## 27. Delivery Workflow: Branches, Phases, and Sprints`
- `## 28. Detailed Phase Plan`
- `## 29. Acceptance Criteria`
- `## 30. Test Plan`

Canonical Phase 5 definition:

- **Phase 5 — Core Chat Functionality**
- **Goal:** channels, DMs, groups, threads, read state

This document preserves that intent but operationalizes it into a broader, execution-ready phase that also absorbs rich chat behavior that is necessary for a serious production chat product:

- mentions
- reactions
- message edit/delete
- draft recovery
- secure message attachments and file surfaces

This document does not replace the master PRD. It operationalizes Phase 5 into a delivery-ready spec.

---

## 3. Current implementation baseline at start of Phase 5

Phase 5 begins on top of the merged Internal Messaging Phase 4 baseline now present on:

- `feature/internal-messaging-platform`

### 3.1 What already exists

The current baseline already includes:

- messaging Prisma models and enums for:
  - conversations
  - participants
  - messages
  - threads
  - reactions
  - mentions
  - read state
  - presence sessions
  - typing sessions
  - attachments
  - tasks
  - meetings
  - calendar connections
  - audit events
  - retention policies
- domain types and service contracts for the messaging subsystem
- core services for:
  - conversations
  - participants
  - messages
  - threads
  - reactions
  - mentions/read state
  - presence
  - typing persistence
- read-model aggregators for conversation summary/detail and message detail
- org-safe query helpers and governance-safe routes
- Phase 3 authorization and governance rules
- Phase 4 realtime bootstrap, transport, replay, reconnect, and degraded-mode seams
- static messaging workspace UI from Phase 1
- baseline API routes for:
  - conversation list/detail
  - message list/send
  - participants
  - threads
  - archive/unarchive
  - lock/unlock
  - realtime bootstrap

### 3.2 What does not yet exist in product-real form

The current baseline does **not** yet provide a fully real, production-ready chat product for end users.

Key product gaps still remain:

- the main workspace shell is still primarily structured around static UI-era patterns and mock-data expectations
- conversation list and reading workspace are not yet fully hydrated from live backend data in the real user path
- thread UX is not yet fully completed as a trustworthy end-user live workflow
- read-state correctness across hydration, open, replay, and reconnect still needs product-level integration
- channels, DMs, and groups are not yet fully realized as complete create/manage/open/live surfaces
- mentions, reactions, and message lifecycle interactions are not yet fully productized
- secure file attachment flows and files-panel hydration are not yet complete
- compose-state recovery is not yet production-real

### 3.3 Key Phase 5 starting observations

The current baseline is in an unusual but healthy state:

- the backend and realtime seams are ahead of the workspace product integration
- the service layer already exposes much of the domain model needed for live chat
- the UI from Phase 1 is broad enough to host real product behavior, but it still needs to be rewired from static state to authoritative server state
- governance and org isolation are already locked, so Phase 5 must build on those rules rather than bypassing them for convenience
- later phases still own tasks, meetings, and search/notifications as dedicated product areas, so Phase 5 must stay disciplined even while broadening rich chat behavior

### 3.4 What Phase 5 must not redo

Phase 5 must not:

- redesign Phase 2 domain model fundamentals without a clear defect-driven reason
- reopen Phase 3 access and governance policy as a speculative redesign
- re-implement Phase 4 transport fundamentals because the workspace integration is awkward
- pull tasks, meetings/calendar, or search/notification product completion into the phase
- rely on mock data for critical functional behavior once a live path exists

---

## 4. Phase 5 goals

Phase 5 must result in the following outcomes:

- the messaging workspace loads and operates on real backend data for authorized users
- conversation list, detail, unread state, and live updates are product-real and trustworthy
- channels, DMs, and groups behave like real collaboration spaces rather than static UI shells
- thread, reply, and catch-up behavior are coherent across reload and reconnect
- mentions, reactions, edit/delete, drafts, and attachments work as first-class chat interactions
- file and attachment behavior is secure, explicit, and conversation-bound
- the product is credible for serious day-to-day internal team communication
- later phases can add tasks, meetings, search, and notification product depth without reopening the Phase 5 core chat model

---

## 5. Non-goals

Phase 5 does not include:

- native messaging tasks as a completed product workflow
- meetings and Google Calendar integration completion
- full cross-conversation or org-wide search product
- full notification center, digests, and reminder-product behavior
- portal/external conversation support
- voice/video calling
- universal E2EE redesign
- enterprise retention/export/legal hold completion
- advanced workflow automation across messaging events

This phase may preserve or lightly adapt UI stubs for later phases, but it must not absorb those later product areas into execution scope.

---

## 6. Product and engineering principles for Phase 5

### 6.1 Real workspace state must be server-authoritative

The workspace may use optimistic UX sparingly, but authoritative state must come from backend read models and approved mutation flows. Mock-only local state is no longer acceptable for core product behavior.

### 6.2 Realtime augments authoritative data, it does not replace it

Phase 4 transport remains a delivery mechanism. Phase 5 must use hydration + replay + live events together. No major UI behavior should depend on “the socket happened to deliver something” without safe recovery from HTTP reads and replay.

### 6.3 Governance remains part of product correctness

Channels, DMs, groups, message actions, attachments, and read-state behavior must all respect Phase 3 policy. A Phase 5 UX shortcut that weakens authorization or existence-hiding is a correctness bug.

### 6.4 Rich chat features are part of core trust

For a serious internal messaging product, users expect more than plain message send:

- replies
- unread correctness
- mentions
- reactions
- edit/delete semantics
- draft continuity
- attachments

Those interactions are part of product trust, not optional polish.

### 6.5 File handling must reuse secure platform patterns

Message attachments and file views must reuse secure storage and signed-access patterns rather than introducing ad-hoc file access rules.

### 6.6 State transitions must be explicit

The product must not silently hide or blur important chat states such as:

- removed member
- archived conversation
- locked conversation
- reconnect/degraded mode
- failed attachment upload
- deleted message
- edited message
- stale draft recovery

### 6.7 Later phases must remain cleanly separable

Phase 5 should be rich enough to feel real, but it must still hand off cleanly to:

- Phase 6 for broader files/mentions/rich-content expansion that goes beyond core chat
- Phase 7 for tasks
- Phase 8 for meetings/calendar
- Phase 9 for search/notifications/productivity

---

## 7. Recommended Sprint 5.1–5.5 breakdown

## Sprint 5.1 — Live workspace hydration and real conversation loading

### Goal

Replace static workspace assumptions with a live, backend-hydrated messaging workspace for channels, DMs, and groups.

### Scope

- load conversation summaries from real server read models
- load selected conversation detail from real server read models
- wire the reading workspace to real messages, participants, threads, and read-state data
- bootstrap realtime session from the workspace using the Phase 4 transport contract
- render authorized empty, restricted, removed-member, archived, locked, and degraded states from real backend signals
- remove product-critical dependence on static mock data from the main conversation workflow
- preserve responsive behavior while replacing fake state with live state

### Required implementation decisions

- authoritative hydration must begin with HTTP/server reads, not socket-only state
- workspace-level state must distinguish:
  - hydrated conversation list
  - selected conversation detail
  - reconnecting/degraded transport state
  - restricted/removed-member states
- realtime bootstrap must be lazy enough to avoid waste, but eager enough that the workspace feels live when opened
- no unauthorized conversation detail should be briefly shown during loading transitions

### Deliverables

- live conversation-list integration
- live conversation-detail integration
- workspace-level loading/restricted/degraded state model
- realtime bootstrap integration in the chat workspace
- removal of core mock-data dependence from the main chat path

### Acceptance criteria

- authorized users can open Messaging and see real conversations
- selecting a conversation loads real detail safely
- unread counts and latest activity reflect backend state
- removed/restricted users do not see unauthorized detail
- degraded/reconnect state is explicit and recoverable

### Out of scope

- message edit/delete
- mentions/reactions
- attachment upload flows
- channel/group creation and membership management beyond what is needed to load existing data

---

## Sprint 5.2 — Live message send, threads, and read-state correctness

### Goal

Make the live reading pane trustworthy for sending, replying, threading, catch-up, and unread/read-state behavior.

### Scope

- wire top-level message send to live mutation paths
- wire thread reply flows to live thread/message surfaces
- render live thread detail and reply state
- integrate read-state updates when users open, read, or catch up in a conversation
- keep list summary unread state, message pane state, and realtime events coherent
- ensure reconnect/replay does not duplicate messages or corrupt thread/read-state UI

### Required implementation decisions

- read-state updates must remain server-authoritative
- reconnect/replay-safe UI behavior must be designed up front rather than patched after duplication bugs appear
- optimistic sends may be used only if:
  - duplicate reconciliation is explicit
  - failure rollback is safe
  - reconnect does not cause double-rendered messages
- thread state must remain coherent between main pane and thread pane

### Deliverables

- live message-send integration
- live thread reply integration
- read-state update path from workspace UI
- reconnect/replay-safe message and thread rendering rules
- unread summary synchronization rules

### Acceptance criteria

- users can send messages and replies in real conversations
- thread replies appear in the correct thread and main conversation context
- unread counts clear only when backed by real read-state updates
- reconnect/replay does not create duplicate local messages
- removed-member and locked/archived rules still hold during live use

### Out of scope

- channel/group creation flows
- mentions/reactions
- attachment upload/download completion

---

## Sprint 5.3 — Live channels, DMs, groups, and membership-facing workspace behavior

### Goal

Make conversation creation and membership-aware workspace behavior real for channels, DMs, and groups.

### Scope

- live channel creation flow
- live DM creation flow
- live group creation flow
- participant list hydration in the conversation detail context
- membership-sensitive workspace transitions when conversation visibility or membership changes
- role-aware exposure of archive/unarchive, lock/unlock, and related governance actions already supported by backend policy
- correct DM uniqueness and peer validation behavior
- live refresh/realtime behavior after new conversation creation

### Required implementation decisions

- one-to-one DM creation must avoid accidental duplicate threads
- group/channel creation must respect visibility and membership rules
- the workspace must handle the case where a currently-open conversation becomes inaccessible due to governance or membership change
- creation UX must not trust client-only assumptions about who may be added or what visibility is allowed

### Deliverables

- live create-channel flow
- live create-DM flow
- live create-group flow
- real participant/membership workspace hydration
- post-create workspace routing and hydration behavior

### Acceptance criteria

- users can create real channels, DMs, and groups within policy
- DM creation does not create duplicate one-to-one spaces for the same pair
- participant and visibility changes are reflected coherently in workspace state
- governance-sensitive actions remain role-safe and auditable

### Out of scope

- reactions and mentions
- attachment upload/download completion
- task or meeting product workflows

---

## Sprint 5.4 — Rich chat interactions: mentions, reactions, edit/delete, and draft continuity

### Goal

Complete the core interaction layer expected from a serious internal chat product.

### Scope

- `@mention` parsing and participant validation
- mention creation and rendering in live messages
- reaction add/remove flows
- live reaction summary updates
- message edit behavior where product policy allows
- message delete behavior where product policy allows
- draft continuity / recovery for unsent compose state
- reconnect-safe rendering of edited/deleted message state
- real mention highlight and interaction behavior in the reading workspace

### Required implementation decisions

- mentions must only target valid, visible participants
- reactions must be idempotent and replay-safe
- edited/deleted state must not leak prior content improperly where policy forbids it
- draft continuity may be local-first or server-backed, but it must be explicit, bounded, and reconnect-safe
- optimistic interaction patterns must reconcile safely with server state and replay

### Deliverables

- mention validation and rendering path
- reaction add/remove integration
- edit/delete mutation and UI integration
- draft continuity mechanism for unsent compose state
- workspace rendering rules for edited/deleted/mentioned state

### Acceptance criteria

- users can mention valid participants and not mention invalid or removed users
- reactions update live and remain idempotent under replay/reconnect
- edit/delete behavior is policy-safe and visually consistent
- users do not lose unsent compose state trivially
- rich interaction state remains coherent across reload and reconnect

### Out of scope

- full notification-product completion for mentions
- full search-product indexing for mention/reaction content

---

## Sprint 5.5 — Attachments, files surfaces, and phase closeout hardening

### Goal

Pull secure attachments and file surfaces into the live chat product and close the phase to a production bar.

### Scope

- attachment upload contract for message send flows
- attachment linking to messages and threads
- secure attachment download/open behavior
- file panel hydration from real attachment data
- attachment preview and failure states
- visibility-safe handling of attachments for removed/restricted users
- final closeout hardening across core chat workspace flows
- final pass on reconnect/degraded behavior for attachment-heavy conversations

### Required implementation decisions

- attachment access must reuse secure signed/authorized access patterns
- attachment upload failure states must be explicit, not silent
- the files panel must derive from real message attachment state rather than a separate shadow model
- attachment visibility must remain tied to conversation authorization, not to guessed storage paths
- large file and blocked/invalid file behavior must be bounded and supportable

### Deliverables

- live attachment send integration
- secure attachment download/view path
- real files-panel hydration
- attachment failure-state UX
- final Phase 5 hardening and verification pass

### Acceptance criteria

- users can attach and access files in live chat safely
- file access respects org membership and conversation visibility
- attachment failures are visible and recoverable
- the files panel reflects real shared files
- Phase 5 ends with a credible daily-use internal chat product

### Out of scope

- broader document/workflow linking
- task/meeting attachment-product expansion
- enterprise export/retention workflow completion

---

## 8. Phase 5 architecture decisions and internal contracts

## 8.1 Workspace hydration model

Phase 5 must use a hybrid model:

- HTTP/server-backed hydration for authoritative load and recovery
- Phase 4 realtime for live deltas
- replay/reconnect to bridge transport interruptions

The workspace must never assume “socket event receipt” is sufficient to establish initial truth.

## 8.2 Conversation list and detail contracts

Phase 5 should rely on stable server-backed read models for:

- conversation summary list
- selected conversation detail
- message detail and thread detail
- participant summary
- unread/read-state metadata
- attachment/file summaries
- restricted and degraded workspace states

If current read models are too thin, they must be extended deliberately rather than bypassed with ad-hoc route composition in the client.

## 8.3 Message send and thread interaction model

Phase 5 must keep database-backed message creation authoritative.

Live send behavior should follow this pattern:

1. user submits message
2. message persists through service layer
3. server returns authoritative result
4. realtime fanout reaches active subscribers
5. reconnect/replay remains safe if the socket path was interrupted

The same applies to thread replies, reactions, mentions, edit/delete, and read-state updates.

## 8.4 Draft continuity contract

Draft continuity must be explicitly bounded.

The implementation must define:

- whether drafts are local-first, server-backed, or hybrid
- what key identifies a draft context:
  - conversation
  - thread
  - compose mode
- when stale drafts are discarded or replaced
- what happens if a conversation becomes locked/archived/restricted while a draft exists

Draft behavior must not create unauthorized persistence or confusing ghost-draft behavior after policy changes.

## 8.5 Mentions and reactions contract

Mentions and reactions must remain first-class domain behavior rather than client-only decoration.

Expected contract principles:

- mentions are validated against active visible participants
- reaction writes are idempotent
- read-model outputs include enough metadata for summary rendering
- replay/reconnect does not double-apply reactions
- deleted/edited content behavior is explicit where mentions or reactions remain attached

## 8.6 Attachment and files contract

Attachment design must preserve:

- secure upload association to a message send flow
- authorized access on open/download
- storage references rather than client-trusted file paths
- safe preview behavior
- supportable failure modes

The files panel should be a read surface over message-linked attachments, not a separate storage browser.

---

## 9. Security, governance, and failure-mode expectations

Phase 5 must preserve all earlier guarantees:

- strict org scoping
- role-aware governance
- existence-hiding where policy requires it
- no client-trusted membership logic
- no unauthorized attachment access
- no stale or hidden content leaks through reconnect/replay paths

Phase 5 must additionally define explicit behavior for:

- removed member while conversation is open
- conversation locked while user has an unsent draft
- conversation archived while a thread pane is open
- attachment upload fails after text is composed
- reconnect happens during active typing / draft state
- edit/delete arrives during degraded reconnect recovery
- mention target removed between compose and send

These are product states, not edge-case afterthoughts.

---

## 10. Branching and review workflow

### Root branch

- `feature/internal-messaging-platform`

### Phase 5 branch

- `feature/internal-messaging-phase-5-core-chat-functionality`

### Sprint branches

Each sprint must branch from the Phase 5 branch and open a PR back into that Phase 5 branch.

Recommended sprint branches:

- `feature/internal-messaging-phase-5-sprint-1-live-workspace-hydration`
- `feature/internal-messaging-phase-5-sprint-2-message-thread-readstate`
- `feature/internal-messaging-phase-5-sprint-3-channel-dm-group-live-management`
- `feature/internal-messaging-phase-5-sprint-4-rich-chat-interactions`
- `feature/internal-messaging-phase-5-sprint-5-attachments-files-closeout`

### Review workflow

Workflow:

1. Sprint branch is implemented
2. Sprint PR is opened into the Phase 5 branch
3. Sprint PR is reviewed and approved
4. Sprint branch merges into the Phase 5 branch
5. After all Sprint 5.x branches merge, Phase 5 merges into `feature/internal-messaging-platform`

### Control rules

- no sprint should silently absorb later-sprint scope unless the PRD explicitly calls it out
- no mailbox files should be touched by Internal Messaging work
- no mock-data-only fallback should remain in critical product paths once the live path exists
- comments and code quality must remain deliberate and human-reviewable, not AI-sloppy

---

## 11. Phase 5 acceptance criteria

Phase 5 is complete only when:

- the workspace operates on real backend conversation state
- real channels, DMs, and groups can be used safely by authorized users
- sending, replying, threading, and read-state behavior are trustworthy
- mentions, reactions, edit/delete, drafts, and attachments behave like real product features
- reconnect and degraded-mode behavior do not silently corrupt the user’s understanding of message state
- file sharing is secure, explicit, and conversation-bound
- the product feels credible for normal internal team communication before later task/meeting/search/notification phases continue

---

## 12. Test plan

Phase 5 must include:

- service-layer tests for new messaging behaviors
- route-level tests for added mutation/read surfaces
- UI integration tests for live workspace behavior
- replay/reconnect regression tests where user-visible state can drift
- attachment and authorization tests

### Minimum scenario coverage

- authorized user can load real conversation summaries
- authorized user can open real conversation detail
- unauthorized or removed users cannot infer hidden conversation content
- live send creates correct message state and updates summary state
- thread replies appear in the correct thread and conversation detail
- read-state transitions update unread counts correctly
- reconnect/replay does not duplicate messages or reactions
- DM creation enforces one-to-one uniqueness semantics
- group/channel creation respects visibility and membership rules
- mentions reject invalid or removed participants
- reactions are idempotent
- edit/delete rendering remains correct after reload and reconnect
- unsent draft continuity behaves predictably
- attachment upload/download obeys conversation auth rules
- files panel reflects real attachments
- degraded transport state still allows authoritative recovery

### Quality bar

Tests should prove:

- product correctness
- authorization safety
- reconnect/replay integrity
- UI/server contract consistency
- absence of silent trust gaps

---

## 13. Risks and product warnings

Primary Phase 5 risks:

- workspace migration from mock-data assumptions to live state can introduce stale or duplicate rendering bugs
- optimistic UX for sends/reactions/edits can break replay safety if not modeled carefully
- draft continuity can become confusing or unsafe if conversation policy changes are not handled explicitly
- attachment work can accidentally weaken authorization if access rules are inferred from storage alone
- broadening Phase 5 too far can re-open later-phase scope and slow delivery quality

Mitigations:

- keep the sprint split disciplined
- preserve server-authoritative read/write flows
- test replay/reconnect alongside UI behavior, not separately
- make restricted/degraded states explicit in the read model and workspace state machine
- keep tasks, meetings, and search/notification product depth out of the phase

---

## 14. Exit gate to Phase 6+

Phase 6 and later phases can begin only after Phase 5 locks:

- a real live messaging workspace
- stable conversation and thread behavior
- trusted read/unread semantics
- rich chat interaction correctness
- secure message attachment behavior

Once Phase 5 is complete:

- Phase 6 can safely deepen files, mentions, and richer content behavior beyond the core chat baseline
- Phase 7 can add native task workflows without reworking basic chat state
- Phase 8 can add meetings/calendar on top of a trustworthy conversation product
- Phase 9 can add search/notifications/productivity on top of a stable message and attachment model

Phase 5 is therefore the point where Internal Messaging should stop feeling like a platform-in-progress and start feeling like a real internal chat product.
