# Internal Messaging Phase 8 — Meetings, Calendar Integrations, and Team Scheduling

This document defines a practical Sprint 8.1–8.5 delivery breakdown and a detailed Phase 8 PRD for Internal Messaging, grounded in the canonical Internal Messaging PRD and the now-merged Phase 7 baseline.

## 1. Purpose

Phase 8 exists to turn meetings and calendar coordination inside Internal Messaging from a static or placeholder experience into a real production workflow for:

- scheduling meetings inside conversations
- connecting Google Calendar and Outlook/Microsoft calendars
- syncing meeting lifecycle to external providers
- showing task due dates and reminder-driven work inside a shared calendar surface
- coordinating teams around meetings, assignments, due dates, and follow-up work

Phase 7 established:

- native task and reminder workflows inside messaging
- permission-safe conversation task surfaces
- audit-backed work coordination behavior
- reliability and degraded-state handling for task surfaces

That means Internal Messaging is now credible as a work-coordination surface. But meeting scheduling and shared calendar coordination are still incomplete. The current repo already has early meeting and calendar models, placeholder meeting UI, and provider-safe enums, yet it does not provide a live, production-real scheduling system.

Phase 8 must now deliver the product layer that makes meetings and calendar coordination first-class inside messaging:

- real conversation-bound meeting scheduling
- real Google Calendar connection flows
- real Outlook/Microsoft calendar connection flows
- real Microsoft Teams / Google Meet link handling through provider event creation
- a real shared in-app calendar for meetings and task due dates
- real organizer, attendee, assignee, and team coordination workflows
- real RSVP behavior inside messaging
- real task due-date visibility and task-calendar synchronization
- real reminders and lifecycle transitions for meetings and calendar-linked task work
- a global upcoming meeting alert in the authenticated product shell so imminent meetings are visible from dashboard home and other major workspaces
- real two-way reconciliation between Slipwise state and provider calendar state
- supportable degraded and reconnect-safe calendar behavior

This phase is intentionally broader than the canonical shorthand of “scheduling and calendar connection flows.” It must deliver a production-grade coordination layer that feels native to messaging work, while remaining provider-safe and bounded to messaging-driven workflows rather than becoming a generic enterprise calendar suite.

The result should be a production-ready scheduling layer inside Internal Messaging that teams can trust for day-to-day planning, task coordination, and meeting follow-up work.

---

## 2. Canonical source alignment

This Phase 8 PRD extends the canonical document:

- `docs/PRD/INTERNAL_MESSAGING_PLATFORM_PRD.md`

Relevant canonical sections include:

- `## 6. Locked Product Decisions`
- `## 7. Users, Roles, and Operating Model`
- `## 8. Product Principles`
- `## 9. Messaging Information Architecture`
- `## 10. Messaging Workspace Design`
- `## 16. Tasks and Meetings`
- `## 22. Permissions and Governance`
- `## 23. Domain Model and Internal Interfaces`
- `## 24. Realtime, Delivery, and Reliability Model`
- `## 25. Security, Audit, and Compliance`
- `## 26. Metrics, Diagnostics, and Supportability`
- `## 27. Delivery Workflow: Branches, Phases, and Sprints`
- `## 28. Detailed Phase Plan`
- `## 29. Acceptance Criteria`
- `## 30. Test Plan`

Canonical Phase 8 definition:

- **Phase 8 — Meetings and Google Calendar**
- **Goal:** scheduling and calendar connection flows

This document preserves that intent but operationalizes it into a wider, execution-ready phase covering:

- Google Calendar
- Outlook/Microsoft calendar
- Microsoft Teams / Google Meet event-link workflows
- task and meeting coordination in one calendar surface

This document does not replace the master PRD. It operationalizes and expands Phase 8 into a delivery-ready spec.

---

## 3. Current implementation baseline at start of Phase 8

Phase 8 begins on top of the merged Internal Messaging Phase 7 baseline now present on:

- `feature/internal-messaging-platform`

### 3.1 What already exists

The current baseline already includes:

