# Internal Messaging Phase 3 — Access Control and Governance Backbone

This document defines a practical Sprint 3.1–3.4 delivery breakdown and a detailed Phase 3 PRD for Internal Messaging, grounded in the canonical Internal Messaging PRD and the current Sprint 2.3 implementation baseline.

## 1. Purpose

Phase 3 exists to turn the current messaging foundation into a governed, security-first product surface.

Phase 2 established the domain model, service contracts, core service implementations, read shapes, read models, and basic route surfaces. Phase 3 must now lock:

- org-scoped visibility rules
- participant and role-based authorization
- governed admin/support access
- auditable governance-sensitive operations
- restricted and denied states that are real, not cosmetic
- route and read-model safety as a product guarantee rather than an implementation side effect

This phase should make the messaging platform safe to evolve into realtime delivery in Phase 4 and richer collaboration features in later phases.

---

## 2. Canonical source alignment

This Phase 3 PRD extends the canonical document:

- `docs/PRD/INTERNAL_MESSAGING_PLATFORM_PRD.md`

Relevant canonical sections:

- `## 23. Domain Model and Internal Interfaces`
- `## 25. Security, Audit, and Compliance`
- `## 27. Delivery Workflow: Branches, Phases, and Sprints`
- `## 28. Detailed Phase Plan`
- `## 29. Acceptance Criteria`
- `## 30. Test Plan`

Canonical Phase 3 definition:

- **Phase 3 — Access Control and Governance Backbone**
- **Goal:** lock security and org-scoped visibility

This document does not replace the master PRD. It operationalizes Phase 3 into a delivery-ready spec.

---

## 3. Current implementation baseline at start of Phase 3

Phase 3 begins on top of the current Internal Messaging Sprint 2.3 baseline in:

- `/private/tmp/payslip-generator-messaging-sprint22`

### 3.1 What already exists

The current baseline already includes:

- messaging Prisma models and enums for conversations, participants, messages, threads, reactions, mentions, read state, presence, typing, attachments, tasks, meetings, calendar connections, audit events, and retention policies
- stable domain types and service contracts
- core service implementations for:
  - conversations
  - participants
  - messages
  - threads
  - reactions
  - mentions/read-state
  - presence/typing
- org-safe query helpers
- audit logging helpers
- UI read shapes and read-model aggregators
- API route surfaces for conversation list/detail, archive, messages, participants, and threads
- baseline tests for Phase 2.1, 2.2, and 2.3

### 3.2 Key Phase 3 starting observations

The current baseline demonstrates that Phase 2 is materially implemented, but it also exposes why Phase 3 is necessary:

- org scoping exists, but Phase 3 must formalize authorization and visibility policy behavior as a first-class product contract
- participant membership checks exist in several surfaces, but they must become systematic and governance-driven across all relevant reads and mutations
- audit plumbing exists, but governance-sensitive operations must become complete, explicit, and support-ready
- conversation visibility fields exist, but Phase 3 must define how visibility, membership, admin access, and restricted states behave across routes and UI surfaces
- current route auth establishes org context, but Phase 3 must define stricter access classes for members, moderators/admins, and narrow operational/support exceptions

### 3.3 What Phase 3 must not redo

Phase 3 must not re-implement Phase 2 foundation work such as:

- new domain model invention that belongs to schema/design foundation
- realtime transport, presence fanout, websocket delivery, replay, or reconnect architecture
- full chat feature expansion beyond what is required to enforce access and governance
- file/media platform work beyond governance-critical access rules

---

## 4. Phase 3 goals

Phase 3 must result in the following outcomes:

- conversation visibility and access rules are explicit and enforced consistently
- participant role semantics are defined for governance-sensitive operations
- read surfaces do not leak conversation existence or content in unauthorized ways
- admin/support access is intentionally narrow, auditable, and policy-bound
- restricted, denied, archived, locked, and removed-member states are modeled and exposed predictably
- governance-sensitive actions emit trustworthy audit events with safe metadata
- the system is ready for realtime transport in Phase 4 without needing to re-architect core authorization behavior

