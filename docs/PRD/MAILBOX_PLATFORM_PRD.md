# Slipwise Mailbox Platform PRD

**Document Version:** 4.0  
**Date:** May 2026  
**Product:** Slipwise  
**Prepared by:** Product / Engineering Planning  
**Status:** Canonical mailbox execution PRD

---

## Table of Contents

1. Executive Summary  
2. Product Vision  
3. Problem Statement  
4. Product Goals  
5. Scope and Explicit Non-Goals  
6. Locked Product Decisions  
7. Users, Roles, and Operating Model  
8. Product Principles  
9. Mailbox Information Architecture  
10. Mailbox Workspace Design  
11. Mailbox Navigation and Multi-Account Model  
12. Thread List Design  
13. Thread Reading Pane Design  
14. Compose, Reply, Reply-All, and Forward Design  
15. Search, Filters, and Smart Views  
16. Attachments Experience  
17. Linked Context and Work Metadata  
18. Settings, Connections, and Admin UX  
19. Responsive and Mobile Direction  
20. States, Errors, and Edge Cases  
21. Permissions and Governance  
22. Domain Model and Internal Interfaces  
23. Gmail Provider Strategy  
24. Sync, Reconciliation, and Reliability Model  
25. Security, Audit, and Compliance  
26. Metrics, Diagnostics, and Supportability  
27. Delivery Workflow: Branches, Phases, and Sprints  
28. Detailed Phase Plan  
29. Acceptance Criteria  
30. Test Plan  
31. Risks and Product Warnings  
32. Future Expansion  
33. Final Product Definition

---

## 1. Executive Summary

Slipwise will introduce a new top-level **Mailbox** module as a production-grade, Gmail-first shared inbox and customer communication workspace.

This is not a lightweight settings integration. It is a first-class product area that must support day-to-day customer communication work inside Slipwise. The mailbox should feel familiar enough that users coming from Gmail can operate it immediately, while also supporting a more structured multi-mailbox model inspired by Apple Mail.

The product direction is intentionally ambitious:

- Gmail is the first provider
- the platform must later support Zoho Mail without major re-architecture
- the product is built around shared operational inboxes, not private personal mailboxes
- organizations can connect multiple Gmail mailboxes/accounts
- the inbox experience must feel complete, not like a wrapper around Gmail APIs
- the first delivery phase must lock the entire mailbox product UX as a static but realistic product surface before backend sync and provider logic are implemented

This PRD defines the complete mailbox initiative at a production level:

- user model
- interface model
- module breakdown
- multi-mailbox behavior
- assignment and workflow state
- Gmail platform direction
- sync, security, and audit foundations
- branch / phase / sprint workflow
- detailed phased implementation sequence

This document is intentionally long and explicit because the mailbox module is a large subsystem, not a single feature.

---

## 2. Product Vision

Slipwise Mailbox should become the organization’s central workspace for customer email communication.

The experience should feel like:

- a familiar, trustworthy email client
- a structured team inbox
- a customer communication control center
- a Slipwise-native operational tool that knows about customers, invoices, vouchers, quotes, statements, and work ownership

The product should not feel like:

- a thin Gmail integration
- a settings page that opens a list of raw emails
- a personal inbox clone with no business context
- a “future-ready” shell that still forces users back to Gmail to do real work

The ideal end state is that a finance or operations user can do almost all customer-email work from Slipwise:

- read inbound email
- triage threads
- reply or forward
- assign conversations
- track open/pending/closed states
- see attachments
- connect threads to customer and document records
- switch across multiple organization mailboxes

The first major milestone toward that end state is a fully designed mailbox module that is detailed enough to drive implementation without redesign churn.

---

## 3. Problem Statement

Slipwise currently has outbound email primitives, some integration patterns, and settings surfaces, but it does not have a true mailbox product.

Current limitations:

- there is no shared inbox workspace
- there is no top-level mailbox module
- there is no multi-account or multi-mailbox model
- there is no normalized thread/message domain
- there is no inbox UI for reading and triaging customer email
- there is no assignment workflow for email conversations
- there is no mailbox-specific record-linking experience
- there is no mailbox connection administration surface designed for operations users

If mailbox is built incrementally without a locked product design, the likely failure modes are:

1. the UI becomes a shallow message list with missing operational workflows
2. multi-mailbox support is patched in later and causes IA confusion
3. Gmail-specific assumptions leak into the product model
4. inbox interactions feel foreign to Gmail users and increase friction
5. settings, inbox, composer, and thread context are designed in isolation and do not feel like one system

Because mailbox is a large subsystem, the product needs a detailed canonical spec before implementation is broken into delivery phases.

---

## 4. Product Goals

### 4.1 Primary product goals

Build a mailbox platform that:

- centralizes inbound and outbound customer email
- supports collaborative team workflows
- supports multiple Gmail mailboxes per org
- preserves strong inbox muscle memory for Gmail users
- allows switching across mailbox accounts cleanly
- lets users work email without leaving Slipwise
- connects conversations to Slipwise business records
- supports assignment and workflow state as first-class concepts
- remains secure, org-isolated, and auditable
- is architected so future providers can plug into the same product model

### 4.2 Phase 1 goal

The first phase goal is narrower but very important:

Create a **full static, production-grade mailbox design** that covers the entire module core, including all major screens and interaction states, so later engineering phases can implement against a locked product and layout model.

### 4.3 UX goals

The mailbox experience should:

- feel immediately understandable to users who know Gmail
- support multiple mailboxes with Apple-Mail-style clarity
- make high-frequency inbox work fast
- expose thread-level quick actions directly
- clearly indicate mailbox identity, assignment, status, and linked record context
- look complete and trustworthy

### 4.4 Product success criteria

The mailbox initiative is successful when:

- owners/admins can connect multiple Gmail mailboxes
- authorized team members can work inboxes from inside Slipwise
- the module feels like a serious product, not a feature add-on
- mailbox-specific workflows feel native to Slipwise
- later Zoho implementation can reuse the product foundation

---

## 5. Scope and Explicit Non-Goals

### 5.1 In scope for the full mailbox initiative

- top-level Mailbox product module
- multiple Gmail mailbox connections per org
- aggregated “All Inboxes” view
- mailbox/account grouping
- smart mailbox views
- thread list and thread detail workspace
- compose, reply, reply-all, and forward
- attachment display and outbound attachment support
- assignment and workflow state
- linked customer/document context
- mailbox settings and permissions
- mailbox diagnostics, health, and recovery surfaces
- Gmail OAuth, sync, and send in later phases

### 5.2 In scope for Phase 1 static design

- mailbox workspace shell
- left navigation rail
- top command/search bar
- thread list
- thread reading pane
- compose/reply/forward surfaces
- attachment UI
- multi-account and mailbox navigation
- search and filters UX
- linked context panel
- mailbox settings and connection surfaces
- admin-only and restricted states
- empty, loading, degraded, and reconnect-required states
- responsive behavior direction

### 5.3 Out of scope for the first delivery phase

- real Gmail OAuth
- real mailbox sync
- real outbound mail send flow
- real attachment upload/download
- real search indexing
- real record linking logic
- Zoho implementation
- AI summarization, drafting, classification, or triage
- advanced rules engine / routing / SLA automation
- calendar integration
- contacts sync
- mobile-native app implementation