- Prisma models for:
  - `ConversationMeeting`
  - `CalendarConnection`
  - `MessagingAuditEvent.meetingId`
- provider-safe enums including:
  - `CalendarProvider.GOOGLE`
  - `CalendarProvider.OUTLOOK`
- domain record types for meetings and calendar connections
- helper predicates such as:
  - `meetingIsUpcoming`
  - `meetingIsEnded`
  - `calendarConnectionIsActive`
  - `calendarConnectionRequiresReconnect`
- service contracts for:
  - `ScheduleMeetingInput`
  - `UpdateMeetingInput`
  - `CancelMeetingInput`
  - `ConnectCalendarInput`
  - `DisconnectCalendarInput`
- audit action labels for:
  - `MEETING_SCHEDULED`
  - `MEETING_UPDATED`
  - `MEETING_CANCELLED`
- meeting and calendar sections in the messaging workspace shell
- placeholder meeting panel and schedule modal UI
- task workflows from Phase 7 that already define due dates, reminders, assignees, and status transitions
- task listing and reminder infrastructure that can be extended into calendar surfaces

### 3.2 What does not yet exist in product-real form

The current baseline does **not** yet provide a real scheduling and calendar workflow.

Key product gaps remain:

- meeting panel and scheduler are still primarily static/mock driven
- there is no live conversation meeting hydration path
- there is no real organizer schedule/update/cancel workflow
- there is no real Google or Outlook OAuth connection path
- there is no real provider event creation or reconciliation path
- attendee RSVP behavior is not live
- task due dates do not appear in a shared messaging calendar
- task changes do not synchronize to external calendars
- meeting reminders and state transitions are not product-real
- degraded provider/reconnect behavior is not yet surfaced as a trustworthy product model
- support diagnostics and repair flows for calendar failures do not yet exist

### 3.3 Key Phase 8 starting observations

The current baseline is well-positioned for Phase 8:

- schema and type foundations already anticipate meetings and calendar connections
- the provider enum already supports both Google and Outlook
- the messaging workspace already reserves visible space for meeting workflows
- Phase 7 established a strong pattern for work coordination, auditability, and degraded-state handling
- task due dates, reminders, assignees, and open-family state already exist and can drive calendar coordination

That said, Phase 8 must not mistake placeholders for completion. Most of the current meeting experience is still static shell behavior and task/calendar coordination does not yet exist as a product workflow.

### 3.4 What Phase 8 must not redo

Phase 8 must not:

- redesign the core conversation model without a clear defect-driven reason
- reopen earlier governance rules as speculative cleanup
- introduce a native video platform
- become a full standalone org calendar product unrelated to messaging work
- absorb search, notification-center, or portal work that belongs to later phases

---

## 4. Phase 8 goals

Phase 8 must result in the following outcomes:

- meetings behave as first-class conversation-bound workflows inside messaging
- authorized users can schedule, update, cancel, and review meetings from conversation context
- Google Calendar can be connected securely at the org level with reconnect-safe lifecycle handling
- Outlook/Microsoft calendar can be connected securely at the org level with reconnect-safe lifecycle handling
- provider-created events can carry Google Meet or Microsoft Teams links where supported by the connected provider
- Slipwise and external provider calendars stay synchronized through a provider-safe, two-way authoritative model
- attendees can manage RSVP state inside messaging
- organizers can see attendee response and delivery/sync state
- task due dates and task reminder-driven work appear in a shared calendar view
- eligible task due-date changes synchronize to connected provider calendars
- teams can use one in-app calendar surface to understand meetings and assigned work together
- imminent meetings surface at the top area of the authenticated product shell with a countdown and join action
- degraded provider states are visible, recoverable, and do not silently corrupt product trust
- meeting and task-calendar activity remains auditable and permission-safe
- later phases can extend search, notification, compliance, and external workflows without re-architecting the scheduling model

---

## 5. Non-goals

Phase 8 does not include:

- a native Slipwise video or voice meeting room
- a full standalone enterprise calendar suite outside messaging-driven workflows
- advanced room/resource scheduling
- external or portal guest scheduling
- advanced workflow automation on calendar events beyond direct lifecycle requirements
- enterprise retention/export/legal hold expansion from later phases
- search, digests, or notification-center completion from Phase 9