---

## 5. Non-goals

Phase 3 does not include:

- websocket or pub/sub transport
- realtime session delivery guarantees
- typing/presence fanout infrastructure beyond current persisted state handling
- core chat expansion such as full DM/channel/group richness beyond governance needs
- task/meeting/calendar feature completion beyond access-control implications
- external/portal conversation access
- enterprise retention or export feature completion beyond foundational governance hooks

---

## 6. Product and engineering principles for Phase 3

### 6.1 Default deny

Unauthorized users should receive no accidental content visibility. Access must be explicitly granted by org membership, conversation membership, role rule, or a narrow audited governance exception.

### 6.2 Membership is the default read boundary

For ordinary product usage, conversation content is visible only to active participants unless a stricter or explicitly governed rule says otherwise.

### 6.3 Governance exceptions must be narrow

Admin or support access must not become an unbounded bypass. Any exception path must be:

- explicitly permitted by policy
- minimal in scope
- fully auditable
- safe for future compliance hardening

### 6.4 Visibility must be product-real

Visibility settings must affect:

- discoverability
- list inclusion
- detail fetch behavior
- participant management
- mutation permissions
- restricted-state UX

### 6.5 Audit is part of product correctness

For governance-sensitive operations, absence of correct audit behavior is a correctness failure, not a polish issue.

---

## 7. Recommended Sprint 3.1–3.4 breakdown

## Sprint 3.1 — Authorization model and conversation access rules

### Goal

Define and enforce the baseline authorization model for conversations, participants, and content access.

### Scope

- formalize role semantics for `OWNER`, `ADMIN`, and `MEMBER`
- define access rules for:
  - conversation discovery
  - conversation detail access
  - message list/detail access
  - participant list access
  - thread list/detail access
- define behavior for:
  - removed members
  - archived conversations
  - locked conversations
  - DM versus channel/group constraints
- introduce shared authorization helpers or policy evaluators where appropriate
- ensure read-model and service-layer access checks are consistent

### Deliverables

- explicit authorization matrix for core conversation operations
- centralized access helper/policy layer for conversation membership and role checks
- read-model and route alignment to the authorization model
- regression tests proving unauthorized users cannot access content or membership data improperly

### Acceptance criteria

- conversation-scoped reads require the correct active membership or approved governance exception
- role-sensitive operations fail deterministically when the actor lacks permission
- removed members do not retain unintended content access
- archived and locked state behavior is consistent across services and routes

### Out of scope

- admin/support exception workflows beyond foundational policy seams
- full moderation console behavior

---

## Sprint 3.2 — Role-aware governance actions and admin/support control plane

### Goal

Introduce governed operational control for sensitive messaging actions without weakening ordinary member access boundaries.

### Scope

- define governance-sensitive actions such as:
  - archive/unarchive
  - rename
  - visibility changes
  - participant role changes
  - participant removal under governance rules
  - conversation lock/freeze semantics if not already explicit
- define narrow admin/support visibility rules
- add operational route/service surfaces for governed actions if needed
- require audit emission for all governance-sensitive mutations
- define safe metadata rules for audit payloads

### Deliverables

- explicit governance action matrix by actor type and conversation role
- narrow admin/support access model for operational intervention
- governance-safe mutation entry points
- auditable admin/support action behavior

### Acceptance criteria

- governance-sensitive actions are unavailable to ordinary actors without proper role/policy approval
- admin/support operations are policy-bound and auditable
- no unsafe metadata leakage occurs in governance audit rows
- conversation governance state is durable and predictable after mutations

### Out of scope

- broad enterprise moderation suite
- retention workflow completion
- export/legal hold implementation

---

## Sprint 3.3 — Read/API enforcement, safe visibility, and restricted-state behavior

### Goal

