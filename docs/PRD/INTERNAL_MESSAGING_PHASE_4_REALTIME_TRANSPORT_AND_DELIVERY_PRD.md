# Internal Messaging Phase 4 — Realtime Transport and Delivery

This document defines a practical Sprint 4.1–4.5 delivery breakdown and a detailed Phase 4 PRD for Internal Messaging, grounded in the canonical Internal Messaging PRD and the now-merged Phase 3 governance baseline.

## 1. Purpose

Phase 4 exists to turn Internal Messaging from a governed but mostly request/response-backed subsystem into a reliable realtime product surface.

Phase 3 established:

- org-scoped authorization rules
- governance-safe mutation behavior
- hidden-safe read behavior
- auditable sensitive operations
- safe route/service contracts
- enough policy correctness to support realtime rollout

Phase 4 must now introduce the delivery layer that makes the messaging system feel instant, reliable, and production-grade without weakening the Phase 3 guarantees.

This phase is not just “add websockets.” It must define and implement:

- authenticated realtime session establishment
- conversation-scoped subscription rules
- reliable event fanout
- replay and reconnect behavior
- presence and typing propagation
- read-state synchronization
- durable delivery seams for later notifications and indexing
- degraded-mode behavior and diagnostics

This phase should make the messaging platform operationally credible before broader Phase 5 chat richness and later productivity features continue on top of it.

---

## 2. Canonical source alignment

This Phase 4 PRD extends the canonical document:

- `docs/PRD/INTERNAL_MESSAGING_PLATFORM_PRD.md`

Relevant canonical sections:

- `## 22. Permissions and Governance`
- `## 23. Domain Model and Internal Interfaces`
- `## 24. Realtime, Delivery, and Reliability Model`
- `## 25. Security, Audit, and Compliance`
- `## 26. Metrics, Diagnostics, and Supportability`
- `## 27. Delivery Workflow: Branches, Phases, and Sprints`
- `## 28. Detailed Phase Plan`
- `## 29. Acceptance Criteria`
- `## 30. Test Plan`

Canonical Phase 4 definition:

- **Phase 4 — Realtime Transport and Delivery**
- **Goal:** introduce instant messaging infrastructure

This document does not replace the master PRD. It operationalizes Phase 4 into a delivery-ready execution spec.

---

## 3. Current implementation baseline at start of Phase 4

Phase 4 begins on top of the merged Internal Messaging Phase 3 baseline now present on:

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
- service contracts and domain types for the messaging subsystem
- core services for:
  - conversations
  - participants
  - messages
  - threads
  - reactions
  - mentions/read state
  - presence/typing persistence
- read-model aggregators for conversation summary/detail views
- org-safe query helpers
- Phase 3 authorization and governance policy
- Phase 3 governance audit hardening
- messaging API read/mutation routes for the current foundation surface
- test coverage through Sprint 3.4 that proves visibility and governance correctness

### 3.2 What does not yet exist

The current baseline does **not** yet provide:

- an authenticated dedicated realtime transport for messaging
- live subscription and fanout behavior for conversations
- reconnect and replay semantics
- durable delivery cursors for realtime event recovery
- transport-aware presence propagation
- transport-aware typing propagation
- authoritative message delivery event publishing after commit
- worker-driven downstream seams for notifications and indexing
- production-grade realtime observability and degraded-state handling
- client/server realtime protocol contracts for the messaging workspace

### 3.3 Key Phase 4 starting observations

The current baseline is ready for realtime because the security and authorization model is now locked, but the realtime layer must still be designed carefully:

- membership and org visibility must remain the source of truth for subscriptions
- realtime fanout must never bypass Phase 3 authorization behavior
- message durability must remain database-first, not transport-first
- presence and typing already have persisted concepts, but they are not yet live-propagated
- notification and indexing product features belong later, but Phase 4 must create their reliable delivery seams now
- degraded fallback behavior must exist, but polling must not become the primary UX model

---

## 4. Phase 4 goals

Phase 4 must result in the following outcomes:

- authenticated users can establish realtime messaging sessions safely
- authorized clients can subscribe only to conversations they are allowed to see
- conversation events are delivered quickly after successful persistence
- reconnecting clients can replay missed events from a known cursor
- presence, typing, and read-state changes propagate coherently in realtime
- realtime delivery preserves org isolation and governed access rules
- downstream notification/indexing workers can consume durable messaging events later without re-architecting the transport layer
- the messaging workspace has credible degraded-state behavior when realtime transport is unavailable
- diagnostics and supportability are sufficient to investigate session, fanout, replay, and delivery problems in production