This phase may preserve extension seams for later capabilities, but it must not absorb those later product areas into current execution scope.

---

## 6. Locked product decisions for Phase 8

### 6.1 Meeting model

- meetings are always tied to a conversation
- meetings are a messaging-native workflow, not an external bolt-on
- the conversation organizer flow is the primary entry point

### 6.2 Provider direction

- both Google Calendar and Outlook/Microsoft calendar are in Phase 8 scope
- the internal model must remain provider-safe
- provider IDs and provider lifecycle must not leak provider-specific assumptions into unrelated product layers

### 6.3 Meeting modality

- meetings are represented through provider event links such as Google Meet or Microsoft Teams links when available
- Phase 8 does **not** include a native Slipwise meeting room

### 6.4 Attendance model

- RSVP is part of Phase 8
- attendees can respond from messaging
- organizer views must expose attendee response state

### 6.5 Task-calendar model

- task due dates are first-class calendar entities in Phase 8
- eligible task reminders and due dates appear in the in-app calendar
- external provider sync applies to task-driven calendar entries as well as meetings
- task completion, cancellation, reassignment, and due-date changes must reconcile into calendar state intentionally

### 6.6 Sync posture

- Phase 8 uses two-way authoritative sync
- scheduling, update, and cancel actions must propagate to Google and Outlook providers
- provider-side changes must reconcile back into Slipwise under explicit rules
- degraded sync is a first-class product state, not a hidden operational detail

### 6.7 Security model

- connection management is server-owned and org-scoped
- token material must remain opaque to UI-visible paths
- no raw provider secrets may appear in logs, audits, or diagnostics payloads

---

## 7. Product and engineering principles for Phase 8

### 7.1 Scheduling state must be server-authoritative

Scheduling, RSVP, attendee state, task-calendar linkage, provider linkage, and status transitions must resolve through server-owned reads and writes. Modal-local state may improve UX, but the product must reconcile to authoritative server state.

### 7.2 Meetings and tasks must feel native to conversations

Calendar coordination should feel like a natural extension of conversation work:

- who is invited should derive naturally from conversation context
- which tasks matter should derive naturally from conversation-linked assigned work
- join information should live where the discussion lives
- reminders and due dates should feel tied to the conversation, not to a detached calendar screen

### 7.3 Multi-provider architecture is required from the start

Even though provider behaviors differ, the architecture must not hardcode Google-specific or Microsoft-specific assumptions into the meeting domain model, service contracts, or governance model.

### 7.4 Sync reliability is part of product trust

Users must not be left unsure whether:

- a meeting was actually scheduled
- a cancellation actually propagated
- a join link is still valid
- attendee state is current
- a task due date is still represented accurately in calendars

Sync reliability, stale-state handling, and degraded status are product correctness, not infrastructure-only concerns.

### 7.5 Governance remains part of correctness

Meeting visibility, join-link access, attendee disclosure, task-calendar visibility, calendar connection controls, and diagnostics access must respect org, role, conversation membership, and assignee policy. Security shortcuts are correctness bugs.

### 7.6 The in-app calendar is a coordination surface

The internal calendar is not just a meeting browser. It must help teams coordinate:

- meetings
- deadlines
- reminders
- rescheduling
- ownership pressure

The product must therefore expose full calendar meaningfully, not merely render decorative markers.

### 7.7 Urgent meeting state must surface at the product level

Imminent meetings must not be discoverable only by opening the meetings panel. The product must surface urgent upcoming meetings in the authenticated app shell, including the home dashboard and other major in-app workspaces where the user lands first.

This global alert behavior must:

- activate when a meeting is within a defined urgency window
- become more prominent as the meeting gets closer
- expose a clear `Join Meeting` action
- remain permission-safe and non-leaky
- disappear or downgrade when the meeting ends, is cancelled, loses a valid join link, or the viewer loses access

### 7.8 Tokens and provider payloads are sensitive by default