### 5.4 Out of scope for the overall first release

- generic IMAP/SMTP provider framework for arbitrary providers
- personal/private per-user inbox model
- full Gmail parity for every advanced feature
- email marketing or campaign tooling
- full internal collaboration suite beyond mailbox-specific metadata

---

## 6. Locked Product Decisions

### 6.1 Provider strategy

- Gmail is the only provider in v1.
- The platform must be designed for future Zoho Mail support.
- Gmail API is the target integration model, not IMAP/SMTP.

### 6.2 Product model

- shared mailbox model
- multiple shared mailboxes/accounts per org
- thread-first operational model
- top-level product module
- Slipwise-owned workflow state

### 6.3 UX direction

- familiar, branded
- Gmail-like structural familiarity for inbox interactions
- Apple Mail-like multi-account grouping clarity
- Slipwise-specific context, permissions, and work metadata layered into the experience

### 6.4 User access model

- Owner/Admin manage connections and mailbox governance
- permitted ops/finance roles work mailbox threads
- users are not assumed to have access to all mailboxes by default

### 6.5 Delivery direction

- static design first
- backend foundation after the product shell is locked
- dedicated mailbox root branch
- phase branches under mailbox root
- sprint branches under phase branches

### 6.6 Shared inbox behavior

- thread assignment is Slipwise-native
- thread status is Slipwise-native
- mailbox visibility is mailbox-scoped and permission-aware
- provider folders are secondary metadata, not the primary work system

---

## 7. Users, Roles, and Operating Model

### 7.1 Primary users

The primary users for mailbox are:

- organization owner
- organization admin
- finance operations
- accounts receivable / customer operations
- document-heavy operational staff

### 7.2 Typical work contexts

Mailbox will be used for:

- invoice follow-up
- payment communication
- voucher coordination
- quote conversations
- sending and receiving supporting documents
- customer back-and-forth that needs to stay attached to business records

### 7.3 Ownership and governance

Mailboxes are organizational assets, not personal assets.

That means:

- a mailbox can be connected by an admin but used by multiple authorized staff
- a thread can be assigned to one primary owner while remaining visible to others
- the mailbox list must show both account identity and shared operational context

### 7.4 User expectations

Because inbox is a high-frequency productivity tool, users will expect:

- low-friction navigation
- familiar row scanning behavior
- quick actions with minimal clicks
- stable thread identity
- reliable attachment handling
- obvious reply/send entry points

Any design that feels like an unfamiliar “custom CRM inbox” instead of a real email client will create friction.

---

## 8. Product Principles

### 8.1 Familiarity without cloning

The product should strongly resemble the interaction logic people already know from Gmail, but not literally clone Gmail’s visuals. Slipwise should feel recognizable as Slipwise.

### 8.2 Multi-mailbox clarity from day one

The UI must clearly communicate:

- all inboxes vs one inbox
- one account vs multiple accounts
- smart views vs provider folders
- where the next reply will send from

This cannot be deferred because multi-mailbox support is in scope from the beginning.

### 8.3 Operational context is first-class

Mailbox is not just a reading surface. It is a work surface. The product must visibly account for:

- assignment
- status
- linked records
- mailbox permissions
- customer context

### 8.4 Progressive disclosure

The design should surface the most common actions first:

- read
- reply
- forward
- flag
- archive
- assign

More advanced administration, diagnostics, or mailbox settings should be accessible but not clutter the main work area.

### 8.5 Production-quality static phase

The static design phase must be treated seriously. It is not a temporary wireframe sprint. It should result in a design/implementation shell that is realistic enough for:

- product review
- stakeholder approval
- engineering implementation planning
- later backend integration without IA churn

---

## 9. Mailbox Information Architecture

### 9.1 Top-level app structure

Add a new top-level navigation item:

- `Mailbox`

This should sit alongside other major Slipwise modules and should not be buried in settings or inside a customer detail page.

### 9.2 Primary mailbox surfaces

The mailbox initiative includes four main surface categories:

1. **Mailbox workspace**
   - the daily inbox work area
2. **Mailbox settings and connections**
   - account connection and governance
3. **Mailbox support / diagnostics**
   - sync state, reconnect, admin support
4. **Embedded mailbox context**
   - later contextual views from customer/document modules

### 9.3 Product hierarchy

The primary hierarchy is:

- top-level Mailbox module
  - mailbox workspace
  - mailbox-specific views
  - mailbox settings and admin surfaces

Secondary embedded mailbox surfaces may later appear in:

- customer pages
- invoice detail pages
- voucher detail pages

But these do not replace the top-level module.

### 9.4 Phase 1 IA responsibility

The Phase 1 static design must define:

- desktop navigation layout
- mobile flow direction
- the relationship between navigation, thread list, and reading pane
- where search lives
- where context lives
- where settings/admin functions live

---

## 10. Mailbox Workspace Design

### 10.1 Overall layout model

The default desktop layout should be a three-zone workspace:

1. **Left rail**
   - mailbox navigation and account structure
2. **Center pane**
   - thread list
3. **Right pane**
   - thread detail / reading pane

There should also be:

- a top command/search bar
- a compose entry point
- optional right-side utility/context rail patterns where needed later

### 10.2 Layout goals

The layout should optimize for:

- rapid scanning
- minimal mode switching
- clear persistent navigation
- obvious active mailbox context
- short distance between inbox scan and reply action

### 10.3 Layout states

The workspace must handle:

- no thread selected
- one thread selected
- compose overlay open
- filter state active
- smart mailbox view active
- single-mailbox view active
- aggregated all-inboxes view active

### 10.4 Layout density

The design should prefer a professional, dense-but-readable inbox layout rather than oversized CRM cards. Email is a high-volume workflow. Wasted space makes triage slower.

### 10.5 Responsiveness

The static design must define how the workspace collapses:

- desktop: full 3-zone layout
- tablet: collapsible left rail, narrower detail pane
- mobile: stacked flow and full-screen panels

---

## 11. Mailbox Navigation and Multi-Account Model

### 11.1 Core requirement

The mailbox must support multiple Gmail accounts/mailboxes per organization. This is not optional or future scope.

### 11.2 Navigation inspiration

The navigation model should blend:

- Gmail’s familiar left-side mailbox navigation
- Apple Mail’s clear grouping of accounts and folders

### 11.3 Left rail sections

The left rail should include:

#### Section A — Global views
- All Inboxes
- Unread
- Assigned to me
- Unassigned
- Flagged / Starred
- Waiting / Pending
- Closed / Archived

#### Section B — Connected accounts / mailboxes
For each connected mailbox/account:
- account display name
- email address or mailbox name
- expand/collapse behavior
- mailbox-specific folders/views

#### Section C — Mailbox folders/views
Per mailbox, supported or planned views include:
- Inbox
- Starred
- Drafts
- Sent
- Archive
- Trash / Bin
- Spam / Junk

#### Section D — Admin/support shortcuts
Visible to privileged users:
- Manage mailboxes
- Mailbox settings
- Mailbox diagnostics / health

### 11.4 All Inboxes behavior

`All Inboxes` is an aggregated operational view across all mailboxes the user is allowed to see.

Design requirements:

