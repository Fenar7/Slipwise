# Slipwise Client Hub Platform PRD

## 1. Document Purpose

This PRD defines the full Client Hub program for Slipwise.

This is a major platform module, not a portal add-on. It covers:

- a full redesign of the internal customer module into a high-density client operations workspace
- a new Client Hub product for external clients
- deep client-linked autofill for invoices, quotes, vouchers, and related document workflows
- org-default and per-client Client Hub customization
- passwordless email OTP authentication
- client-facing invoice, quote, payment, and informational experiences
- security, audit, supportability, and operational hardening

This PRD is written for product, design, frontend, backend, QA, and engineering leadership. It is meant to be execution-ready and decision-complete.

## 2. Executive Summary

Slipwise already contains important foundations for a client-facing portal experience:

- customer records
- portal routes and portal auth foundations
- invoice public pages
- quote public pages
- payment flows
- portal settings and policies
- customer-linked document relationships

However, the current system is still fragmented.

The internal customer module is not yet strong enough to act as a serious client operations workspace. It is still too thin, too CRUD-oriented, and too weakly connected to the actual business workflows that matter most:

- create client
- manage contacts
- generate invoice
- generate quote
- generate voucher
- enable portal
- send client-facing access
- review payments, balances, and document state

The external portal side also exists in pieces, but it does not yet feel like one polished Client Hub product.

The target state is:

- internal users manage clients from a dense spreadsheet-style workspace
- each client can be independently enabled for Client Hub access
- organizations define one default Client Hub template and selectively override it per client
- clients access the hub through email OTP only
- the Client Hub shows invoices, quotes, balances, payments, products/services, and relevant client-facing context
- creating client-linked documents becomes dramatically faster because core details are automatically fulfilled

The first phase is intentionally dedicated to static UX and shell design only. Functional work begins only after the design system and information architecture for this module are approved.

## 3. Product Vision

### 3.1 Internal vision

The internal customer module should become a real client operations workspace.

It should feel:

- dense but readable
- operational, not decorative
- closer to a premium spreadsheet/data system than a simple form list
- optimized for frequent business usage
- fast for scanning and acting

This workspace should let an operator:

- create and manage clients
- manage client contacts and billing info
- see balances and relationship state
- launch document creation with minimal repeated entry
- manage Client Hub settings and access

### 3.2 External vision

The Client Hub should feel like a premium client-facing product.

It should feel:

- branded
- calm
- modern
- trustworthy
- highly readable
- simple to use on desktop and mobile

The client should be able to:

- log in without a password
- see what is pending
- review invoices
- review quotes
- accept or reject quotes
- choose payment methods
- understand who to contact
- access supporting content such as About, Contact, and Products/Services

### 3.3 Non-goals

This program is not trying to:

- create a second separate portal architecture beside the current one
- build a fully open-ended white-label CMS
- introduce password-based client accounts
- rebuild unrelated modules without clear integration need
- stop at a superficial redesign

## 4. Current Repository Truth

This PRD is grounded in the current repository state.

### 4.1 Existing portal foundation

The repo already contains:

- `src/app/portal/[orgSlug]/...` routes
- portal login and verify pages
- portal dashboard, invoices, quotes, payments, statements, tickets, and profile surfaces
- portal settings pages under `src/app/app/settings/portal/...`
- portal auth and session-related utilities

This means Client Hub must be built as a consolidation and redesign program, not as a greenfield replacement.

### 4.2 Existing customer and document linkage

The repo already contains:

- customer create/edit flows
- customer-linked invoice creation via `customerId`
- customer-linked quote creation via `customerId`
- customer relations in invoice, quote, payment, and portal systems

However, the current linkage is still too shallow. Selecting a client today is not equivalent to full client-driven document autofill.

### 4.3 Existing schema reality

The schema already contains relevant foundations such as:

- organization-level portal configuration
- customer portal tokens
- customer portal sessions
- customer portal access logs
- portal rate-limit buckets
- customer statements
- invoices, quotes, payments, and related document structures

The program should reuse what is structurally sound and refactor what is too narrow.

## 5. Core Problems to Solve

### 5.1 The customer module is too weak

Current customer management is too simple for the real workflows you want.

Missing seriousness today:

- no true spreadsheet-like client operations workspace
- no first-class portal enablement model at the customer level
- insufficient client readiness workflow
- insufficient acceleration for client-linked document creation
- insufficient visibility into balances, document state, and portal state