---

## 5. Non-goals

Phase 4 does not include:

- full Phase 5 product richness across all chat workflows
- full notification product UX such as digests, inbox policies, or alert preferences
- full search UI or full search-product execution
- advanced file/media UX expansion
- portal/external conversation support
- voice/video calling
- universal E2EE room architecture
- broad workflow automation on top of messaging events
- replacing authoritative HTTP read APIs with transport-only state

Phase 4 may create seams for later notifications and indexing, but it must not drift into full Phase 9 search/notification product scope.

---

## 6. Product and engineering principles for Phase 4

### 6.1 Database-first, transport-second

Messages, threads, read state, and governance mutations remain authoritative only after durable persistence. Realtime events are published **after** successful commit. The transport layer must never become the source of truth.

### 6.2 Phase 3 policy remains authoritative

Realtime delivery must reuse the Phase 3 access model. No subscription, replay, or presence surface may leak content or existence outside allowed org and conversation boundaries.

### 6.3 WebSocket is the primary transport

Phase 4 must use a first-class authenticated WebSocket transport as the primary realtime path. HTTP remains the fallback path for hydration and degraded recovery, not the normal live-update mechanism.

### 6.4 Replay is required, not optional

Reconnect behavior must be durable and explicit. Clients must be able to resume from a cursor and receive missed events without forcing broad full-refresh behavior on every disconnect.

### 6.5 Delivery must be idempotent

Clients and downstream workers must tolerate duplicate event delivery safely. Event envelopes, cursors, and consumer behavior must be designed accordingly.

### 6.6 Presence and typing are advisory, not authoritative business state

Presence and typing are user experience signals. They must be scoped, expiring, and cheap to recover from if a transport session dies unexpectedly.

### 6.7 Notifications and indexing consume delivery seams, not direct mutations

Later consumers such as notification workers and search indexing must subscribe to durable messaging delivery events, not re-implement mutation logic from scattered service hooks.

### 6.8 Degraded mode must be explicit

When realtime is unavailable, the product should degrade predictably:

- indicate connection state clearly
- keep authoritative reads available
- avoid silent stale UI
- recover automatically when possible

---

## 7. Recommended Sprint 4.1–4.5 breakdown

## Sprint 4.1 — Realtime session auth, transport gateway, and protocol foundation

### Goal

Establish the authenticated realtime transport foundation and core session protocol for Internal Messaging.

### Scope

- add a dedicated messaging realtime session establishment flow
- define the realtime session token contract
- define the server-side connection lifecycle
- define the client/server protocol envelope
- define authorized conversation subscription and unsubscription operations
- enforce org-boundary and membership-aware subscription gating
- define heartbeat/keepalive behavior
- define clean disconnect semantics
- define transport connection state surfaces for the client

### Required implementation decisions

- primary transport is authenticated WebSocket
- session auth is bootstrapped from existing Slipwise org auth, then exchanged for a short-lived realtime session token
- realtime session token must carry:
  - user id
  - org id
  - effective role
  - proxy/represented context if applicable
  - issued-at and expiry
  - a session id or nonce for traceability
- raw long-lived application auth should not be used directly as the long-running socket credential
- connection setup must fail closed

### Deliverables

- realtime session bootstrap endpoint
- WebSocket gateway entrypoint
- connection/session registry abstraction
- protocol envelope for client commands and server events
- subscription authorization guard
- connection-state telemetry hooks

### Acceptance criteria

- unauthenticated users cannot establish a realtime session
- users cannot subscribe outside their org
- users cannot subscribe to conversations they are not allowed to access
- removed members cannot retain live subscriptions
- connection heartbeats and idle expiry are implemented
- connection state is observable enough for support/debugging

### Out of scope

- full conversation event publishing
- replay delivery
- notification worker consumption
- broad client UX polish beyond connection state and basic live-session readiness

---

## Sprint 4.2 — Conversation fanout, presence propagation, and typing propagation

### Goal

Deliver live conversation subscription behavior and advisory realtime collaboration signals.

### Scope

- publish conversation-scoped realtime events for:
  - new top-level messages
  - thread replies
  - thread resolution
  - message edits/deletes where current product behavior supports them
  - governance state changes that affect current viewers
- propagate presence updates
- propagate typing updates
- define presence visibility rules
- define typing visibility rules
- enforce conversation-scoped fanout rules
- ensure presence/typing expiry and cleanup are reliable

### Required implementation decisions