Harden the route and read-model layer so the product surface reflects real visibility and governance behavior.

### Scope

- enforce visibility and membership consistently in all messaging API reads
- define restricted-state response behavior for:
  - inaccessible conversations
  - removed membership
  - private conversations outside membership
  - admin-restricted views
- make list, detail, participant, and thread reads consistent with product policy
- define conversation existence leakage rules
- ensure pagination and filtering do not reveal unauthorized content indirectly
- align UI-facing read shapes with governance-safe visibility boundaries

### Deliverables

- hardened read-model layer with policy-aware reads
- route-level contract for denied versus not-found behavior
- restricted/read-denied UI shape strategy
- tests covering cross-org, cross-conversation, removed-member, and policy-restricted cases

### Acceptance criteria

- unauthorized users cannot infer or fetch restricted conversation content accidentally
- list/detail/read behaviors align with the same visibility rules
- denied and not-found behavior is consistent and intentional
- route responses remain safe under pagination and edge-case inputs

### Out of scope

- full search and notification governance
- portal-facing access boundaries

---

## Sprint 3.4 — Audit completeness, governance safeguards, and phase-close hardening

### Goal

Close Phase 3 by making governance behavior supportable, testable, and robust enough for later realtime rollout.

### Scope

- audit coverage review for all governance-sensitive actions
- add missing audit events or metadata constraints
- define abuse/rate-limit expectations for messaging governance and sensitive routes
- strengthen supportability and diagnostics for access-denied and governance events
- phase-close hardening of authorization helpers and route contracts
- add comprehensive tests for governance and org-boundary safety

### Deliverables

- complete governance audit map
- hardened error and supportability behavior for access-control flows
- rate-limit guidance or implementation seams for sensitive messaging actions
- phase completion test suite and close-out checklist

### Acceptance criteria

- all governance-sensitive mutations produce trustworthy audit records
- access-denied paths are observable without leaking unsafe detail
- org-boundary and authorization tests are comprehensive enough to support Phase 4 safely
- the system no longer relies on informal or scattered access behavior for core messaging safety

### Out of scope

- realtime delivery implementation
- notification worker flows
- enterprise retention/export completion

---

## 8. Detailed Phase 3 PRD

## 8.1 Phase title

**Internal Messaging Phase 3 — Access Control and Governance Backbone**

## 8.2 Intent

Phase 3 makes Internal Messaging safe, governed, and visibility-correct before realtime transport is introduced. It transforms the current messaging foundation into a system where content access, mutation permissions, operational intervention, and auditability are explicit product guarantees.

## 8.3 Why this phase exists now

Phase 2 created the messaging foundation, but a foundational service layer alone is not sufficient for production safety. Before introducing realtime transport or scaling collaborative usage, the system must guarantee:

- who can see what
- who can do what
- how restricted states behave
- how operational access is governed
- how sensitive actions are audited

Without this phase, later realtime and productivity work would amplify unclear authorization behavior instead of building on a locked governance backbone.

---

## 9. Users and actor classes

Phase 3 should explicitly reason about at least the following actor classes:

- **active participant** — ordinary user who is currently a member of the conversation
- **former participant** — user who previously had access but has left or been removed
- **org member, not a participant** — user inside the org but outside the conversation boundary
- **conversation admin/owner** — participant with elevated conversation governance privileges
- **org admin / operational admin** — actor with higher governance authority under policy
- **support / operational exception actor** — narrow, explicitly allowed operational actor for support workflows

Support/operational exception access must remain narrower than general admin convenience.

---

## 10. Core product decisions for Phase 3

### 10.1 Active participation is the normal content boundary

The default rule is:

- if a user is not an active participant, they cannot read ordinary conversation content

This applies to:

- conversation summaries where discoverability is restricted
- conversation detail
- message lists
- message detail
- participant lists
- thread lists and thread detail

### 10.2 Conversation type matters

The authorization model must distinguish at minimum between:

- `DM`
- `CHANNEL`
- `GROUP`

Expected policy differences:

- DMs should remain the most restrictive
- channels may support governed discoverability or visibility rules, but not accidental content exposure
- groups require explicit membership semantics and management constraints

### 10.3 Visibility is not just a label

Conversation visibility settings must affect:

- who can discover a conversation exists
- who can join or request access if such flows are introduced later
- who can view summaries versus content
- what restricted state the UI should show

### 10.4 Governance actions require role-aware enforcement

Operations such as renaming, archiving, visibility changes, and participant governance must be explicitly tied to role and policy.

### 10.5 Support access must be narrow and explicit

Any support/admin visibility exception must:

- be explicitly approved by product/security policy
- be auditable
- avoid broad standing access to all conversation content by default

---

## 11. Domain and permission model expectations

Phase 3 should formalize the following model expectations.

### 11.1 Conversation roles

Current role foundation:

- `OWNER`
- `ADMIN`
- `MEMBER`

Phase 3 must define what each role can do regarding:

- read access
- send access
- participant add/remove
- role changes
- rename
- archive
- visibility changes
- lock/freeze or equivalent governance actions

### 11.2 Membership states

At minimum, policy behavior must distinguish:

- active participant
- previously-left/removed participant
- never-a-participant

### 11.3 Conversation lifecycle states

The policy model must define expected behavior for:

- active conversations
- archived conversations
- locked conversations
- deleted or hidden future states if present later

### 11.4 Governance-sensitive entity relationships

Phase 3 policy must treat these as governed entities even if their full product workflows arrive later:
 
 - messages
 - threads
 - reactions
 - mentions
 - read state
 - attachments
 - tasks
 - meetings
 - retention policy controls

The purpose is not to fully implement future product behavior, but to ensure access rules do not become inconsistent as those entities expand.

---

## 12. Route and read-model governance expectations

Phase 3 must lock the messaging route/read behavior contract.

### 12.1 Required properties

All messaging reads must be:

- org-scoped
- policy-aware
- membership-aware unless an explicit governance exception applies
- safe against indirect leakage through counts, list inclusion, or pagination behavior

### 12.2 Required read surfaces

At minimum, policy consistency must cover:

- conversation list
- conversation detail
- message list
- message detail
- participant list
- thread list
- read-state views
- future safe access seams for tasks/meetings/files if exposed

### 12.3 Denied versus not-found behavior

Phase 3 must define whether the product uses:

- uniform not-found behavior for unauthorized access
- explicit forbidden behavior for some governed contexts
- mixed strategy with deliberate rationale

The choice must be consistent and tested.

### 12.4 Restricted-state UX contract

The system should define safe read shapes or response contracts for:

- restricted conversations visible by metadata but not readable in content
- removed-member states
- governance-blocked states
- archived/locked content where read is allowed but mutation is not

---

## 13. Admin and support workflow expectations

Phase 3 should establish a narrow operational governance layer.

### 13.1 Operational use cases to support

Examples:

- admin freezes a conversation under policy
- admin changes visibility under policy
- admin resolves a participant governance issue
- support actor performs a narrow operational inspection or remediation action

### 13.2 Operational constraints

Any such workflow must:

- require stronger authorization than ordinary membership
- emit audit events
- avoid raw secret/provider leakage in audit metadata
- remain compatible with future enterprise hardening in Phase 11

### 13.3 Deliberate exclusions

Phase 3 should not attempt to build a full enterprise moderation console unless required by an explicit approved scope change.

---

## 14. Audit and compliance expectations

Phase 3 is where auditability becomes part of the governance contract.

### 14.1 Required audit coverage

Governance-sensitive operations should be auditable, including at minimum:

- visibility changes
- participant governance changes
- archive/unarchive or freeze/unfreeze style actions
- admin/support interventions
- policy changes affecting access behavior

### 14.2 Audit data rules