### 5.2 Document creation still repeats too much data entry

When a user selects an existing client while creating an invoice, quote, or voucher, the system should be able to fulfill much more automatically.

Today the linkage is mostly identity-level. It is not yet a full client defaulting system.

### 5.3 The portal product is fragmented

The current portal foundations exist, but they do not yet form one consistent Client Hub product with:

- clean onboarding
- unified navigation
- branded informational pages
- reliable document actions
- configurable defaults
- clear per-client enablement

### 5.4 Authentication and security need product-level definition

Email OTP sounds simple, but production-grade OTP access requires:

- rate limits
- retry controls
- session lifecycle
- audit trails
- revoked/disabled access behavior
- safe invite and login flows

## 6. Product Goals

### 6.1 Primary goals

1. Redesign the customer module into a serious client operations workspace.
2. Create a polished Client Hub product for clients.
3. Make client portal access a per-client capability.
4. Support org-default templates plus per-client overrides.
5. Make client-linked document creation deeply autofilled and much faster.
6. Use passwordless email OTP authentication only.
7. Make invoice, quote, payment, and related client experiences coherent.
8. Deliver full production-grade security, auditability, and edge-case handling.

### 6.2 Success criteria

The initiative is successful when:

- internal users can manage many clients from one highly scannable workspace
- selecting a client while creating a document fulfills most known fields automatically
- Client Hub enablement is easy and deterministic per client
- clients can authenticate and act without password friction
- the client-facing experience looks and feels like one premium product
- operators can preview and customize the hub without chaos
- the module is secure and supportable in production

## 7. Key Product Decisions

### 7.1 Naming

User-facing name:

- `Client Hub`

Internal continuity:

- data structures may continue using `Customer` where practical
- operator-facing workspace can use `Clients`

### 7.2 Public URL model

Canonical access model:

- org-scoped public hub route first
- client identity resolved after email OTP

This keeps the system aligned with the current portal foundations while supporting future refinements.

### 7.3 Authentication model

Authentication must be:

- email-based
- OTP-based
- passwordless

The system will not include:

- passwords
- password reset
- forgot-password UX

### 7.4 Customization model

Customization must use:

- one org-level default template/config
- selective per-client overrides

The per-client override model must inherit from the org default by default. It must not require every client to be configured independently.

### 7.5 Autofill model

When a user selects a client during document creation, the program must support deep autofill.

At minimum the system should autofill or pre-resolve:

- client identity
- billing contact
- email
- phone
- billing address
- tax identifiers
- default template
- default terms
- default notes
- payment setup defaults
- other client-specific document defaults already known

The operator should mostly need to enter:

- line items
- quantities
- amounts
- document-specific final changes

### 7.6 Scope model

The first full Client Hub program should target the full scope shown in the references, not only a finance-only cut.

That means the PRD should cover:

- invoices
- quotes
- payments
- balances
- About
- Contact
- Products/Services
- relevant jobs/projects style client-facing sections where those are shown in the product direction

## 8. Functional Requirements

## 8.1 Internal Client Operations Workspace

The current customer module must be rebuilt into a premium spreadsheet-like client workspace.

Required characteristics:

- dense row-based list
- strong column scanning
- filters and search
- row quick actions
- detail pane or detail workspace
- balance and document status visibility
- portal status visibility
- fast create/edit flow

The workspace must support:

- create client
- edit client
- manage client contacts
- manage billing and tax fields
- manage lifecycle and tags
- manage portal readiness
- launch client-linked document creation
- preview client-facing hub state

## 8.2 Client Creation and Client Readiness

Client creation must be treated as the beginning of a larger workflow, not a detached CRUD action.

When a client is created, the system should capture or prepare:

- legal/display name
- primary email
- primary phone
- billing address
- tax identifiers
- contact model
- document defaults
- portal eligibility/readiness

The PRD should require an explicit readiness concept for whether a client is actually ready for Client Hub enablement and invite delivery.

## 8.3 Deep Client-Linked Document Creation

The system must make document creation much faster from client context.

Required flows:

- create invoice from client
- create quote from client
- create voucher from client
- prepare future client-linked document flows from the same defaulting engine

Expected behavior:

- select client once
- known fields are fulfilled automatically
- internal user mainly enters items, amounts, quantities, and document-specific final values

This is a core module goal, not a small convenience feature.

## 8.4 Client Hub Enablement

For each client, the system must support:

- enable Client Hub
- disable Client Hub
- copy portal link
- resend invite
- preview effective client-facing hub
- view access status

Enablement is per client and must not rely only on org-global settings.

## 8.5 Org Default Hub Configuration

The system must support organization-level defaults for:

- hero section
- navigation visibility
- About content
- Contact content
- support phone/email
- business hours
- action card visibility
- Products/Services visibility
- document-related quick links

## 8.6 Per-Client Override Configuration

The system must support per-client overrides for:

- content blocks
- contact details
- section visibility
- support details
- custom messaging
- selective navigation overrides

The model must remain controlled and previewable.

## 8.7 Invite and Access Flow

When a client hub is enabled:

- the system should notify the client by email
- the internal user should see delivery state or invite state
- the client should be able to enter the hub using email OTP

The system must support:

- resend invite
- disabled client after prior enablement
- missing/ineligible email
- updated client email after enablement

## 8.8 Client Hub Authentication

Required flow:

1. client opens the public hub route
2. enters email
3. receives OTP
4. enters OTP
5. receives a session
6. accesses Client Hub

Required behaviors:

- OTP expiry
- resend flow
- attempt limits
- rate limiting
- invalid code handling
- safe session logout
- disabled client denial
- access logging

## 8.9 Client Hub Home

After login, the homepage should expose:

- pending invoices
- pending quotes
- remaining balance
- recent or important actions
- quick links to core document modules
- informational cards where configured

The page should be actionable and data-backed, not a decorative landing screen.

## 8.10 Client-Facing Modules

The Client Hub must support live client-facing modules for:

- invoices
- quotes
- payments
- About
- Contact
- Products/Services
- relevant client-facing jobs/projects style sections where configured in scope

Each module must have its own clear entry and live-state behavior.

## 8.11 Invoice Experience

The client must be able to:

- see invoice list
- open invoice detail
- download or print where supported
- start payment flow
- choose payment method where relevant

The experience must be coherent with the rest of the hub.

## 8.12 Quote Experience

The client must be able to:

- see quote list
- open quote detail
- accept quote
- reject quote
- understand current quote status

The flow must safely handle duplicate or stale submissions.

## 8.13 Payment Experience

The client must be able to:

- review amount due
- choose among configured payment methods
- continue to payment flow or instructions

The PRD must keep payment initiation integrated with the hub rather than leaving it as a detached public page.

## 8.14 Informational Pages

The hub must support polished branded content for at least:

- About
- Contact
- Products/Services

These should be editable through org defaults and per-client overrides.

## 9. UX and Design Requirements

### 9.1 Static-first phase rule

The first phase must be entirely dedicated to static design and shell work.

No real functional expansion should begin until:

- the internal client workspace shell is approved
- the client-facing hub shell is approved
- the admin customization shell is approved

### 9.2 Internal workspace design rule

The internal client module should feel like:

- an expert-designed spreadsheet/data system
- dense, fast, and readable
- operationally mature

### 9.3 Client-facing design rule

The external hub should feel:

- premium
- branded
- calm
- readable
- responsive
- consistent across all pages

## 10. Security, Privacy, and Operational Requirements

### 10.1 Internal access control

Only authorized org users may:

- create or modify client hub configuration
- enable or disable client hub for a client
- resend invites
- view client portal activity
- create client-linked documents

### 10.2 Client access control

External clients may only access their own data and allowed hub content.

The system must guard against:

- hub access for disabled clients
- stale invite behavior
- OTP brute force
- session abuse
- cross-client data exposure

### 10.3 Audit and access logging

The program must log or audit at least:

- client hub enable
- client hub disable
- invite sent/resend
- OTP requested
- OTP verified
- session created/revoked
- quote accepted/rejected
- payment initiation events where relevant

### 10.4 Edge cases

The PRD must explicitly require handling of:

- client enabled but email missing
- email changed after invite
- link copied before portal later disabled
- wrong OTP repeated attempts
- stale OTP
- stale document status
- duplicate quote response
- duplicate pay action
- client defaults changed between document creations
- operator overriding autofilled values safely

## 11. Branching and Delivery Workflow

### 11.1 Base branch

- `feature/platform-rebrand-redesign`

### 11.2 Umbrella branch

- `feature/platform-rebrand-redesign-client-hub`

### 11.3 Phase branches

Each phase branches from:

- `feature/platform-rebrand-redesign-client-hub`

### 11.4 Sprint branches