- presence visibility remains org-scoped, but active-conversation presence detail must not leak unauthorized conversation membership context
- typing visibility is conversation-scoped only
- typing indicators are TTL-based and must auto-expire
- presence updates must not flood the system on every trivial client heartbeat; they should be coalesced or rate-limited appropriately
- fanout must only occur after relevant persistence/update success

### Deliverables

- conversation event publisher abstraction
- presence realtime publication path
- typing realtime publication path
- subscription fanout routing by conversation id
- expiry cleanup rules for stale typing/presence sessions
- tests for visibility-safe advisory signal delivery

### Acceptance criteria

- active participants in a conversation receive live message/thread updates
- unauthorized users never receive those events
- typing indicators appear only in allowed conversation contexts
- presence and typing expire correctly when sessions disappear
- advisory signals do not re-open Phase 3 visibility questions

### Out of scope

- replay/reconnect recovery
- read-state reconciliation
- full notification side effects

---

## Sprint 4.3 — Durable event log, replay, reconnect, and read-state synchronization

### Goal

Make realtime delivery reliable enough for real usage by introducing cursor-based replay and reconnection semantics.

### Scope

- define a durable messaging event log or outbox-backed replay source
- assign monotonic per-event cursors
- support client reconnect with `lastSeenCursor`
- replay missed conversation events for authorized subscriptions
- synchronize read-state changes in realtime
- define duplicate delivery handling rules
- define ordering guarantees
- define what happens when a replay cursor is too old, invalid, or outside retention

### Required implementation decisions

- events must have a durable id and cursor
- replay is scoped by org and authorized conversation subscriptions
- clients must tolerate duplicate events by event id
- ordering guarantees are per conversation stream, not globally across the whole org
- invalid or expired replay cursors must fail safely and force a controlled refetch/re-hydration path
- read-state events must not expose hidden content; they carry state transitions, not unauthorized content snapshots

### Deliverables

- durable event record / outbox design for realtime replay
- replay-capable subscription flow
- reconnect state machine
- read-state live sync path
- duplicate-delivery-safe event contract
- degraded recovery path when replay cannot satisfy continuity

### Acceptance criteria

- a reconnecting client can resume from a valid cursor without losing authorized events
- duplicate delivery does not corrupt client state
- removed members do not replay content after access is revoked
- read-state updates synchronize across active clients coherently
- stale or invalid cursors produce safe recovery behavior

### Out of scope

- full notification preferences product behavior
- full search indexing product behavior
- large-scale performance hardening beyond correctness-focused replay support

---

## Sprint 4.4 — Durable side-effect delivery seams, degraded mode UX, and operational safety

### Goal

Turn realtime delivery into a production-ready subsystem by wiring durable downstream event seams and explicit degraded-state behavior.

### Scope

- add durable downstream consumption seams for:
  - notifications
  - search indexing
  - analytics/telemetry hooks where appropriate
- define worker handoff behavior from durable messaging events
- ensure downstream side effects are idempotent and retry-safe
- define degraded-mode client behavior when:
  - socket connection fails
  - replay fails
  - fanout is delayed
  - presence/typing is temporarily unavailable
- define abuse controls and backpressure strategy for the transport layer
- define subscription limits and safety rails

### Required implementation decisions

- Phase 4 includes event-delivery seams for notifications and indexing, but not full user-facing product completion for either
- downstream workers consume durable events rather than service-layer direct callbacks
- client degraded mode must surface connection state explicitly
- message composition and authoritative fetches continue to work even if live fanout is impaired
- transport rate limits and abuse controls must be real, not placeholder logic

### Deliverables

- durable worker-consumable event seam
- idempotent downstream event contract
- degraded connection state model
- client fallback behavior for stale/live mismatch
- transport abuse/rate-limit controls
- operational limits for sessions/subscriptions/messages-per-window where appropriate

### Acceptance criteria

- notification/indexing consumers can be added later without redesigning the transport architecture
- transport degradation does not silently mislead users into believing the UI is live when it is stale
- rate limits and safety controls exist for the realtime surface
- downstream side-effect consumption can retry safely

### Out of scope

- full search UX
- full digest/alert UX
- organization-level notification preference suite

---

## Sprint 4.5 — Reliability hardening, diagnostics, performance validation, and phase close-out

### Goal

Close Phase 4 by hardening realtime behavior for production usage and proving the subsystem is safe enough for Phase 5.

### Scope

- validate multi-client delivery behavior
- validate reconnect behavior under realistic interruption scenarios
- validate removed-member and revoked-access behavior on active sockets
- validate session expiry and token refresh behavior
- validate fanout behavior under concurrent message activity
- add diagnostics for:
  - connection establishment
  - subscription failures
  - replay failures
  - dropped sessions
  - delayed fanout
  - worker backlog where relevant