- each row must show which mailbox/account it came from
- unread counts should aggregate cleanly
- sending or replying from aggregated view must still show the actual sending identity clearly

### 11.5 Smart mailbox views

Smart views are Slipwise-owned views that may span mailboxes. They are not provider folders.

Examples:

- Assigned to me
- Unassigned
- Needs reply
- Has attachments
- Linked to record
- Flagged
- Unread

The design must distinguish these from Gmail folders so users understand what is a Slipwise workflow view versus a provider-native mailbox view.

### 11.6 Account grouping behavior

Each mailbox/account group should support:

- expand/collapse
- unread badge counts
- active highlight
- mailbox identity icon/avatar
- permission-aware visibility

### 11.7 Mailbox source clarity

Wherever the user may lose track of mailbox identity, the product should show:

- account name
- email address or mailbox label
- active sender identity if replying or composing

This is especially important in all-inboxes aggregated mode.

---

## 12. Thread List Design

### 12.1 Thread list purpose

The thread list is the main scanning and triage surface. It must support high-volume use by users who process many conversations per day.

### 12.2 Thread row anatomy

Each row should have a stable visual structure including:

- sender/customer display name
- sender avatar or identity marker where useful
- subject line
- message snippet preview
- timestamp
- unread styling
- mailbox/account indicator when needed
- attachment indicator
- flagged/starred indicator
- assignment indicator
- linked-record indicator
- status indicator if needed

### 12.3 Thread row quick actions

Each row should surface fast actions that reduce navigation friction.

Required actions:

- reply
- forward
- flag/star
- archive
- delete
- assign
- mark unread/read

Design goal:

- actions should be easy to discover
- actions should not visually overwhelm the row
- hover-driven or compact persistent affordances are acceptable
- the pattern should still work cleanly on touch/mobile later

### 12.4 Row states

Each row must account for:

- unread
- read
- selected
- hovered
- multi-selected
- flagged
- assigned
- attachment-present
- linked-record-present
- error/degraded placeholder if needed later

### 12.5 Density and content priority

The row must prioritize:

1. who it is from
2. what the thread is about
3. whether it is new/important/actionable
4. which mailbox it belongs to

Rows should avoid large empty space or oversized card behavior.

### 12.6 Bulk selection and bulk actions

The product should reserve a clear pattern for:

- selecting multiple threads
- applying bulk archive/delete/assign/read actions

Phase 1 only needs static states, but the design must leave room for these controls.

### 12.7 Sorting and list controls

The list model should anticipate:

- recent default sort
- unread-first or filtered states
- flagged
- assigned
- mailbox/account filtered
- search results

### 12.8 Search result rows

Search result rows should remain consistent with inbox rows but may show:

- why the result matched
- mailbox source
- search term emphasis

### 12.9 Empty list states

The thread list must include empty states for:

- no messages in mailbox
- no results for search
- no threads matching filter
- no assigned threads
- no unread threads

---

## 13. Thread Reading Pane Design

### 13.1 Thread detail purpose

The reading pane is where users read conversation history and take action without context switching.

### 13.2 Required header content

The thread detail header should show:

- thread subject
- participants
- mailbox identity
- timestamp summary
- key actions
- status/assignment summary

### 13.3 Message stack behavior

Threads should render as conversation stacks rather than disconnected messages.

Required behavior:

- newest message visible and emphasized
- older messages collapsible or expandable
- message boundaries clearly visible
- participant identity readable
- HTML-rendered body safe and readable

### 13.4 Reading actions

The pane must support:

- reply
- reply all
- forward
- flag/star
- archive
- delete
- assign
- mark unread
- close/reopen thread

### 13.5 Detail-pane context

The pane should make it obvious:

- which mailbox this thread belongs to
- who is assigned
- what the current thread state is
- whether there are linked records

### 13.6 Attachment presentation

Attachments should appear in a clearly defined area, typically:

- under the latest relevant message
- with filename, size, and attachment affordance
- optionally with “Download all” if multiple attachments exist

### 13.7 Reply entry pattern

The detail pane should accommodate:

- inline reply inside thread
- launch to expanded composer

Both patterns should be accounted for in Phase 1 design.

### 13.8 No thread selected state

When no thread is selected, the detail pane should not feel broken. It should show a clean empty state such as:

- a mailbox prompt
- summary of the current mailbox/view
- optional shortcuts or tips

---

## 14. Compose, Reply, Reply-All, and Forward Design

### 14.1 Compose philosophy

The composer should feel familiar to Gmail users:

- compact default compose
- expandable full composer
- inline reply option for thread work

### 14.2 Supported flows

Phase 1 must include static designs for:

- new message
- reply
- reply all
- forward
- draft-like composer state
- inline thread reply
- detached/expanded composer

### 14.3 Required fields

The compose experience must support:

- From
- To
- Cc
- Bcc
- Subject
- body editor
- attachments
- send button

### 14.4 Required controls

- close/discard
- expand
- attachment add/remove
- open Cc/Bcc
- optionally save-draft placeholder state

### 14.5 Sending identity clarity

If multiple mailboxes are available for the acting user, the compose/reply surface must show clearly:

- which mailbox/account the message will send from
- whether the sender identity is fixed by thread context or selectable

### 14.6 Rich text expectations

The design should anticipate a rich text editor with:

- bold
- italic
- underline
- lists
- links
- alignment/basic formatting

Phase 1 does not need a real editor implementation, but the UI surface must be planned.

### 14.7 Attachments in composer

Attachments should be visible as:

- chips
- cards
- filenames with sizes
- removable items

### 14.8 Send state placeholders

The design should account for:

- sending
- send success
- send failure
- draft retained / draft warning

---

## 15. Search, Filters, and Smart Views

### 15.1 Search role

Search is a primary mailbox behavior and should be persistently accessible from the top command bar.

### 15.2 Search scope

The product must support at least these future scopes:

- current mailbox
- all accessible mailboxes
- filtered views

Phase 1 should make room for this behavior visually.

### 15.3 Filter types

The mailbox should support visible filter models for:

- unread
- assigned to me
- unassigned
- flagged
- has attachments
- linked to records
- mailbox/account
- date range
- open / pending / closed

### 15.4 Smart view behavior

Smart views are not simply saved provider folders. They are product-owned operational views that help triage work.

### 15.5 Active filter clarity

The design should clearly show:

- which filters are active
- whether user is in a smart view or provider folder
- which mailbox context is active

### 15.6 Search results empty state

No-results states should be explicit and helpful, not blank:

- zero results for query
- zero results after filters
- optional prompt to clear filters

---

## 16. Attachments Experience

### 16.1 Attachment requirements

Attachments are an important mailbox behavior and must be first-class in the design.

### 16.2 Inbound attachment display

The design should show:

- filename
- file type
- size
- multiple attachments clearly grouped
- “Download all” pattern if relevant

### 16.3 Outbound attachment display

Composer must show:

- attachment list
- remove action
- upload/add placeholder
- current count

### 16.4 Attachment-heavy thread behavior

The design should work when:

- a thread has several attachments
- attachments come from multiple messages
- user is replying with more attachments

### 16.5 Security implication

Even though Phase 1 is static, the design must anticipate:

- secure download
- server-authorized access
- no casual direct file exposure

---

## 17. Linked Context and Work Metadata

