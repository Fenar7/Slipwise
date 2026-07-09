# Slipwise Internal Messaging Phase 10 PRD

**Document Version:** 1.0  
**Date:** June 2026  
**Product:** Slipwise  
**Workflow:** Internal Messaging  
**Phase:** 10  
**Prepared by:** Product / Engineering Planning  
**Status:** Canonical Phase 10 execution PRD

---

## Table of Contents

1. Document Purpose  
2. Executive Summary  
3. Relationship to Prior Phases  
4. Phase 10 Product Goal  
5. Scope and Explicit Non-Goals  
6. Locked Product Decisions  
7. Users, Roles, and Operating Model  
8. Product Principles  
9. Portal Conversation Model  
10. Internal Workspace Experience  
11. Client Hub Experience  
12. Conversation Lifecycle and State Model  
13. Audience, Notes, and Message Visibility  
14. Attachments and Shared Context  
15. Notifications, Read State, and Productivity  
16. Permissions, Security, and Boundary Rules  
17. Audit, Supportability, and Diagnostics  
18. Reliability, Delivery, and Failure Model  
19. Domain Model and Internal Interfaces  
20. Routes, Surface Map, and Information Architecture  
21. States, Errors, and Edge Cases  
22. Delivery Workflow: Branches, Phases, and Sprints  
23. Detailed Sprint Plan  
24. Acceptance Criteria  
25. Test Plan  
26. Risks and Product Warnings  
27. Future Compatibility Requirements  
28. Final Phase Definition

---

## 1. Document Purpose

This PRD defines the full execution plan for **Internal Messaging Phase 10 — Portal Conversation Extension**.

This is not a vague roadmap note. It is intended to be execution-ready and decision-complete for product, frontend, backend, QA, and engineering leadership.

It defines:

- the exact product scope for external messaging in Phase 10
- the security and boundary model
- the conversation model and lifecycle
- the internal operator workspace behavior
- the Client Hub user experience
- the attachment, notification, and audit model
- the branch and sprint workflow
- the acceptance and testing bar required for production-grade delivery

This PRD must be stored in the root `docs/PRD/` tree so it is accessible from the main repo and not trapped inside historical worktrees.

---

## 2. Executive Summary

Slipwise Internal Messaging already exists through Phase 9 as a serious internal communication system:

- channels
- DMs
- groups
- threads
- files
- tasks
- meetings
- search
- notifications
- diagnostics and reliability hardening

Phase 10 extends that system into **authenticated portal-side conversations** for Client Hub clients.

This is not a generic guest-chat feature and not a public support widget.

Phase 10 introduces:

- external conversation participation for authenticated Client Hub clients
- strict internal/external visibility boundaries
- conversation flows tied to a customer identity and organization boundary
- safe conversation entrypoints from client-facing business context
- internal-only notes that never leak to the client
- portal-safe attachments and notifications
- supportable, auditable client communication operations inside the same messaging system

The architectural goal is very specific:

- reuse the existing messaging foundation
- reuse the existing Client Hub auth foundation
- do not create a second chat architecture
- do not weaken internal messaging security to support portal messaging
- ensure later compliance, retention, and export work can be layered on in Phase 11 without re-architecture

The product goal is equally specific:

- internal users should be able to communicate with clients inside Slipwise
- clients should be able to communicate from Client Hub without leaving the platform
- the experience should feel like a secure, deliberate product workflow, not a bolted-on comment box

---

## 3. Relationship to Prior Phases

Phase 10 builds directly on the execution already completed in Phases 1 through 9.

Relevant prior phase foundations:

- **Phase 3** locked access control and governance backbone
- **Phase 4** introduced realtime transport and reliable delivery
- **Phase 5** established core conversation, thread, and read-state behavior
- **Phase 6** established files, mentions, and rich content patterns
- **Phase 7** established tasks, reminders, and work coordination
- **Phase 8** established meetings and calendar integration
- **Phase 9** established search, notifications, digests, diagnostics, and reliability closeout