OAuth tokens, event payloads, and sync metadata must be handled under strict least-exposure rules:

- opaque token references only in application-facing persistence
- minimal diagnostics payloads
- no raw provider data blobs surfaced to normal product users

### 7.9 Degraded and revoked states must be explicit

The UI must not silently blur states such as:

- not connected
- reconnect required
- sync delayed
- event missing remotely
- organizer lost access
- attendee removed from conversation
- assignee changed after a task was already published to calendar
- conversation archived or locked after scheduling

These are product states, not afterthought edge cases.

---

## 8. Recommended Sprint 8.1–8.5 breakdown

## Sprint 8.1 — Live meeting domain and unified calendar foundation

### Goal

Replace static meeting UI with real conversation-bound meeting scheduling and establish the first live shared calendar surface for meetings and task due dates.

### Scope

- live meeting list hydration for a conversation
- real schedule meeting mutation path
- real edit and cancel meeting mutation paths
- organizer and participant visibility rules
- real upcoming, past, and calendar meeting panel states
- initial shared in-app calendar model for:
  - meetings
  - task due-date entries
  - task reminder markers where needed
- conversation-bound meeting detail model
- audit writes for schedule, update, and cancel actions
- real empty, restricted, archived, locked, removed-member, and degraded states

### Required implementation decisions

- meetings must always belong to one conversation
- initial invitee set is derived from active conversation participants
- organizer must be an active participant at scheduling time
- scheduling/editing/cancelling must respect archived and locked conversation policy
- task due-date entries in the shared calendar must remain permission-safe and org-scoped
- no unauthorized meeting or task-calendar detail may be briefly shown during transitions

### Deliverables

- meeting service layer
- meeting read models for conversation meeting views
- unified calendar entry abstraction for meetings and tasks
- route and/or server action surfaces for schedule, update, and cancel
- real meeting panel hydration
- conversation-native schedule modal backed by live data

### Acceptance criteria

- authorized users can view real meetings in a conversation
- organizers can schedule, update, and cancel real meetings
- meeting records show correctly in upcoming, past, and calendar views
- task due dates appear in the in-app calendar where the viewer is authorized
- removed or unauthorized users do not infer hidden meeting or task detail
- audit events are written for schedule, update, and cancel actions

### Out of scope

- provider OAuth and external sync
- RSVP workflows
- reminder dispatch

---

## Sprint 8.2 — Google and Outlook connection, auth, and provider-safe integration foundation

### Goal

Make Google Calendar and Outlook/Microsoft calendar connections real, secure, org-scoped, and reconnect-safe.

### Scope

- Google OAuth initiation and callback flow
- Outlook/Microsoft OAuth initiation and callback flow
- secure calendar connection persistence
- org-scoped connect, disconnect, and reconnect actions
- connection states:
  - active
  - reconnect required
  - disconnected
  - degraded
- one active connection per provider/account boundary per org at the service layer
- live connection state in meeting and shared calendar surfaces
- admin/owner-only connection management

### Required implementation decisions

- calendar connections are org assets, not unmanaged local user settings
- token material must be stored behind an opaque reference pattern
- connection failure and token expiry must become explicit reconnect-required state
- non-admin users must not manage org calendar connections
- connection state must be readable safely without exposing sensitive provider internals
- provider adapters must support Google and Microsoft-specific auth semantics without leaking them across the shared contract

### Deliverables

- Google connection auth flow
- Outlook/Microsoft connection auth flow
- encrypted token reference integration
- calendar connection service layer
- provider-safe connection abstraction
- live connection banners and reconnect UX

### Acceptance criteria

- authorized admins/owners can connect Google Calendar
- authorized admins/owners can connect Outlook/Microsoft calendar
- authorized admins/owners can disconnect and reconnect both providers
- expired tokens shift into reconnect-required rather than silent failure
- non-admin users cannot manage org connections
- no token or raw secret leakage appears in DB-facing or UI-facing payloads

### Out of scope

- meeting/task sync
- attendee RSVP sync
- reminders and diagnostics

---

## Sprint 8.3 — Provider sync for meetings and task calendar entries