- add targeted performance and load validation for conversation-scale fanout
- finalize degraded-state behavior and phase-close verification

### Deliverables

- coherent realtime reliability test suite
- diagnostics and supportability contract
- performance baselines for conversation fanout and reconnect behavior
- documented operational assumptions for production rollout
- phase-close verification report criteria

### Acceptance criteria

- realtime delivery is reliable enough for normal multi-user messaging usage
- reconnect/replay works under expected failure scenarios
- revoked access shuts down future delivery cleanly
- diagnostics are sufficient to investigate live delivery failures
- Phase 5 can begin without reopening transport, replay, or subscription-auth fundamentals

### Out of scope

- enterprise launch hardening across the entire product
- portal/external transport design
- voice/video or shared-channel expansion

---

## 8. Phase 4 architecture decisions and internal contracts

## 8.1 Transport model

Phase 4 must implement:

- a dedicated messaging WebSocket transport
- authenticated session establishment through the existing Slipwise org auth model
- a server-side session registry
- conversation-scoped subscription management
- heartbeat and expiry enforcement
- graceful disconnect and reconnect behavior

HTTP remains authoritative for:

- initial hydration
- fallback refetch
- recovery from invalid replay state
- non-realtime-safe mutation surfaces that still belong to ordinary API contracts

## 8.2 Realtime session bootstrap contract

Phase 4 should introduce a realtime session bootstrap endpoint with behavior equivalent to:

- validates current org auth context
- mints a short-lived realtime session token
- returns:
  - `sessionToken`
  - `expiresAt`
  - `wsUrl`
  - `sessionId`
  - `serverTime`
  - optional negotiated capabilities

The token must be:

- short-lived
- org-scoped
- user-bound
- proxy-aware
- revocable by expiry and authorization re-checks

## 8.3 WebSocket command model

The client command envelope should be stable and explicit.

Minimum command families:

- `subscribe_conversation`
- `unsubscribe_conversation`
- `heartbeat`
- `ack_events`
- `set_presence`
- `start_typing`
- `stop_typing`
- `resume_session`

Each command must include enough metadata for:

- session traceability
- org scoping
- validation
- idempotent handling where relevant

## 8.4 Server event envelope

Server-delivered realtime events should use a stable envelope with at least:

- `eventId`
- `cursor`
- `orgId`
- `conversationId`
- `eventType`
- `occurredAt`
- `actorId` when relevant
- `payload`
- optional `correlationId` / `requestId` for tracing

Event payloads must be:

- sufficient for authorized live UI updates
- safe for the subscriber’s access level
- free of cross-org or unrelated conversation leakage

## 8.5 Minimum event families

Phase 4 should define and support at least:

- `conversation.message.created`
- `conversation.message.edited`
- `conversation.message.deleted`
- `conversation.thread.created`
- `conversation.thread.replied`
- `conversation.thread.resolved`
- `conversation.read_state.updated`
- `conversation.presence.updated`
- `conversation.typing.updated`
- `conversation.governance.updated`
- `conversation.membership.updated` where live subscription consequences matter

## 8.6 Replay model

Replay must be cursor-based.

Rules:

- clients reconnect with the last confirmed cursor
- replay is conversation-aware and authorization-aware
- replay only returns events the client is still allowed to receive
- revoked membership cuts off future replay for that conversation
- invalid cursor behavior must not leak whether hidden conversations had events

## 8.7 Outbox / durable event model

Phase 4 must introduce a durable event seam for:

- realtime replay
- notification workers later
- indexing workers later
- diagnostics later

Recommended decision:

- write messaging delivery events transactionally alongside authoritative mutations where correctness matters
- let transport fanout and downstream consumers read from a durable event source rather than ad hoc in-memory callbacks

## 8.8 Presence and typing rules

Presence:

- org-scoped session state
- may include coarse status such as online / away / offline
- active conversation association must be access-safe
- expires automatically

Typing:

- conversation-scoped only
- TTL-based
- not persisted beyond necessary ephemeral lifetime
- must disappear on expiry, disconnect, or explicit stop

## 8.9 Client state rules

Clients must maintain:

- connection state
- replay cursor state
- subscription state
- stale/live mismatch handling
- degraded mode behavior when live delivery is unavailable

Clients must not assume:

- every event arrives exactly once
- presence/typing are authoritative forever
- transport success without replay verification after reconnect

---

## 9. Security, reliability, and failure model

Phase 4 must explicitly handle the following:

### 9.1 Security requirements

- org isolation must remain absolute
- subscription authorization must be enforced on connect and on subscribe
- revoked or removed users must not continue receiving unauthorized live content
- admin/support exceptions from Phase 3 must remain narrow and policy-bound
- rate limiting and abuse controls must apply to session establishment and noisy command classes
- transport logs must not leak sensitive message content unnecessarily
- replay cursors must not become a side channel for hidden conversation activity

### 9.2 Reliability requirements

- delivery only after commit
- idempotent event handling
- heartbeat failure detection
- reconnect with replay
- explicit stale-session cleanup
- graceful degradation when replay source is unavailable
- safe worker retry behavior for downstream event consumers

### 9.3 Failure scenarios that Phase 4 must define

- auth expires during active session
- user removed from conversation while subscribed
- user removed from org while connected
- duplicate event publish attempt
- socket disconnect during active message burst
- replay cursor references events outside retention window
- downstream worker lag or transient failure
- presence/typing sessions orphaned by client crash
- temporary transport outage with successful HTTP fallback still available

---

## 10. Branch and sprint workflow

Recommended Phase 4 branch:

- `feature/internal-messaging-phase-4-realtime-transport-delivery`

Recommended Sprint 4.x branches:

1. `feature/internal-messaging-phase-4-sprint-1-transport-auth-session-protocol`
2. `feature/internal-messaging-phase-4-sprint-2-conversation-fanout-presence-typing`
3. `feature/internal-messaging-phase-4-sprint-3-delivery-replay-read-sync`
4. `feature/internal-messaging-phase-4-sprint-4-outbox-degraded-mode-operational-safety`
5. `feature/internal-messaging-phase-4-sprint-5-reliability-hardening-phase-closeout`

Workflow:

1. create the Phase 4 branch from `feature/internal-messaging-platform`
2. branch each Sprint 4.x branch from the Phase 4 branch
3. merge each sprint PR back into the Phase 4 branch
4. after all Phase 4 sprint PRs are complete and approved, merge the Phase 4 branch into `feature/internal-messaging-platform`

---

## 11. Phase 4 acceptance criteria

Phase 4 is complete only when:

- authenticated realtime messaging sessions work reliably
- authorized conversation subscriptions are enforced correctly
- live event delivery occurs after durable persistence
- reconnect and replay work without reopening visibility leaks
- presence, typing, and read-state propagation behave coherently
- durable downstream delivery seams exist for future notifications/indexing
- degraded state behavior is explicit and safe
- diagnostics and supportability exist for session and delivery failures
- Phase 5 can begin without re-architecting transport, replay, or fanout fundamentals

---

## 12. Test strategy for Phase 4

Phase 4 must include targeted tests for:

- realtime session bootstrap auth
- org-boundary connection denial
- conversation subscription denial for unauthorized users
- removed-member live delivery cutoff
- post-commit-only event publication
- presence propagation and expiry
- typing propagation and expiry
- replay from last valid cursor
- duplicate event tolerance
- invalid cursor recovery
- read-state live sync behavior
- downstream event consumer idempotency
- rate-limit and abuse protection on transport/session endpoints
- degraded-mode behavior when transport is unavailable
- reconnect and recovery under intermittent connection failure

Recommended test mix:

- pure unit tests for protocol helpers, authorization gates, and event envelope validation
- service/integration tests for event creation and replay behavior
- route/transport tests for session establishment and command validation
- focused multi-client tests for subscribe, publish, reconnect, and revoke-access behavior
- targeted load/performance validation for conversation fanout and reconnect bursts

---

## 13. Risks and warnings for Phase 4

Key risks:

- implementing transport before locking event semantics
- bypassing Phase 3 policy in subscription or replay flows
- over-relying on in-memory fanout without durable replay support
- letting presence/typing become a noisy or expensive hot path
- mixing future search/notification product scope into the transport foundation
- shipping degraded-state ambiguity where users cannot tell whether data is live or stale
- under-building diagnostics and then being unable to support production delivery issues

---

## 14. Phase 4 completion gate

Phase 4 should be considered complete only when all of the following are true:

- realtime transport is authenticated and policy-correct
- replay and reconnect are reliable enough for normal multi-user usage
- no known org-boundary or membership leakage exists in live delivery
- downstream delivery seams for notifications/indexing are durable and idempotent
- presence/typing/read sync are coherent enough to feel credible in the workspace
- the product degrades predictably when transport health is impaired
- the engineering team can move into Phase 5 without reopening the core questions of session auth, fanout, replay, or live delivery correctness