Relevant non-messaging foundations already in the repo:

- Client Hub auth and session handling
- portal/client scoping
- customer identity and readiness state
- portal activity and audit surfaces
- secure attachment/storage patterns

Phase 10 must not duplicate those foundations. It must extend them coherently.

---

## 4. Phase 10 Product Goal

The goal of Phase 10 is:

**Enable authenticated Client Hub clients to participate in secure, org-scoped, customer-scoped conversations with internal team members under strict visibility and boundary rules, using the same messaging system foundation already established for internal messaging.**

That goal has five mandatory properties:

1. **Internal-first architecture remains intact**
   - portal conversations extend the system
   - they do not redefine the core messaging model

2. **Boundary safety is non-negotiable**
   - internal-only content must never leak externally
   - client messages must never cross org or customer boundaries

3. **Portal identity is constrained**
   - the only external participant model in Phase 10 is an authenticated Client Hub client
   - no anonymous/public participants
   - no cross-customer shared rooms

4. **Operational supportability must be real**
   - internal teams need ownership, visibility, state, auditability, and diagnostics

5. **Phase 11 compatibility must be preserved**
   - retention
   - moderation
   - export
   - legal/governance controls
   must be addable without redesigning Phase 10 data or behavior

---

## 5. Scope and Explicit Non-Goals

### 5.1 In scope for Phase 10

- authenticated portal/client participation in messaging
- client-specific portal conversations
- internal messaging workspace support for portal conversations
- client-facing messaging surface inside Client Hub
- internal-only notes within portal conversation threads
- customer-linked conversation context
- attachment support with audience-safe visibility
- notifications and read/unread behavior for portal conversations
- conversation ownership / operational state
- audit and supportability events for portal communication
- strong authorization and failure handling

### 5.2 In scope linked business contexts

Phase 10 portal conversations may be linked to:

- customer-level general support conversation
- invoice context
- quote context
- payment context
- statement context
- ticket/support workflow context
- generic client account/help context

The linked record gives business context and routing meaning. It does not automatically grant new document visibility beyond the existing module rules.

### 5.3 Explicit non-goals for Phase 10

- public or anonymous messaging
- support-widget style open web chat
- vendor/partner external participant model
- external group conversations
- client-to-client shared conversations
- cross-organization shared channels
- full moderation console
- full retention engine and legal hold execution
- full export/archive package workflows
- broad guest/shared-channel collaboration
- voice/video calls
- broad workflow automation on portal messages

### 5.4 Why these non-goals matter

Phase 10 is a boundary-sensitive extension. If scope expands to public or multi-external collaboration too early, the delivery will either:

- weaken security
- create confusing mixed audience behavior
- become too broad to review safely
- collide with Phase 11 responsibilities

Phase 10 should stay narrow, secure, and production-grade.

---

## 6. Locked Product Decisions

### 6.1 External participant model

Phase 10 external participants are limited to:

- authenticated **Client Hub clients**

No other external identity model is permitted in Phase 10.

### 6.2 Conversation model

The system continues using one messaging foundation with typed conversations.

Portal-capable conversations are not a second chat product. They are a governed extension of the same domain model.

### 6.3 Visibility model

Portal conversations support two message audiences:

- `EXTERNAL_VISIBLE`
- `INTERNAL_ONLY`

Internal-only notes are first-class and must be intentionally separated in both storage semantics and rendering semantics.

### 6.4 Security model

Phase 10 uses:

- existing secure portal auth/session model
- org-scoped authorization
- customer-scoped authorization
- role-aware internal access
- signed attachment access
- audit/event logging

Phase 10 does **not** introduce:

- public tokens for chat access
- client-trusted visibility rules
- permissive fallback routing

### 6.5 Delivery model

- one Phase 10 branch under the Internal Messaging workflow
- sprint branches under that phase branch
- each sprint opens a PR into the phase branch
- phase promotion happens only after all sprint PRs are approved and merged