### 17.1 Why linked context matters

The main thing that distinguishes Slipwise Mailbox from a generic inbox is business context.

Threads must eventually connect to:

- customers
- invoices
- quotes
- vouchers
- statements

### 17.2 Context panel purpose

The context panel should help users understand:

- who the conversation belongs to
- what business record it relates to
- who owns the thread operationally
- what the current work state is

### 17.3 Required context blocks

Phase 1 should include static designs for:

- customer summary card
- linked invoice card
- linked voucher card
- linked quote card
- suggested links placeholder
- assignment block
- status block
- internal notes placeholder
- activity placeholder

### 17.4 Assignment UX

Thread assignment should be visible in:

- thread row summary
- thread detail header
- context panel/action area

### 17.5 Status UX

Slipwise statuses should include:

- open
- pending
- closed
- archived

The design must make these statuses obvious and fast to act on.

### 17.6 Link and unlink actions

The static design should account for:

- link record
- unlink record
- accept suggested link
- change primary link

---

## 18. Settings, Connections, and Admin UX

### 18.1 Admin surface purpose

Mailbox administration should feel like a product management surface, not a developer integration page.

### 18.2 Required admin surfaces

The product should include:

- connected mailboxes list
- connect Gmail mailbox flow
- mailbox display name and mailbox label configuration
- mailbox visibility and role access settings
- mailbox health / sync state summary
- reconnect/disconnect flows
- admin diagnostics / support placeholder

### 18.3 Mailbox connection list

Each connected mailbox card/row should show:

- mailbox display name
- email address
- provider
- connection status
- last sync summary
- permission summary
- actions

### 18.4 Connection flow design

The Gmail connection flow should feel like a guided integration experience:

- connect CTA
- choose or label mailbox
- permission explanation
- success state
- reconnect-required state

### 18.5 Permissions design

Admins should be able to understand:

- who can see this mailbox
- who can work this mailbox
- who can manage this mailbox

### 18.6 Diagnostics and support

Mailbox diagnostics/support should exist, but should not visually overshadow the core inbox work area.

Phase 1 only needs static support/admin states, not real diagnostics behavior.

---

## 19. Responsive and Mobile Direction

### 19.1 Desktop is primary

Mailbox is primarily a desktop-heavy productivity workflow, so desktop layout is the main design priority.

### 19.2 Tablet direction

Tablet should:

- collapse the left rail
- keep thread list and detail accessible
- allow compose as drawer/full screen

### 19.3 Mobile direction

Mobile should not attempt to preserve the full 3-pane layout. Instead:

- mailbox list / mailbox views
- thread list
- thread detail
- full-screen composer

### 19.4 Mobile design responsibility in Phase 1

Phase 1 does not need a complete mobile product implementation, but it must define:

- layout collapse rules
- critical mobile screen flows
- compose behavior direction

---

## 20. States, Errors, and Edge Cases

### 20.1 Required primary states

The static design must explicitly include:

- no mailbox connected
- mailbox connected, inbox empty
- no thread selected
- loading mailbox
- loading thread
- search no results
- restricted mailbox access
- reconnect required
- degraded sync
- send failed
- message action unavailable

### 20.2 No mailbox connected state

This should not feel like an error dump. It should:

- explain what mailbox does
- explain that no Gmail mailbox is connected yet
- give owner/admin a clear connect/setup path

### 20.3 Empty inbox state

This should distinguish between:

- mailbox exists but has no messages
- filter or smart view has no messages

### 20.4 Restricted access state

If the user lacks permission:

- explain they do not have access
- avoid showing mailbox content
- point to admin-owned access model if useful

### 20.5 Reconnect/degraded state

These states should show:

- mailbox exists
- connection or sync is degraded
- reconnect/admin action required

### 20.6 Failure-state quality bar

Failure states must be product-quality and human-readable. They must not expose raw implementation jargon as the primary message.

---

## 21. Permissions and Governance

### 21.1 Connection governance

Only Owner/Admin should be able to:

- connect a mailbox
- disconnect a mailbox
- change mailbox visibility
- change mailbox-level permissions
- view connection health diagnostics

### 21.2 Operational permissions

Authorized ops/finance roles may be permitted to:

- read mailbox content
- reply
- reply all
- forward
- send new message if policy allows
- assign threads
- change thread status
- link/unlink records
- download attachments

### 21.3 Design implications

The design must account for:

- permission-restricted mailboxes not appearing
- restricted actions appearing disabled or hidden appropriately
- admin-only settings screens
- mailbox-specific role scoping

### 21.4 Server enforcement

All final mailbox mutations must be server-enforced later. Static design should not assume UI-only governance.

---

## 22. Domain Model and Internal Interfaces

The mailbox module requires a first-class domain model. Even though Phase 1 is UI-first, the UX must be shaped around the future domain, not temporary mock objects.

### 22.1 MailboxConnection

Represents a connected Gmail mailbox/account for an organization.

Expected fields:

- `id`
- `orgId`
- `provider`
- `providerAccountId`
- `emailAddress`
- `displayName`
- `status`
- `tokenRef`
- `tokenExpiry`
- `watchMetadata`
- `lastSyncAt`
- `lastSyncError`
- `createdAt`
- `updatedAt`

### 22.2 MailboxThread

Represents a normalized conversation.

Expected fields:

- `id`
- `orgId`
- `mailboxConnectionId`
- `providerThreadId`
- `subject`
- `participantsSummary`
- `lastMessageAt`
- `unreadCount`
- `status`
- `assigneeId`
- `isFlagged`
- `primaryLinkSummary`
- `createdAt`
- `updatedAt`

### 22.3 MailboxMessage

Represents an individual message.

Expected fields:

- `id`
- `orgId`
- `threadId`
- `providerMessageId`
- `rfcMessageId`
- `direction`
- `from`
- `to`
- `cc`
- `bcc`
- `subject`
- `htmlBody`
- `textBody`
- `snippet`
- `sentAt`
- `receivedAt`
- `attachmentCount`
- `providerMetadata`
- `createdAt`
- `updatedAt`

### 22.4 MailboxAttachment

Expected fields:

- `id`
- `messageId`
- `providerAttachmentId`
- `filename`
- `mimeType`
- `size`
- `isInline`
- `storageRef`

### 22.5 MailboxParticipant

Expected fields:

- `email`
- `displayName`
- `roleSummary`

### 22.6 MailboxThreadLink

Represents a thread-to-business-record relationship.

Expected fields:

- `id`
- `threadId`
- `entityType`
- `entityId`
- `isPrimary`
- `createdBy`
- `createdAt`

### 22.7 MailboxSyncState

Represents sync and reconciliation state.

Expected fields:

- `mailboxConnectionId`
- `cursor`
- `lastReconciledAt`
- `lastError`
- `degradedState`
- `watchExpiry`

### 22.8 MailboxDraft

Represents a persisted compose or reply draft.

Expected fields:

- `id`
- `orgId`
- `mailboxConnectionId`
- `threadId`
- `mode`
- `fromIdentity`
- `to`
- `cc`
- `bcc`
- `subject`
- `htmlBody`
- `textBody`
- `attachmentRefs`
- `status`
- `lastAutosavedAt`
- `createdBy`
- `createdAt`
- `updatedAt`