### Goal

Synchronize meetings and eligible task due-date entries with Google and Outlook/Microsoft calendars.

### Scope

- create provider event on meeting schedule
- update provider event on meeting edit
- cancel provider event on meeting cancellation
- create/update/remove provider-side task calendar entries for:
  - task due dates
  - task reminder-driven work items where the product model requires them
- persist provider event identifiers safely
- inbound reconciliation for provider-side changes where supported:
  - title/time updates
  - cancellation
  - attendee response changes
  - task-linked event drift where feasible and safe
- idempotent sync boundaries and conflict-safe reconciliation
- provider-aware handling when:
  - task due date changes
  - task closes
  - task cancels
  - task reassignment changes ownership context

### Required implementation decisions

- Slipwise meeting and task state remain the product-facing source of truth
- provider changes reconcile into Slipwise intentionally, not blindly
- duplicate provider event creation must be prevented by idempotent sync logic
- inbound provider changes must not create unauthorized visibility into hidden conversations or tasks
- task calendar publication rules must be explicit about which task states publish and when they are removed or updated

### Deliverables

- provider sync service
- meeting and task calendar sync rules
- reconciliation rules
- provider event lifecycle model
- task-to-calendar publication/update/remove behavior

### Acceptance criteria

- scheduling creates corresponding provider calendar events
- editing and cancelling propagate correctly to Google and Outlook/Microsoft
- task due dates synchronize to connected calendars under the defined publication rules
- task due-date changes, completion, cancellation, and reassignment reconcile safely
- provider-side changes reconcile safely back into Slipwise
- duplicate sync side effects are prevented

### Out of scope

- reminder dispatch
- RSVP UX completion
- support diagnostics

---

## Sprint 8.4 — Full coordination workflows: RSVP, rescheduling, reminders, and team calendar behavior

### Goal

Make the shared calendar a real day-to-day coordination surface for meetings and assigned work.

### Scope

- messaging-native RSVP actions:
  - accept
  - tentative
  - decline
- organizer attendee response visibility
- assignee-facing task calendar behavior
- meeting and task reschedule flows where permitted
- meeting reminders and task calendar reminders
- global upcoming meeting alert in the app shell / dashboard top area
- urgency states for meetings within 1 hour and within 15 minutes
- live countdown / time remaining behavior for imminent meetings
- join-link presentation from synchronized provider event data:
  - Google Meet links
  - Microsoft Teams links
- full calendar interactions inside messaging:
  - create
  - edit
  - reschedule
  - inspect
  - navigate back to meeting/task context
- safe handling for:
  - membership changes after meeting creation
  - task ownership changes after calendar publication
  - archived/locked conversations
  - externally cancelled or missing provider events

### Required implementation decisions

- reminder dispatch must be idempotent and bounded
- RSVP and organizer state must remain coherent across provider updates
- task reschedule authority must respect task ownership and conversation permissions
- join-link visibility must respect conversation and attendee access rules
- global alert state must be driven by authoritative meeting state, not only client-local timers
- global alert visibility must work from dashboard home and other authenticated product entry surfaces, not only inside messaging
- degraded provider state must preserve truthful local meeting and task visibility
- the calendar must remain a real coordination tool, not a decorative overlay

### Deliverables

- RSVP service and UI
- organizer response views
- task calendar interaction model
- reminder service for meetings and task calendar entries
- global imminent-meeting alert model and UI contract
- join-link display and validation rules
- real shared calendar workflows inside messaging

### Acceptance criteria

- attendees can respond from messaging
- organizers can see current attendee status
- users receive truthful meeting and task-related reminders
- users can see imminent meetings from the top area of the product shell, including dashboard home
- meetings within 1 hour surface a prominent global alert, and meetings within 15 minutes show elevated urgency
- the global alert exposes a working `Join Meeting` action when a valid provider link exists
- Google Meet or Teams links appear only when valid and authorized
- task due dates and meetings can be inspected and coordinated from the same calendar surface
- archived, restricted, or removed users do not retain stale privileged meeting or task-calendar access

### Out of scope