---

## 7. Users, Roles, and Operating Model

### 7.1 Primary internal users

- org owner
- org admin
- finance/operations users
- assigned customer-facing team members
- managers supervising customer communication

### 7.2 External users

- authenticated Client Hub clients tied to one customer identity in one organization

### 7.3 Ownership model

Portal conversations are organizational assets.

That means:

- conversations are scoped to the org
- internal access follows policy and role permissions
- portal participants are tied to customer identity, not free-form email identity
- ownership, assignment, and state are supportable by internal teams

### 7.4 Internal operating model

Internal teams should be able to:

- view the conversation queue
- see which customer and context a conversation belongs to
- assign responsibility
- add internal-only notes
- reply to the client
- close and reopen the conversation
- understand when the client last responded
- understand whether the conversation is waiting on internal action or client action

### 7.5 Client operating model

Clients should be able to:

- view conversations they are allowed to access
- read external-visible history only
- send messages
- upload allowed attachments
- see truthful state such as closed or unavailable

Clients should **not** be able to:

- see internal notes
- browse other customers’ conversations
- access unrelated linked documents via the messaging surface
- infer hidden org/customer state

---

## 8. Product Principles

### 8.1 One system, not two

Portal conversations must reuse the messaging system foundation rather than creating a parallel chat stack.

### 8.2 Boundaries are product features

Internal vs external visibility must be intentionally modeled in UX and domain behavior, not hidden in ad hoc conditionals.

### 8.3 Truthful state over fake convenience

If a client cannot reply because a conversation is closed, revoked, or unavailable, the UI must say so clearly and fail closed.

### 8.4 Internal notes are first-class

Operators need private coordination inside customer conversations without leakage risk.

### 8.5 Production-grade supportability

Customer communication must be diagnosable and operable by real teams. That means:

- ownership
- state
- auditability
- notification clarity
- accurate access/error surfaces

### 8.6 No AI slop architecture

Phase 10 must avoid:

- duplicate models for nearly identical concepts
- route-local business logic bloat
- hidden fallback rules
- weak “temporary” auth exceptions
- shallow UI shells with implied but undefined behavior

---

## 9. Portal Conversation Model

### 9.1 Conversation types

The conversation system must distinguish at least:

- `INTERNAL`
- `PORTAL`

### 9.2 Portal conversation identity

A portal conversation is scoped by:

- `orgId`
- `customerId`
- `conversationId`
- optional `linkedRecordType`
- optional `linkedRecordId`

### 9.3 Allowed linked record types

The linked record type set for Phase 10 should be explicit:

- `CUSTOMER`
- `INVOICE`
- `QUOTE`
- `PAYMENT`
- `STATEMENT`
- `TICKET`
- `GENERAL_SUPPORT`

No arbitrary record-link sprawl should be introduced in this phase.

### 9.4 Participant model

Portal conversations may include:

- one or more internal members
- exactly one external customer identity domain

In Phase 10, the portal participant side must map to the same customer identity. No multi-customer or multi-org external room is allowed.

### 9.5 Conversation creation rules

Portal conversations may be created:

- by internal users from the Messaging workspace
- by internal users from linked business context
- by client-side initiation only where explicitly allowed by policy

Client-initiated conversation creation must still resolve to:

- one org
- one authenticated client
- one allowed conversation type

### 9.6 Portal conversation state

Portal conversations require an operational state model:

- `OPEN`
- `WAITING_ON_INTERNAL`
- `WAITING_ON_CLIENT`
- `CLOSED`

This state is distinct from unread/read state.

### 9.7 Internal note model

Internal notes are messages within the conversation timeline that:

- are visible only to internal members
- cannot generate client-visible notifications
- cannot be exposed in portal rendering
- cannot leak via counts, previews, snippets, exports, or attachments

---

## 10. Internal Workspace Experience

### 10.1 Messaging workspace extension