Each sprint branches from its phase branch.

### 11.5 Merge flow

- each sprint opens a PR into its phase branch
- each sprint is reviewed and approved before merge
- each completed phase merges into the umbrella Client Hub branch
- once all phases are complete and verified, the umbrella Client Hub branch merges into `feature/platform-rebrand-redesign`

## 12. Detailed Phase Plan

## Phase 1 — Static UX, Reference Capture, and Frontend Shell

### Goal

Lock all major UX surfaces before functionality work begins.

### Sprints

1. customer workspace shell
2. client detail workspace shell
3. client hub public shell
4. admin customization shell

### Deliverables

- static spreadsheet-style client list
- static client detail workspace
- static OTP login shell
- static dashboard, invoices, quotes, payments, About, Contact, Products/Services pages
- static admin template/customization shell
- screenshot-to-surface reference pack

## Phase 2 — Client Operations Workspace Redesign

### Goal

Turn the customer module into a serious internal client operations product.

### Sprints

1. canonical client list workspace
2. client detail workspace and rails
3. create/edit client redesign
4. contacts, billing, tax, lifecycle, readiness panels
5. duplicate customer surface consolidation

### Deliverables

- one canonical client workspace
- stronger client detail experience
- operational controls for client readiness and financial context

## Phase 3 — Client Hub Configuration and Enablement Model

### Goal

Add the actual client hub control model.

### Sprints

1. org default hub configuration model
2. per-client override model
3. per-client enable/disable and status lifecycle
4. preview, copy link, resend invite, admin workflow

### Deliverables

- org default config
- per-client override layer
- client hub status and readiness model

## Phase 4 — Deep Autofill and Document Acceleration

### Goal

Make client-linked document creation deeply fulfilled instead of shallowly linked.

### Sprints

1. invoice autofill engine
2. quote autofill engine
3. voucher and related document autofill engine
4. shared client defaulting system
5. override, stale-data, and edge-case controls

### Deliverables

- shared client-driven defaulting engine
- deep autofill for invoice, quote, voucher creation
- controlled operator override behavior

## Phase 5 — Client Auth, Onboarding, and Access Security

### Goal

Make Client Hub safely reachable by real clients.

### Sprints

1. canonical public access route and eligibility
2. OTP request, verify, and session lifecycle
3. invite delivery and onboarding state
4. rate limits, logs, and access hardening

### Deliverables

- passwordless auth flow
- invite/onboarding flow
- access logging and abuse protection

## Phase 6 — Live Client Hub Modules

### Goal

Turn the approved shell into a real client product.

### Sprints

1. live dashboard, balances, and pending actions
2. invoices and payment experience
3. quotes and response experience
4. products/services, jobs/projects style modules, About, Contact, and supporting polish

### Deliverables

- live client dashboard
- live invoices and payments
- live quote action flows
- full client-facing module set for the defined scope

## Phase 7 — Hardening, Analytics, Compatibility, and Closeout

### Goal

Make the module safe to merge back into the redesign branch.

### Sprints

1. edge-case and security hardening
2. analytics, supportability, and audit closeout
3. legacy compatibility, final regression, and release closeout

### Deliverables

- production-grade edge-case handling
- operator support visibility
- compatibility and regression closeout

## 13. Test Strategy

The program must include:

- visual QA for static surfaces
- client workspace interaction tests
- client creation and edit regression tests
- deep autofill tests for invoices, quotes, and vouchers
- per-client enablement tests
- org default vs per-client override precedence tests
- OTP request/verify/session tests
- invite and resend flow tests
- invoice payment and quote accept/reject tests
- duplicate action safety tests
- rate-limit and access-log tests
- final end-to-end operator-to-client flow tests

## 14. Screenshot Reference Workflow

The engineering and design teams must maintain the screenshot references under:

- `docs/PRD/references/client-hub/`

This reference pack should map screenshots to:

- target surface
- target phase
- target sprint
- visual intent
- behavioral intent

This prevents visual requirements from being lost across long implementation cycles.

## 15. Delivery Standard

The Client Hub program is complete only when:

- the internal client module is a serious operations workspace
- deep client-linked document autofill is real and reliable
- each client can be independently enabled for Client Hub
- org defaults and per-client overrides are both usable
- clients can authenticate with email OTP safely
- the hub exposes invoices, quotes, payments, informational pages, and related actions in one polished system
- security, audit, and supportability are strong enough for production