### 22.9 MailboxAssignment

Represents ownership and workflow responsibility for a thread.

Expected fields:

- `id`
- `orgId`
- `threadId`
- `assigneeId`
- `assignedBy`
- `status`
- `assignedAt`
- `updatedAt`

### 22.10 MailboxAuditEvent

Represents mailbox-specific operational audit history.

Expected fields:

- `id`
- `orgId`
- `mailboxConnectionId`
- `threadId`
- `messageId`
- `actorId`
- `action`
- `summary`
- `metadata`
- `createdAt`

### 22.11 MailboxProviderCursor

Represents provider-specific sync checkpoints.

Expected fields:

- `id`
- `orgId`
- `mailboxConnectionId`
- `provider`
- `cursorType`
- `cursorValue`
- `expiresAt`
- `lastAdvancedAt`
- `createdAt`
- `updatedAt`

### 22.12 Provider interfaces

The mailbox subsystem must later define stable provider-facing contracts for:

- `connectMailbox`
- `refreshMailboxAuthorization`
- `listMailboxFoldersOrViews`
- `syncMailboxDelta`
- `fetchThreadDetail`
- `fetchAttachmentMetadata`
- `sendMessage`
- `replyToThread`
- `forwardMessage`
- `disconnectMailbox`

The product should never directly depend on raw Gmail-specific payload shapes beyond the provider adapter layer.

### 22.13 UI-facing shapes

The UI will later need stable shapes for:

- `MailboxTreeItem`
- `MailboxThreadListItem`
- `MailboxThreadDetail`
- `MailboxComposerState`
- `MailboxSearchState`
- `MailboxHealthState`
- `MailboxDiagnosticsSummary`

The Phase 1 design should anticipate these stable interface boundaries.

---

## 23. Gmail Provider Strategy

### 23.1 Gmail-first direction

Gmail is the first implemented provider because:

- it is widely used
- users will already have Gmail muscle memory
- it provides a credible first integration target

### 23.2 Protocol choice

Use Gmail API, not IMAP/SMTP.

### 23.3 Product-model rule

The product may visually resemble Gmail, but it must not become Gmail-specific in its internal data model or UX assumptions where avoidable.

### 23.4 Future-provider rule

When Zoho is later added:

- the same mailbox workspace should remain valid
- the same thread/message/linking/assignment model should still work
- only provider implementation details should vary

---

## 24. Sync, Reconciliation, and Reliability Model

This section matters for the production PRD even though the first delivery phase is static.

### 24.1 Sync architecture

The mailbox platform will later require:

- initial backfill sync
- incremental delta sync
- scheduled reconciliation
- watch/subscription renewal

The implementation sequence should explicitly separate:

- connection establishment
- initial thread/message ingestion
- provider checkpoint advancement
- backfill continuation
- attachment metadata hydration
- reconciliation and replay tooling

### 24.2 Reliability requirements

The platform must later be:

- replay-safe
- idempotent
- retry-safe
- mailbox-scoped in concurrency
- visible when degraded

### 24.3 UI implication

Because sync can degrade in real life, the product must already reserve UX for:

- syncing
- stale data
- reconnect required
- mailbox degraded
- mailbox healthy

### 24.4 Send reliability

Send/reply flows must later account for:

- duplicate protection
- correct sender identity
- thread reconciliation
- send failures

Phase 1 should reflect these realities in error-state planning.

### 24.5 Sync model rule

Gmail should be treated as a mailbox provider with:

- API-driven initial sync
- incremental checkpoint-based refresh
- scheduled reconciliation safety pass
- explicit degraded/reconnect-needed states

The PRD should not assume a single always-live webhook path is sufficient for operational reliability.

---

## 25. Security, Audit, and Compliance

### 25.1 Security expectations

The mailbox platform will require:

- encrypted token storage
- strict OAuth state validation
- server-authorized attachment access
- HTML sanitization for message bodies
- remote content safety
- org-scoped data access

### 25.2 Audit expectations

The platform must later audit:

- mailbox connect/disconnect
- reconnect actions
- message send/reply/forward
- assignment changes
- status changes
- link/unlink actions
- manual sync / support actions where relevant

### 25.3 Design implications

The product should make sensitive actions feel intentional:

- disconnect mailbox
- change permissions
- delete/archive thread
- send from mailbox identity

The static phase should not ignore these operational realities.

---

## 26. Metrics, Diagnostics, and Supportability

### 26.1 Operational support need

Mailbox is a system users will rely on daily. Supportability cannot be an afterthought.

### 26.2 Future metrics to support

Later phases should track:

- mailbox sync health
- send failures
- reconnect-required state
- unread/open/pending volume
- mailbox utilization

### 26.3 Diagnostics/admin UX

The product should reserve later admin surfaces for:

- mailbox status
- last sync
- degraded state
- reconnect guidance
- mailbox-level support diagnostics

These should exist, but not clutter the main inbox experience.

### 26.4 Telemetry and launch observability

The later implementation phases must also track:

- mailbox connect success/failure
- sync lag
- sync error classes
- send success/failure
- reply latency
- mailbox count per org
- thread volume by mailbox
- operator recovery usage

This telemetry is required for launch readiness and cannot be left as an afterthought.

---

## 27. Delivery Workflow: Branches, Phases, and Sprints

### 27.1 Root branch

The mailbox initiative should use a dedicated root branch:

- `feature/mailbox-platform`

### 27.2 Phase branch naming

Recommended phase branches:

- `feature/mailbox-platform-phase-1-static-design`
- `feature/mailbox-platform-phase-2-domain-gmail-connection`
- `feature/mailbox-platform-phase-3-sync-ingestion-mailbox-state`
- `feature/mailbox-platform-phase-4-real-inbox-workspace`
- `feature/mailbox-platform-phase-5-compose-send-attachments`
- `feature/mailbox-platform-phase-6-linking-assignment-smart-views`
- `feature/mailbox-platform-phase-7-admin-permissions-diagnostics`
- `feature/mailbox-platform-phase-8-hardening-provider-extensibility`

### 27.3 Sprint branch naming

Each sprint should branch from its phase branch.

Examples:

- `feature/mailbox-platform-phase-1-sprint-1-workspace-shell`
- `feature/mailbox-platform-phase-1-sprint-2-thread-list-detail`
- `feature/mailbox-platform-phase-1-sprint-3-compose-flows`
- `feature/mailbox-platform-phase-1-sprint-4-settings-admin`
- `feature/mailbox-platform-phase-2-sprint-1-schema-provider-contracts`
- `feature/mailbox-platform-phase-3-sprint-2-delta-sync-cursors`
- `feature/mailbox-platform-phase-5-sprint-4-send-reconciliation`

### 27.4 Review and merge workflow

Workflow:

1. sprint branch is implemented
2. sprint PR is reviewed and approved
3. sprint merges into phase branch
4. once all sprints in phase are done and approved, phase branch merges into `feature/mailbox-platform`
5. once all mailbox phases are complete and approved, `feature/mailbox-platform` merges into `master`

### 27.5 Control model

This workflow is intentionally strict because mailbox is a large product subsystem. Sprint-by-sprint review is necessary to avoid drift.

---

## 28. Detailed Phase Plan

## Phase 1 — Static Design

### Goal