The existing Messaging workspace must gain first-class support for portal conversations.

Internal users should be able to filter or navigate by:

- all portal conversations
- open conversations
- waiting on client
- waiting on internal
- closed conversations
- assigned to me
- unassigned
- linked context type

### 10.2 Conversation list requirements

The portal conversation list should show:

- customer name
- linked context badge
- conversation state
- unread state
- assignee / owner
- last activity time
- preview snippet that respects audience rules

### 10.3 Detail pane requirements

The internal conversation detail surface should support:

- full mixed timeline rendering
- clear visual distinction between client-visible replies and internal-only notes
- customer identity summary
- linked record summary
- assignment controls
- close/reopen controls
- attachment section
- audit/support cues when relevant

### 10.4 Internal note compose mode

The composer must make audience explicit.

Required behavior:

- reply as client-visible message
- add internal-only note
- clear, non-ambiguous mode indicator
- safe default that avoids accidental leakage

### 10.5 Assignment behavior

Internal users should be able to:

- assign conversation owner
- reassign conversation
- leave unassigned

Assignment changes should be visible in operational history and notification behavior where relevant.

### 10.6 Internal restricted states

Internal UI must handle:

- member lacks permission
- linked record missing
- client access revoked
- conversation closed
- degraded delivery state
- attachment unavailable

---

## 11. Client Hub Experience

### 11.1 New Client Hub module

Client Hub must gain a new top-level messaging surface:

- `/portal/[orgSlug]/client-hub/messages`

This should feel like a deliberate extension of Client Hub, not a repurposed internal workspace.

### 11.2 Client list view requirements

Clients should see:

- only their own allowed conversations
- last activity timestamp
- unread state
- linked context badge where appropriate
- closed/open status

### 11.3 Client detail view requirements

The conversation detail page should show:

- only external-visible messages
- safe attachment previews/download actions
- truthful linked context summary where allowed
- reply composer
- disabled reply state when conversation is closed or unavailable

### 11.4 Client compose constraints

The client compose experience must support:

- plain message send
- allowed file attachment
- retry on transient failure
- clear closed/unavailable state

The client must not have:

- internal mode switching
- audience controls
- ability to alter ownership/state

### 11.5 Client initiation rules

If client-initiated conversation creation is enabled in Phase 10, it must be constrained to allowed contexts only.

Recommended allowed initiation:

- general support/help
- reply to existing business-linked conversation

Recommended disallowed initiation in Phase 10:

- arbitrary new conversation categories
- ad hoc multi-topic conversation sprawl

### 11.6 Client-facing truthfulness

If a portal client loses eligibility because of revoked access, disabled lifecycle, churned state, or org mismatch:

- access must fail closed
- the UI must not imply that the conversation still works

---

## 12. Conversation Lifecycle and State Model

### 12.1 Lifecycle states

Portal conversation lifecycle:

1. created
2. active/open
3. waiting on internal
4. waiting on client
5. closed
6. reopened

### 12.2 State transition rules

- creation starts as `OPEN` or `WAITING_ON_INTERNAL` depending on who created it
- internal reply can move state to `WAITING_ON_CLIENT`
- client reply can move state to `WAITING_ON_INTERNAL`
- authorized internal user can close
- authorized internal user can reopen

### 12.3 Closed behavior

Closed conversations:

- remain readable according to authorization
- cannot receive client replies
- may block internal replies or require reopen first, depending on implementation choice
- must not appear as active in client UI

### 12.4 Reopen behavior

Reopening must:

- be explicit
- be auditable
- restore truthful notification/state behavior

### 12.5 Linked record lifecycle interactions

If a linked record is deleted, hidden, or no longer accessible:

- the conversation should remain durable if business policy allows
- the linked context card should degrade truthfully
- access should not silently widen

---

## 13. Audience, Notes, and Message Visibility

### 13.1 Audience contract

Every message in a portal conversation must have a durable audience contract:

- `EXTERNAL_VISIBLE`
- `INTERNAL_ONLY`

### 13.2 Rendering contract

- internal workspace sees both message types according to internal permissions
- client workspace sees only `EXTERNAL_VISIBLE`

### 13.3 Snippet and preview contract

Any list preview, search preview, unread summary, or notification snippet shown to the client must derive only from `EXTERNAL_VISIBLE` content.

### 13.4 Count contract

Unread counts, activity counters, and “last reply” summaries exposed to portal clients must not be influenced by internal-only notes in misleading ways.

### 13.5 Attachment audience inheritance

Attachments on messages inherit the message audience by default.

That means:

- attachments on internal notes are internal-only
- attachments on external-visible messages are portal-visible if allowed

No independent attachment visibility override should exist in Phase 10.

---

## 14. Attachments and Shared Context

### 14.1 Attachment model

Phase 10 should reuse the platform’s secure attachment patterns.

Requirements:

- validated file type and size
- org-scoped storage
- signed download/open access
- message-linked attachment records
- audience-aware visibility

### 14.2 Portal attachment rules

Portal clients may upload only allowed attachment types and sizes.

Uploads must be:

- tied to org
- tied to customer
- tied to conversation/message
- validated before registration is accepted

### 14.3 Internal attachment rules

Internal users may attach files to:

- external-visible replies
- internal-only notes

The system must ensure they cannot accidentally attach a file intended for internal-only use to an external-visible message without an explicit audience decision.

### 14.4 Linked business context

Portal conversations may show limited linked-context cards such as:

- invoice summary
- quote summary
- payment summary
- support ticket summary

These summaries must not bypass the underlying document/module permissions.

Messaging context may reference a record without granting direct document visibility.

---

## 15. Notifications, Read State, and Productivity

### 15.1 Internal notifications

Internal users should receive notifications for:

- new client reply
- assignment changes
- reopen events
- mentions if supported in portal conversations

### 15.2 Client notifications

Clients should receive notifications for:

- new internal reply
- reopened conversation if relevant
- conversation closure only if product policy requires

### 15.3 No false delivery claims

Notification or delivery state must be truthful.

If the system fails to queue or deliver a notification:

- the system must not misrecord the message as fully delivered to the recipient-facing notification path

### 15.4 Read state model

Portal read state must support:

- conversation unread/read
- last read position or equivalent durable contract
- internal and external sides maintaining their own read semantics

### 15.5 Search/productivity limitations

Portal search is not required to match internal search breadth in Phase 10.

If limited or unavailable:

- the UI must present that limitation truthfully
- no fake “full search” behavior should be implied

---

## 16. Permissions, Security, and Boundary Rules

### 16.1 Universal boundary rules

The system must enforce:

- org scoping on every portal conversation access path
- customer scoping on every portal participant access path
- internal role-aware admin/governance controls
- fail-closed behavior on ambiguity

### 16.2 Portal client access rules

A portal client may access only conversations where:

- the org matches the authenticated portal session
- the customer identity matches the authenticated portal session
- the customer still has valid portal eligibility
- the conversation is portal-visible and not internally restricted

### 16.3 Internal member access rules

Internal access must remain:

- org-scoped
- role-aware
- membership-aware if the conversation model requires it

### 16.4 No cross-surface data leakage

The system must prevent leakage through:

- previews
- snippets
- counts
- attachment lists
- linked-context cards
- notifications
- audit/support summaries visible to the wrong audience

### 16.5 Revocation behavior

If the client:

- is disabled
- is churned
- loses portal eligibility
- has sessions revoked
- changes org/customer identity assumptions

then conversation access must fail closed immediately on future access attempts.

### 16.6 Anti-abuse controls

Phase 10 must define:

- message send rate limits
- attachment upload rate/size controls
- abuse/audit events for blocked actions
- suspicious-access event hooks

---

## 17. Audit, Supportability, and Diagnostics

### 17.1 Required audit events