Audit records must:

- be org-scoped
- identify actor and action
- identify affected conversation/message/thread/task/meeting where relevant
- contain safe structured metadata only
- exclude secrets, raw tokens, or unsafe provider-internal detail

### 14.3 Supportability expectations

Phase 3 should make governance flows diagnosable without exposing unsafe internal detail to ordinary users.

---

## 15. Abuse and rate-limit expectations

The canonical PRD requires abuse/rate-limit controls.

Phase 3 should define or implement baseline protection for sensitive messaging routes, especially:

- governance-sensitive mutation routes
- admin/support operational routes
- high-volume content or participant mutation paths if abuse could cause governance failure

If full enforcement is deferred, the Phase 3 document must still define the required protection seams and operational expectations.

---

## 16. Testing strategy for Phase 3

Phase 3 must include targeted tests for:

- authorization and org-boundary enforcement
- membership-required reads
- role-based mutation permissions
- denied/not-found consistency
- restricted-state behavior
- governance audit emission
- admin/support exception safety
- rate-limit or abuse-control behavior for sensitive paths

### 16.1 Minimum test categories

- service-level authorization tests
- read-model visibility tests
- route-level auth and failure-path tests
- audit regression tests
- cross-org negative tests
- removed-member and restricted-view regression tests

### 16.2 Phase-close test expectation

By the end of Sprint 3.4, there should be a coherent test suite proving that Phase 4 can safely build on the authorization/governance backbone without reopening core visibility questions.

---

## 17. Branching and delivery workflow

The canonical PRD defines:

- root branch: `feature/internal-messaging-platform`
- each sprint branches from its phase branch
- each sprint PR merges into the phase branch
- phase branch merges into the root messaging branch after all sprint PRs are complete

For execution clarity, this Phase 3 delivery spec recommends:

- **Phase branch:** `feature/internal-messaging-phase-3-access-control-governance-backbone`
- **Sprint 3.1 branch:** `feature/internal-messaging-phase-3-sprint-1-authorization-access-rules`
- **Sprint 3.2 branch:** `feature/internal-messaging-phase-3-sprint-2-governance-control-plane`
- **Sprint 3.3 branch:** `feature/internal-messaging-phase-3-sprint-3-read-api-visibility-hardening`
- **Sprint 3.4 branch:** `feature/internal-messaging-phase-3-sprint-4-audit-hardening-closeout`

The implementation workflow should be:

1. create the Phase 3 branch from the current approved messaging workflow baseline
2. branch each sprint from the Phase 3 branch
3. merge each sprint PR back into the Phase 3 branch
4. after all Phase 3 sprint PRs are complete and approved, merge the Phase 3 branch into `feature/internal-messaging-platform`

If upstream branch naming is already partially established differently, preserve stack correctness over naming purity.

---

## 18. Phase 3 completion gate

Phase 3 is complete only when:

- org-scoped visibility is real across list, detail, participant, and thread surfaces
- participant and role-based permissions are explicit and enforced consistently
- governance-sensitive actions are policy-bound and audited
- admin/support exception flows are narrow, intentional, and safe
- denied/restricted states behave consistently across routes and read models
- governance/audit regression tests are comprehensive enough to protect later phases
- Phase 4 can begin without reopening the core question of who can see what and under what policy

---

## 19. Recommended next-use output

This document is intended to be the basis for:

- a Sprint 3.1 implementation prompt
- a stacked branch/PR execution plan for Phase 3
- later Phase 3 sprint prompts that remain aligned to the same governance model

---

## 20. Executive summary

Internal Messaging Phase 3 should not be treated as a small auth patch. It is the phase where messaging becomes governable. The current Phase 2.3 baseline already has substantial domain and service infrastructure. Phase 3 must now turn that infrastructure into a trustworthy security and visibility model by locking membership rules, role-based governance, restricted-state behavior, audited operational access, and safe route/read enforcement before realtime delivery begins.