Lock the entire mailbox product shell, interaction model, and state design before backend implementation begins.

### Deliverable standard

Phase 1 must result in:

- a real mailbox route/module
- realistic static data states
- believable empty/loading/restricted states
- responsive direction
- settings/admin flows
- design structure stable enough for backend work

### Sprint 1.1 — Workspace shell and navigation

Scope:

- top-level Mailbox route
- desktop shell layout
- left rail base structure
- top command bar
- all-inboxes vs single mailbox context
- account grouping model
- responsive shell behavior direction

Acceptance:

- mailbox module opens into a believable workspace
- account/group structure is clear
- active view is obvious

### Sprint 1.2 — Thread list and reading pane

Scope:

- thread row design
- hover/quick action model
- unread/read/selected states
- reading pane structure
- message stack structure
- no-thread-selected state

Acceptance:

- thread list feels production-grade
- reading pane feels like a real mail client
- row quick actions are easy to discover

### Sprint 1.3 — Compose, reply, and forward

Scope:

- floating composer
- expanded composer
- inline reply
- rich-text toolbar shell
- attachment strip
- cc/bcc/open-close states
- send/discard state design

Acceptance:

- compose feels natural for Gmail users
- reply and forward flows are visually complete
- attachment handling is clearly designed

### Sprint 1.4 — Settings, connections, and permissions

Scope:

- connected mailbox list
- Gmail connect flow screens
- mailbox permission screens
- reconnect/disconnect states
- admin-only governance surfaces

Acceptance:

- mailbox admin surfaces no longer feel like raw integration scaffolding
- permission model is visually understandable

### Sprint 1.5 — Linked context, filters, and smart views

Scope:

- linked customer/document side panel
- assignment/status blocks
- smart mailbox views
- filter chips and search states
- linked/unlinked/suggested-link states

Acceptance:

- mailbox feels Slipwise-native, not generic
- customer/document context is clearly integrated

### Sprint 1.6 — Empty, degraded, and responsive polish

Scope:

- empty states
- loading states
- restricted states
- reconnect/degraded states
- tablet/mobile directional layouts
- final static polish

Acceptance:

- mailbox module looks complete in all major states
- stakeholder signoff possible before backend work starts

### Phase 1 completion gate

Phase 1 is complete only when:

- all six sprint PRs are merged into the phase branch
- major mailbox screens exist as believable product surfaces
- the shell, navigation, compose, thread list, settings, smart views, and edge states are all represented
- the static product no longer has missing IA decisions that would block backend engineering

## Phase 2 — Domain Model and Gmail Connection Backbone

### Goal

Build the real mailbox schema, provider abstraction, and Gmail connection lifecycle the later phases depend on.

### Deliverable standard

Phase 2 must result in:

- real mailbox Prisma models and migrations
- a provider-neutral mailbox service layer
- Gmail OAuth connect/refresh/disconnect flows
- mailbox registry and identity persistence
- server-enforced admin governance for mailbox connections
- tests for connection lifecycle and org scoping

### Sprint 2.1 — Schema and provider contracts

Scope:

- add mailbox domain models to Prisma
- define mailbox provider interfaces
- define stable UI-facing read shapes
- add mailbox audit event model
- add draft, assignment, and provider cursor models

Acceptance:

- mailbox schema is coherent and migration-ready
- provider adapter boundaries are explicit
- future phases do not need to invent mailbox core models ad hoc

### Sprint 2.2 — Gmail OAuth and token lifecycle

Scope:

- Gmail OAuth connect callback flow
- token encryption/reference strategy
- refresh token lifecycle
- reconnect-needed state contract
- mailbox identity capture from Gmail account

Acceptance:

- Gmail connect flow can persist mailbox authorization safely
- reconnect-needed state is explicit and testable
- token handling aligns with existing security patterns

### Sprint 2.3 — Mailbox registry and connection administration

Scope:

- mailbox connection persistence
- connection list/read models
- connect/disconnect governance actions
- connection status and health fields
- admin connection management UX contract

Acceptance:

- orgs can have multiple registered mailbox connections
- connection administration is clearly admin-scoped
- the mailbox registry is stable enough for sync work

### Sprint 2.4 — Connection permissions and org-scoped visibility

Scope:

- mailbox visibility model
- mailbox access rules by org member role/policy
- server-side enforcement contract
- restricted mailbox shape for UI consumers
- audit events for connect/disconnect/governance actions

Acceptance:

- mailbox access rules are defined before inbox data work starts
- restricted visibility is supported without leaking metadata
- governance actions are auditable and org-scoped

### Phase 2 completion gate

Phase 2 is complete only when:

- mailbox schema and provider contracts are merged
- Gmail mailbox connections can be securely created and governed
- mailbox visibility and access rules are locked
- downstream sync phases can rely on stable mailbox identifiers and auth lifecycle

## Phase 3 — Sync, Ingestion, and Mailbox State

### Goal

Ingest Gmail mailbox data into Slipwise reliably enough to power real inbox experiences.

### Deliverable standard

Phase 3 must result in:

- initial mailbox backfill capability
- incremental sync with stable checkpoints
- normalized thread/message/participant ingestion
- sync status, degraded state, and retry/recovery model
- attachment metadata ingestion foundation

### Sprint 3.1 — Initial sync pipeline

Scope:

- mailbox bootstrap sync
- provider fetch orchestration
- raw-to-normalized ingestion path
- initial thread/message creation
- sync bookkeeping for first load

Acceptance:

- a newly connected mailbox can produce normalized mailbox data
- ingestion is idempotent enough for rerun safety
- first-sync state is observable

### Sprint 3.2 — Incremental sync and provider cursors

Scope:

- delta sync model
- provider cursor persistence
- mailbox-scoped sync advancement
- watch/subscription renewal contract
- sync scheduling hooks

Acceptance:

- mailbox sync can advance incrementally without full reimport
- cursor expiration and renewal are modeled explicitly
- concurrent mailbox sync behavior is mailbox-scoped

### Sprint 3.3 — Thread/message normalization and participant extraction

Scope:

- participant extraction
- thread grouping rules
- message direction classification
- snippet/body metadata normalization
- attachment metadata extraction

Acceptance:

- normalized mailbox records are UI-usable
- participants and directionality are stable and testable
- attachment counts and metadata are available for thread views

### Sprint 3.4 — Degraded state, retry, and recovery model

Scope:

- sync failure classes
- degraded/reconnect-needed states
- retry and replay rules
- manual support recovery actions contract
- mailbox health summary shape

Acceptance:

- sync failure handling is designed as product behavior, not just logs
- degraded mailbox states are explicit
- later UI/admin work has stable health and recovery primitives

### Phase 3 completion gate

Phase 3 is complete only when:

- normalized mailbox data can be ingested and refreshed
- mailbox sync state is explicit and supportable
- failure/recovery states are modeled clearly
- the inbox UI can safely consume real mailbox data next

## Phase 4 — Real Inbox Workspace and Core Thread Operations

### Goal

Replace static mailbox surfaces with real inbox behavior for reading, triaging, and switching mailboxes.

### Deliverable standard

Phase 4 must result in:

- thread list backed by live mailbox data
- thread detail/message stack rendering
- mailbox switching and all-inboxes views on real data
- read/unread/archive/basic thread actions
- baseline search and filter behavior