At minimum, audit/support events should exist for:

- conversation created
- portal message sent
- internal reply sent
- internal note created
- conversation assigned/reassigned
- conversation closed/reopened
- attachment uploaded
- access denied
- session mismatch blocked
- rate-limited or abuse-blocked action

### 17.2 Supportability requirements

Internal operators need support surfaces for:

- conversation ownership
- last external activity
- failed or blocked send attempts
- attachment failure states
- portal access-denied patterns

### 17.3 Diagnostics principles

Diagnostics must be:

- org-scoped
- supportable
- safe
- free from raw secrets/tokens
- free from raw internal stack traces in user-visible surfaces

---

## 18. Reliability, Delivery, and Failure Model

### 18.1 Reliability requirements

Portal conversation delivery must be:

- durably persisted
- idempotent under retry
- resistant to duplicate side effects
- truthful under degraded conditions

### 18.2 Failure handling

The system must handle:

- message persistence failure
- attachment registration failure
- notification queue failure
- partial side-effect failure
- reconnect/reload after send
- stale session during submit

### 18.3 Degraded state contract

If delivery is degraded:

- internal users should see truthful retry/failure state
- clients should never receive false “sent successfully” messaging when the core write failed

### 18.4 Realtime model

Portal conversations should remain compatible with the existing realtime architecture, but correctness must not depend on realtime alone.

Durable persistence is the source of truth.

---

## 19. Domain Model and Internal Interfaces

The implementation should define stable concepts equivalent to:

- `Conversation`
- `ConversationParticipant`
- `ConversationMessage`
- `ConversationAttachment`
- `ConversationReadState`
- `MessagingAuditEvent`
- `PortalConversationLink`

Recommended Phase 10-specific fields/interfaces:

- `Conversation.type`
  - `INTERNAL | PORTAL`
- `Conversation.portalState`
  - `OPEN | WAITING_ON_INTERNAL | WAITING_ON_CLIENT | CLOSED`
- `Conversation.linkedRecordType`
  - `CUSTOMER | INVOICE | QUOTE | PAYMENT | STATEMENT | TICKET | GENERAL_SUPPORT`
- `Conversation.linkedRecordId`
- `Conversation.customerId`
- `ConversationMessage.audience`
  - `EXTERNAL_VISIBLE | INTERNAL_ONLY`
- `ConversationParticipant.kind`
  - `INTERNAL_MEMBER | PORTAL_CLIENT`
- `PortalConversationLink`
  - `orgId`
  - `customerId`
  - `conversationId`
  - `linkedRecordType`
  - `linkedRecordId`
  - `createdByUserId`
  - `lastExternalActivityAt`

Recommended event categories:

- `portal_conversation_created`
- `portal_message_sent`
- `portal_internal_note_created`
- `portal_conversation_closed`
- `portal_conversation_reopened`
- `portal_conversation_assigned`
- `portal_attachment_uploaded`
- `portal_conversation_access_blocked`
- `portal_conversation_rate_limited`

The final implementation may choose exact names, but the behavioral contracts above are mandatory.

---

## 20. Routes, Surface Map, and Information Architecture

### 20.1 Internal surfaces

Internal portal-conversation support should live inside the Messaging module, not a separate product area.

Likely internal surfaces:

- Messaging workspace filtered to portal conversations
- conversation detail view with portal context
- linked entrypoints from customer/account/workflows

### 20.2 Portal surfaces

Required portal surface:

- `/portal/[orgSlug]/client-hub/messages`

Recommended portal sub-surfaces:

- list view
- conversation detail
- optional linked context deep links where allowed

### 20.3 No second inbox architecture

The system must not create:

- a parallel “portal chat” backend
- a second conversation domain
- a duplicated attachment visibility model

### 20.4 Routing safety

All route-level authorization must:

- use server-side checks
- validate org slug against session/org truth
- validate customer identity against portal conversation ownership
- fail closed on mismatch

---