- org-wide calendar product beyond messaging-driven workflows
- analytics-heavy reporting
- search and productivity work from Phase 9

---

## Sprint 8.5 — Reliability, diagnostics, provider parity closeout, and phase closeout hardening

### Goal

Close Phase 8 at production level with diagnostics, retry/reconciliation flows, provider parity hardening, and support-safe operations.

### Scope

- Google sync diagnostics
- Outlook/Microsoft sync diagnostics
- meeting sync failure diagnostics
- task calendar sync diagnostics
- support/admin-safe retry and reconciliation flows
- revoked-access and removed-member hardening
- race-condition and idempotency hardening for:
  - schedule
  - edit
  - cancel
  - RSVP
  - reconnect
  - task calendar publish/update/remove
  - replay/retry
- degraded-state UX hardening
- final parity verification between Google and Outlook/Microsoft behaviors
- reliability-focused regression suite
- phase closeout polish and merge readiness

### Required implementation decisions

- diagnostics must expose state and failure classes, not raw provider payloads
- retries must not create duplicate external events
- restricted and not-found behavior must remain non-leaky
- degraded state should preserve last known safe meeting/task state where appropriate
- repair/retry actions must remain permission-gated and auditable
- provider parity must be explicit at phase closeout, not assumed

### Deliverables

- meeting/calendar diagnostics read models
- safe retry and reconcile actions
- provider parity verification
- reliability and supportability tests
- final production hardening and documentation polish

### Acceptance criteria

- failed sync states are diagnosable and recoverable
- duplicate provider events are prevented
- revoked or removed users cannot infer protected meeting or task-calendar state
- degraded states are truthful and recoverable
- Google and Outlook/Microsoft provider behavior is verified to phase-closeout parity under the defined scope
- the Phase 8 branch is approval-ready for promotion into `feature/internal-messaging-platform`

### Out of scope

- Phase 9 search, digests, or notification-center work
- compliance or retention expansion from later phases

---

## 9. Planned domain and interface additions

Phase 8 will likely require explicit expansion in the meeting, calendar, and task coordination domain.

### 9.1 Calendar entry abstraction

The implementation should add or formalize a unified calendar entry abstraction that can represent:

- meeting entries
- task due-date entries
- task reminder entries where modeled separately

### 9.2 Meeting domain additions

The implementation should add or formalize:

- meeting attendee representation
- attendee RSVP status
- organizer-facing attendee delivery/sync state
- meeting reminder state
- provider sync state for individual meetings where needed

### 9.3 Task-calendar additions

The implementation should support:

- calendar publication state for eligible tasks
- provider sync metadata for task-derived calendar entries
- reassignment-safe ownership update rules
- due-date update and completion/cancellation reconciliation rules

### 9.4 Calendar connection additions

The implementation should support:

- provider reconnect-required state
- degraded/sync-error state
- safe last-sync metadata
- repair/reconnect actions

### 9.5 Read-model additions

Phase 8 should introduce read models for:

- conversation meeting summaries
- meeting detail
- organizer attendee response view
- shared calendar month/week/day view
- user coordination slices for meetings and assigned work
- calendar connection summary
- meeting/task calendar diagnostics for support-governed surfaces

### 9.6 Mutation surfaces

Phase 8 should provide explicit mutation paths for:

- scheduling a meeting
- updating a meeting
- cancelling a meeting
- updating RSVP
- connecting Google Calendar
- connecting Outlook/Microsoft calendar
- disconnecting and reconnecting provider calendars
- task calendar publish/update/remove where needed
- retrying or reconciling failed sync where supportability requires it

### 9.7 Audit additions

Meeting lifecycle, task-calendar sync, and support operations must remain auditable, including:

- meeting scheduled
- meeting updated
- meeting cancelled
- attendee RSVP changed
- meeting reminder dispatched where surfaced
- task calendar publish/update/remove actions where surfaced
- reconnect or repair actions where those are user-triggered

The final schema and interface names may evolve during implementation, but the PRD requires:

- provider-safe modeling
- org-safe queries
- opaque token references
- no raw secret exposure

---