### Sprint 4.1 — Thread list from real data

Scope:

- live thread list queries
- all-inboxes and single-mailbox query paths
- unread/selected sorting behavior
- mailbox counts and summary pills
- pagination or windowing strategy

Acceptance:

- mailbox thread list is no longer static
- mailbox switching uses real data cleanly
- unread and recency behavior is trustworthy

### Sprint 4.2 — Thread detail and message stack rendering

Scope:

- live thread detail fetch
- message stack rendering from normalized messages
- participant headers
- quoted reply rendering rules
- no-thread and missing-thread states

Acceptance:

- users can read a full thread inside Slipwise
- the reading pane behaves like a real operational mailbox
- detail rendering is stable across common thread shapes

### Sprint 4.3 — Core thread actions

Scope:

- mark read/unread
- archive/unarchive if supported in product model
- flag/star model if retained
- basic thread status persistence
- audit emission for core thread actions

Acceptance:

- common triage actions are available from real data
- action semantics are auditable
- mailbox state remains consistent after actions

### Sprint 4.4 — Search and filter basics

Scope:

- basic mailbox search inputs
- filter chips on live data
- mailbox/status/assignment filters where available
- empty-result states
- query-state contract for later smart views

Acceptance:

- users can narrow thread views meaningfully
- search/filter state is stable enough for saved views later
- no major mismatch exists between visible filters and data reality

### Phase 4 completion gate

Phase 4 is complete only when:

- users can browse and read real threads
- core inbox operations work on live mailbox data
- mailbox switching is stable
- the product is credible as a real inbox, not just connected infrastructure

## Phase 5 — Compose, Send, Drafts, and Attachments

### Goal

Make mailbox usable for actual outbound communication work.

### Deliverable standard

Phase 5 must result in:

- draft persistence
- reply/reply-all/forward/send via Gmail
- correct mailbox identity handling
- attachment upload/download contract
- send reconciliation and failure behavior

### Sprint 5.1 — Composer backend and draft persistence

Scope:

- mailbox draft model usage
- autosave contract
- reply/forward draft initialization
- discard/restore rules
- draft permission checks

Acceptance:

- compose flows persist meaningfully
- drafts are modeled as first-class product data
- users do not lose compose state trivially

### Sprint 5.2 — Send, reply, reply-all, and forward

Scope:

- Gmail send path
- reply/reply-all/forward semantics
- sender identity selection rules
- server-side permission enforcement
- outbound audit events

Acceptance:

- users can send and reply fully inside Slipwise
- the correct mailbox identity is always used
- outbound actions are auditable and role-safe

### Sprint 5.3 — Attachment handling

Scope:

- attachment metadata to UI
- outbound attachment upload contract
- download access rules
- inline versus file attachment behavior
- attachment failure states

Acceptance:

- attachments behave like a real email client feature
- storage and access rules are explicit
- common attachment workflows are supported

### Sprint 5.4 — Send reconciliation and failure handling

Scope:

- duplicate-protection rules
- send failure/retry states
- provider reconciliation after send
- thread update after outbound message
- support diagnostics for failed sends

Acceptance:

- send reliability is production-minded
- failed or ambiguous sends do not create silent trust gaps
- outbound reconciliation is explicit

### Phase 5 completion gate

Phase 5 is complete only when:

- users can compose, reply, forward, and send inside Slipwise
- drafts and attachments are first-class
- outbound reliability and identity rules are trustworthy

## Phase 6 — Linking, Assignment, Workflow State, and Smart Views

### Goal

Make mailbox Slipwise-native by tying conversations into records, ownership, and operational workflows.

### Deliverable standard

Phase 6 must result in:

- thread linking to customers and business records
- thread assignment and workflow status
- smart mailbox views backed by real filters
- contextual side panel with real linked data

### Sprint 6.1 — Thread linking to customers and documents

Scope:

- link/unlink actions
- suggested-link model
- primary-link designation
- link audit semantics
- record summary blocks for linked entities

Acceptance:

- threads can be connected to Slipwise records intentionally
- linked context is useful and not decorative
- link state is auditable and stable

### Sprint 6.2 — Assignment and workflow state

Scope:

- assignee model usage
- open/pending/closed or equivalent workflow states
- assignment change actions
- assignment/status visibility in list and detail
- permission-aware ownership changes

Acceptance:

- mailbox supports real team triage workflows
- thread ownership is obvious
- status and assignment are first-class product concepts

### Sprint 6.3 — Smart views and saved operational filters

Scope:

- all inboxes smart views
- assignment/status-based views
- filter persistence contract
- saved view model if retained
- stable route/query restoration

Acceptance:

- high-frequency operational views are easy to reopen
- smart views reflect live thread state
- mailbox usage feels operational rather than generic

### Sprint 6.4 — Real linked context panel

Scope:

- customer summary
- invoice/voucher/quote context blocks
- linked/unlinked suggestions
- navigation from mailbox to related Slipwise records
- missing or stale record handling

Acceptance:

- the context panel is backed by real business data
- mailbox feels integrated into Slipwise rather than isolated
- stale-link and missing-record states are handled gracefully

### Phase 6 completion gate

Phase 6 is complete only when:

- mailbox is usable as a shared operational inbox
- ownership, status, linking, and smart views all work together
- the product materially benefits from Slipwise business context

## Phase 7 — Admin, Permissions, Diagnostics, and Recovery

### Goal

Make mailbox governable, supportable, and safe for real organizations.

### Deliverable standard

Phase 7 must result in:

- mailbox admin settings backed by real data
- permission-scoped mailbox access
- connection health and sync diagnostics
- operator recovery and reconnect flows
- support-quality audit surfaces

### Sprint 7.1 — Admin mailbox settings and governance

Scope:

- mailbox connection admin screens
- mailbox display/visibility settings
- mailbox governance actions
- reconnect/disconnect confirmations
- mailbox-level policy surfaces

Acceptance:

- admins can govern mailbox connections safely
- mailbox settings feel production-grade
- dangerous actions are clearly intentional

### Sprint 7.2 — Permission-scoped visibility and actions

Scope:

- mailbox-level access enforcement
- restricted mailbox hiding or partial redaction rules
- action-level permission checks
- server-side enforcement for admin and operator actions
- testable permission matrix

Acceptance:

- mailbox visibility respects org permissions
- users cannot access or mutate out-of-scope mailboxes
- the mailbox subsystem aligns with existing auth patterns

### Sprint 7.3 — Diagnostics and recovery tooling

Scope:

- mailbox health views
- last sync / sync lag / error surfaces
- reconnect guidance
- manual sync or replay-safe support actions
- degraded mailbox guidance

Acceptance:

- operators can diagnose mailbox issues from inside Slipwise
- degraded and reconnect-required states are actionable
- support teams are not forced into raw provider logs

### Sprint 7.4 — Audit and support workflows

Scope:

- mailbox-specific audit visibility
- support event summaries
- admin-safe debug views
- safe exposure of provider error detail
- supportability documentation expectations

Acceptance:

- mailbox actions are operationally traceable
- support surfaces are useful without leaking unsafe detail
- admin workflows are ready for production use

### Phase 7 completion gate

Phase 7 is complete only when:

- mailbox operations are governable and supportable
- permissions are enforced throughout the subsystem
- degraded and recovery states are practical for real teams

## Phase 8 — Hardening, Provider Extensibility, and Release Readiness

### Goal

Make the mailbox subsystem durable, launchable, and cleanly extensible to future providers.

### Deliverable standard

Phase 8 must result in:

- rate-limit-safe sync/send behavior
- retry and idempotency hardening
- provider-neutral cleanup for future Zoho support
- end-to-end QA, docs, telemetry, and release assets

### Sprint 8.1 — Reliability hardening

Scope:

- retry/backoff rules
- idempotency guards
- concurrency and race-condition review
- attachment/send/sync failure hardening
- mailbox-scoped lock strategy if needed

Acceptance:

- common operational failure modes are handled safely
- retries do not create duplicate trust failures
- the subsystem is stable under realistic load

### Sprint 8.2 — Provider extensibility cleanup

Scope:

- Gmail-specific leakage review
- provider adapter cleanup
- neutral naming and interface review
- Zoho-readiness architecture pass
- provider-specific assumptions documented explicitly

Acceptance:

- the mailbox subsystem is not trapped in Gmail-only internal design
- a future second provider can be added without structural rework

### Sprint 8.3 — QA, telemetry, docs, and launch readiness

Scope:

- mailbox telemetry
- QA scenarios
- support/runbook docs
- release checklist
- adoption and health metrics

Acceptance:

- the team has the assets needed to verify and support launch
- telemetry is meaningful and low-noise
- release-readiness is evidence-backed

### Sprint 8.4 — Final end-to-end acceptance

Scope:

- integrated verification across all phases
- multi-mailbox org validation
- reconnect/degraded/recovery validation
- permission and audit validation
- final acceptance report

Acceptance:

- the full initiative meets the PRD’s operational bar
- mailbox is ready to merge as a production-grade subsystem
- no major product or architecture gaps remain unresolved

### Phase 8 completion gate

Phase 8 is complete only when:

- all previous phase gates remain satisfied
- the subsystem has passed launch-level QA
- diagnostics, telemetry, audit, and recovery behaviors are complete
- provider extensibility is structurally believable
- the mailbox initiative is ready for full product release

---

## 29. Acceptance Criteria

### 29.1 Phase 1 acceptance

Phase 1 is accepted only when:

- the mailbox module feels like a complete product area
- Gmail users can understand the layout immediately
- multi-mailbox behavior is obvious
- quick actions are present and usable
- compose/reply/forward are fully designed
- settings/admin surfaces are believable
- edge states are accounted for
- responsive direction is defined

### 29.2 Cross-phase acceptance rules

Every phase and sprint must explicitly satisfy:

- org scoping on all mailbox data and mutations
- permission-scoped visibility and action enforcement
- auditability for sensitive operational actions
- degraded/reconnect-required state handling
- multi-mailbox clarity in both data and UI models
- no Gmail-only leakage in the core internal model where avoidable

### 29.3 Full initiative acceptance

The full mailbox initiative is accepted only when:

- orgs can connect multiple Gmail mailboxes
- authorized users can work email fully inside Slipwise
- shared inbox workflows are usable daily
- assignment and status are first-class
- linked records are surfaced clearly
- security and audit expectations are satisfied
- provider architecture is not trapped in Gmail-specific assumptions
- diagnostics and recovery tooling are practical for operators
- teams can remain in Slipwise for day-to-day customer email work without falling back to Gmail for core flows

---

## 30. Test Plan

### 30.1 Static product review scenarios

Required scenarios:

- no mailbox connected
- one mailbox connected
- multiple mailboxes connected
- all inboxes aggregated
- one mailbox selected
- unread-heavy list
- thread with attachments
- thread with linked invoice/customer
- no thread selected
- restricted access view
- reconnect-required mailbox
- inline reply open
- floating composer open
- expanded composer open

### 30.2 Domain and provider contract tests

Required test areas:

- mailbox connection lifecycle
- provider adapter contract compliance
- OAuth token refresh and reconnect-needed transitions
- sync cursor persistence
- draft persistence and recovery
- assignment/status state transitions
- record link/unlink semantics

### 30.3 Sync and ingestion tests

Required scenarios:

- initial mailbox sync
- incremental delta sync
- repeated sync idempotency
- participant extraction correctness
- attachment metadata ingestion
- degraded sync and retry behavior
- reconnect-required mailbox after auth expiry

### 30.4 Real inbox functional tests

- connect/disconnect Gmail
- switch between multiple mailboxes
- read thread and message stack
- read thread and attachment metadata
- mark thread read/unread
- archive/basic triage actions
- reply from correct mailbox identity
- forward mail
- assign/unassign thread
- change thread status
- link/unlink record
- degraded mailbox handling
- permission-scoped mailbox visibility

### 30.5 Compose and send reliability tests

Required scenarios:

- create new draft
- autosave draft
- restore draft after navigation
- send new message
- reply/reply-all/forward
- send with attachments
- send failure and retry-safe handling
- duplicate protection on ambiguous send outcomes

### 30.6 Admin, permissions, and diagnostics tests

Required scenarios:

- mailbox visibility differs by org member permission
- admin-only governance actions are blocked for unauthorized users
- reconnect/disconnect flows are audited
- degraded mailbox surfaces expose actionable recovery information
- support diagnostics do not leak unsafe provider data

### 30.7 UX validation questions

Mailbox should be judged successful if reviewers can answer yes to:

- does this feel familiar to Gmail users?
- is multi-mailbox behavior clear?
- are common actions easy to find?
- does it look like a trustworthy operational tool?
- can users understand who owns a thread and what it is linked to?
- can operators understand mailbox health without specialist knowledge?

---

## 31. Risks and Product Warnings

### 31.1 UX risk

If the product is too custom and CRM-like, users will resist it. If it is too close to Gmail and ignores Slipwise context, it will lose differentiation.

### 31.2 Product risk

If Phase 1 is treated as shallow mockups, later backend implementation will expose missing IA decisions and force expensive redesign.

### 31.3 Engineering risk

If the platform is implemented as “Gmail integration + UI” rather than a mailbox subsystem, later Zoho support and operational workflows will become costly and fragile.

### 31.4 Multi-mailbox risk

If multi-mailbox support is not designed deeply from the start, the UI will become confusing as soon as more than one mailbox is connected.

---

## 32. Future Expansion

After the Gmail-first mailbox platform is stable, likely future expansion areas include:

- Zoho Mail provider
- automated routing and assignment
- SLA and escalation workflows
- AI summarization and drafting
- richer mailbox analytics
- deeper embedded mailbox views in customer/document modules

These are intentionally excluded from the first mailbox delivery sequence.

---

## 33. Final Product Definition

Slipwise Mailbox is a **shared, multi-mailbox customer communication workspace** that combines:

- Gmail-like familiarity for speed
- Apple-Mail-style multi-account clarity
- Slipwise-native operational context
- production-grade assignment, workflow, and linked-record thinking

The product is not a thin Gmail wrapper. It is a first-class operational subsystem.

This PRD is the canonical execution document for the mailbox initiative and should be used as the source of truth for:

- product scope
- design structure
- implementation sequencing
- branch workflow
- future mailbox engineering phases