## 21. States, Errors, and Edge Cases

Phase 10 must intentionally cover:

- no conversations yet
- no portal access enabled
- client tries to access another org slug
- client tries to access another customer conversation
- client portal session revoked mid-flow
- conversation linked record deleted or hidden
- conversation closed while client is viewing it
- internal-only note exists as the latest message
- attachment upload fails after message draft exists
- notification queue fails after message persistence succeeds
- stale conversation state on retry
- duplicate submit from double-click/retry
- degraded realtime connection
- partial linked context unavailable
- customer email changed and sessions rotated
- churned/disabled customer after historical conversation exists
- internal reassignment during active conversation
- reopened conversation after prior closure

Every one of these must produce a truthful and secure outcome.

---

## 22. Delivery Workflow: Branches, Phases, and Sprints

### 22.1 Workflow branch

- `feature/internal-messaging-platform`

### 22.2 Phase branch

- `feature/internal-messaging-phase-10-portal-conversation-extension`

### 22.3 Sprint branches

Each sprint branches from the Phase 10 branch and opens a PR back into that phase branch.

Recommended sprint branches:

- `feature/internal-messaging-phase-10-sprint-1-domain-boundaries-and-security`
- `feature/internal-messaging-phase-10-sprint-2-internal-workspace-and-routing`
- `feature/internal-messaging-phase-10-sprint-3-client-hub-messages-and-compose`
- `feature/internal-messaging-phase-10-sprint-4-notifications-attachments-and-ops`
- `feature/internal-messaging-phase-10-sprint-5-hardening-regression-and-phase-closeout`

### 22.4 PR workflow

For each sprint:

1. create sprint branch from the Phase 10 branch
2. complete sprint scope only
3. open sprint PR into the Phase 10 branch
4. review and approve sprint PR
5. merge sprint PR into the Phase 10 branch

After all sprint PRs are merged:

1. open one Phase 10 promotion PR
2. base: `feature/internal-messaging-platform`
3. head: `feature/internal-messaging-phase-10-portal-conversation-extension`

### 22.5 Isolation rule

Phase 10 work must not spill into:

- Client Hub unrelated code
- Mailbox
- PDF Studio
- tags
- TOTP
- unrelated platform refactors

Only directly required adjacent surfaces may be touched.

---

## 23. Detailed Sprint Plan

### Sprint 10.1 — Domain Boundaries and Security Backbone

**Goal:** Define and implement the portal conversation domain model, participant model, audience model, and authorization backbone.

Must deliver:

- portal conversation type and participant rules
- audience model for internal-only vs external-visible messages
- org + customer scoped authorization model
- linked-context type contract
- conversation lifecycle state contract
- anti-abuse and rate-limit contract
- audit/event contract for access and mutation flows

Key acceptance expectations:

- no ambiguous visibility rules
- no client-trusted authorization
- no internal note leakage path

### Sprint 10.2 — Internal Workspace and Routing

**Goal:** Extend the existing Messaging workspace to support portal conversations as a first-class internal operational workflow.

Must deliver:

- portal conversation inbox/list filters
- conversation detail surface with client/context summary
- assignment and operational state controls
- internal note UX
- safe routing from client/context entrypoints
- truthful restricted/closed/degraded states

Key acceptance expectations:

- internal teams can operate client conversations without leaving Messaging
- ownership and state are visible and supportable

### Sprint 10.3 — Client Hub Messages and Compose

**Goal:** Deliver the client-facing messaging surface in Client Hub.

Must deliver:

- messages list and detail surface in Client Hub
- client reply flow
- allowed conversation creation behavior if enabled
- closed/unavailable/revoked access states
- portal-safe composer and read/unread behavior

Key acceptance expectations:

- client experience is simple and trustworthy
- no accidental internal capability exposure

### Sprint 10.4 — Notifications, Attachments, and Operational Supportability

**Goal:** Add portal conversation notifications, attachment behavior, and support/admin visibility.