## 10. Security, reliability, and failure model

### 10.1 Security requirements

Phase 8 must explicitly enforce:

- org isolation for all meeting, task-calendar, and provider reads/writes
- conversation membership checks for meeting visibility
- assignee and scope checks for task-calendar visibility
- organizer/role gating for schedule/update/cancel and connection actions
- non-leaky restricted/not-found behavior
- join-link access only for authorized users
- no raw token or provider secret leakage
- no raw provider payload dumping into user-visible logs or diagnostics

### 10.2 Reliability requirements

Phase 8 must explicitly support:

- idempotent schedule/update/cancel sync boundaries
- idempotent task calendar publish/update/remove boundaries
- replay-safe reconciliation after provider or network failure
- reconnect-required token lifecycle
- bounded retry behavior
- deterministic reminder dispatch
- explicit stale/degraded state when provider synchronization is delayed or broken

### 10.3 Failure scenarios that Phase 8 must define

The phase must explicitly model:

- organizer loses access after scheduling
- attendee removed from conversation after invitation
- assignee changes after a task has already been published to calendars
- conversation archived or locked after a meeting is scheduled
- provider token expires during update or reminder preparation
- remote provider event is deleted or cancelled externally
- duplicate schedule request arrives during degraded network conditions
- duplicate task calendar publication is attempted during retry
- inbound provider sync arrives after local cancellation or task closure
- reconnect succeeds after prolonged degraded state
- diagnostics/retry path is triggered by support/admin users

---

## 11. Branching and review workflow

### Root branch

- `feature/internal-messaging-platform`

### Phase 8 branch

- `feature/internal-messaging-phase-8-meetings-calendar-coordination`

### Sprint branches

Each sprint must branch from the Phase 8 branch and open a PR back into that Phase 8 branch.

Recommended sprint branches:

- `feature/internal-messaging-phase-8-sprint-1-live-meeting-domain-and-calendar-foundation`
- `feature/internal-messaging-phase-8-sprint-2-google-outlook-connection-foundation`
- `feature/internal-messaging-phase-8-sprint-3-provider-sync-and-task-calendar`
- `feature/internal-messaging-phase-8-sprint-4-rsvp-reminders-team-calendar-workflows`
- `feature/internal-messaging-phase-8-sprint-5-reliability-diagnostics-provider-parity`

### Review workflow

Workflow:

1. Phase 8 branch is created from `feature/internal-messaging-platform`
2. Sprint branch is created from the Phase 8 branch
3. Sprint branch is implemented
4. Sprint PR is opened into the Phase 8 branch
5. Sprint PR is reviewed and approved
6. Sprint branch merges into the Phase 8 branch
7. After all Sprint 8.x branches merge, Phase 8 merges into `feature/internal-messaging-platform`

### Control rules

- no sprint should silently absorb later-sprint scope unless this PRD explicitly calls it out
- no Client Hub, Mailbox, or unrelated workflow files should be touched by Internal Messaging work
- no mock-data-only fallback should remain in critical scheduling product paths once a live path exists
- comments and code quality must remain deliberate, human-reviewable, and production-grade

---

## 12. Phase 8 acceptance criteria

Phase 8 is complete only when:

- authorized users can schedule, update, cancel, and review real meetings inside messaging
- Google Calendar and Outlook/Microsoft calendar connections are secure, org-scoped, and reconnect-safe
- meetings and provider calendar state reconcile correctly under the defined sync model
- task due dates and eligible task reminders appear in the in-app calendar and synchronize externally where defined
- attendees can manage RSVP state from messaging
- organizers can understand attendee response and sync state
- teams can coordinate meetings and assigned work from one shared calendar surface
- users can see and join imminent meetings from the authenticated product shell without navigating into the meetings panel first
- reminders and lifecycle transitions are trustworthy
- degraded and revoked-access states are explicit and safe
- the phase can merge into `feature/internal-messaging-platform` without re-opening product-model decisions

---

## 13. Test plan

Phase 8 must include:

- service-layer tests for meeting, task-calendar, and provider behaviors
- route and server-action tests for new read/write surfaces
- UI integration tests for meeting panel, scheduler, RSVP, shared calendar, and degraded states
- UI integration tests for global imminent-meeting alert behavior in the authenticated app shell
- Google provider auth/sync tests
- Outlook/Microsoft provider auth/sync tests
- provider parity tests
- unified calendar rendering tests for meetings and tasks
- task due-date propagation tests
- reminder and lifecycle tests
- authorization and org-boundary tests
- diagnostics and supportability tests
- reconnect and degraded-mode tests

### Minimum scenario coverage

- authorized organizer can schedule a meeting from a conversation
- unauthorized or removed users cannot infer hidden meeting detail
- archived or locked conversations enforce correct meeting mutation restrictions
- Google Calendar connection can be created, disconnected, and reconnected safely
- Outlook/Microsoft connection can be created, disconnected, and reconnected safely
- token expiry moves either provider into reconnect-required state
- scheduling creates a provider event exactly once
- editing updates the provider event without duplication
- cancelling cancels the provider event and local meeting state
- attendee RSVP changes are persisted and surfaced correctly
- task due date appears in the in-app calendar
- task due date syncs to Google calendars where the org has Google connected
- task due date syncs to Outlook/Microsoft calendars where the org has Microsoft connected
- meeting within 1 hour shows a global top-area alert from dashboard home / app shell
- meeting within 15 minutes shows elevated urgency state with live countdown
- `Join Meeting` works from the global alert when the provider link is valid
- ended, cancelled, invalid-link, or revoked-access meetings remove or downgrade the global alert safely
- updating a task due date updates the provider event
- completing or cancelling a task resolves provider calendar state correctly
- task reassignment updates ownership-sensitive calendar visibility correctly
- inbound provider-side changes reconcile safely
- degraded provider sync preserves truthful user-visible state
- revoked access clears protected meeting/task calendar state safely

### Quality bar

Tests should prove:

- product correctness
- authorization safety
- synchronization integrity
- retry and idempotency safety
- UI/server contract consistency
- absence of secret leakage through normal or support flows

---

## 14. Risks and product warnings

Primary Phase 8 risks:

- under-modeling provider sync can create duplicate meetings or broken cancellations
- weak degraded-state design can make users lose trust in whether a meeting or deadline is actually represented correctly
- RSVP modeling can become incoherent if conversation membership and provider attendee state are not reconciled carefully
- task-calendar publication rules can become noisy or wrong if task state transitions are not modeled precisely
- token handling can weaken security if secret boundaries are not enforced strictly
- over-expanding Phase 8 into a general calendar platform can blur architecture and slow delivery

Mitigations:

- keep conversation-bound meeting semantics explicit
- keep task-calendar publication rules explicit and bounded
- keep provider sync idempotent and auditable
- treat reconnect-required and degraded sync as first-class product states
- keep the sprint split disciplined
- test provider failure, task state drift, and access-revocation paths as seriously as happy paths

---

## 15. Definition of done for the phase

Phase 8 is complete when:

- meetings inside messaging are real, not placeholder UI
- Google and Outlook/Microsoft calendar connection and sync flows work reliably
- organizer, attendee, and assignee workflows are trustworthy
- task due dates and meeting timelines can be coordinated from one calendar surface
- reminders and lifecycle transitions are production-real
- degraded, restricted, and reconnect-required states are visible and recoverable
- auditability and supportability remain intact
- the completed Phase 8 branch can be reviewed sprint by sprint and then promoted cleanly into `feature/internal-messaging-platform`

---

## 16. Final product interpretation

Phase 8 is the point where Internal Messaging stops being only chat plus tasks and becomes a real scheduling and coordination hub.

It should not become a generic enterprise calendar product.

It should make meetings and deadlines feel like a natural continuation of conversation:

- discussion happens in messaging
- scheduling happens in messaging
- task ownership and due dates are visible in messaging
- Google Calendar and Outlook/Microsoft keep the workflow connected to external calendar systems
- Google Meet or Microsoft Teams links are carried through provider events when available

That is the correct next step after Phase 7.