Must deliver:

- internal notification routing for client replies
- client notification routing for internal replies
- signed attachment access model
- file validation and audience inheritance
- supportable diagnostics/activity/audit views

Key acceptance expectations:

- attachment behavior is secure
- notification behavior is truthful
- support teams can diagnose issues

### Sprint 10.5 — Hardening, Regression, and Phase Closeout

**Goal:** Close edge cases, regressions, and release-quality risks for portal conversation support.

Must deliver:

- duplicate/retry safety
- degraded-state truthfulness
- regression coverage across auth/session/customer-state changes
- linked-context safety validation
- final phase promotion readiness

Key acceptance expectations:

- no blocking security gaps
- no false-success states
- no unresolved boundary regressions

---

## 24. Acceptance Criteria

Phase 10 is complete only when:

- authenticated Client Hub clients can participate in allowed conversations safely
- internal users can operate portal conversations from Messaging as a serious workflow
- internal-only notes are fully separated from external-visible content
- org and customer boundaries are enforced on every path
- linked business context is useful but does not widen access
- notifications, attachments, and activity behavior are truthful
- degraded and failure states fail closed and remain understandable
- the implementation is production-grade and compatible with later retention/export/moderation work

Phase 10 must **not** be accepted if:

- any internal-only content can leak externally
- any cross-org or cross-customer access path exists
- client-facing routing depends on weak assumptions
- attachment visibility is ambiguous
- the internal workspace behaves like a shallow inbox without operational controls
- the phase introduces a second messaging architecture

---

## 25. Test Plan

Phase 10 implementation must include at minimum:

- org-boundary authorization tests
- customer-boundary portal access tests
- revoked/disabled/churned customer regression tests
- internal-only note non-leakage tests
- external-visible message rendering tests
- linked-context visibility tests across all allowed record types
- closed/reopen state tests
- assignment state tests
- duplicate submit and retry/idempotency tests
- notification routing tests
- attachment validation and signed-access tests
- unread/read state tests
- degraded/reconnect truthfulness tests
- final end-to-end internal-user to portal-client conversation flow tests

Required categories:

- unit tests for authorization and domain rules
- integration tests for route/action behavior
- UI tests for audience-specific rendering and state handling
- regression tests for portal auth/session and customer-state interactions

---

## 26. Risks and Product Warnings

Key risks:

1. treating portal conversations like a simple guest chat add-on
2. mixing internal and external visibility rules too loosely
3. letting linked-record context accidentally widen document access
4. under-designing internal note behavior
5. treating notification and attachment flows as secondary concerns
6. colliding with Client Hub or support-ticket flows without a clear contract
7. adding too much Phase 11 scope into Phase 10

The biggest technical warning is this:

**If audience and authorization are not modeled explicitly at the domain level, the implementation will drift into spaghetti logic and become unsafe.**

---

## 27. Future Compatibility Requirements

Phase 10 must leave room for Phase 11 and Phase 12 without forcing re-architecture.

That means:

- retention can later attach to conversation/message/attachment lifecycle
- moderation can later inspect governed portal-visible content
- export can later produce scoped audit/compliance packages
- legal/governance controls can later pause/delete/hold content under policy
- monitoring and rollout controls can later observe portal conversation reliability separately

Phase 10 should also remain compatible with possible later expansions such as:

- vendor or partner external participant models
- limited guest/shared channels
- richer automation from conversations

Those are not part of this phase and must not distort the initial design.

---

## 28. Final Phase Definition

Slipwise Internal Messaging Phase 10 is defined as:

- a secure portal conversation extension
- built on the existing internal messaging foundation
- limited to authenticated Client Hub clients as external participants
- governed by explicit audience, auth, and operational state rules
- integrated into the internal Messaging workspace and Client Hub
- designed for production-grade correctness, supportability, and future compliance expansion

This phase is successful only if it ships as a **serious, secure, supportable customer communication layer** rather than a lightweight message widget.
