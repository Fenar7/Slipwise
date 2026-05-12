# Slipwise Unified Tagging and Spend Intelligence PRD

## 1. Document Purpose

This PRD defines the full production-grade tagging platform for Slipwise invoices and vouchers. It is written as an execution handoff for software engineering, QA, and product review.

This initiative is not a cosmetic metadata addition. It is a business classification, reporting, and operational intelligence capability that lets organizations:

- group invoices and vouchers by business dimension
- calculate spend or billed amount for a tag quickly
- drill from summaries into source documents
- standardize recurring tagging through customer and vendor defaults
- manage a controlled internal taxonomy without exposing tags on customer-facing documents

The intended outcome is that a customer can answer questions such as:

- how much did we spend on `hotel-sarovar` this month
- how much revenue did `mumbai-branch` generate this quarter
- which vouchers and invoices belong to `wedding-season-2026`
- what are the top five cost centers by outgoing voucher amount

This document is the source of truth for planning and implementation of the tagging platform under the platform redesign branch line.

## 2. Executive Summary

Slipwise currently supports invoices, vouchers, reports, vault search, customer records, and vendor records, but document classification is still too weak for real business operations. Existing reports are document-specific and rely mostly on status, date, amount, customer, vendor, and voucher line category. That is not enough for companies that need cross-cutting business views.

The tagging platform solves that by introducing:

- a shared org-scoped tag catalog
- multi-tag assignment on invoices and vouchers
- customer default tags
- vendor default tags
- tag filters in document lists, vault, reports, and APIs
- bulk tagging operations
- a new tag analytics experience for spend and revenue intelligence
- governance tools for rename, archive, usage inspection, and auditability

This release is designed to be:

- operationally useful on day one
- safe for finance and document workflows
- scalable to real customer datasets
- aligned with the platform redesign structure and branch workflow

## 3. Product Goal

Build a unified tagging platform for invoices and vouchers that is:

- flexible
- easy to adopt
- analytics-ready
- governance-safe
- internal-only
- API-accessible
- production-ready

The system must support both fast manual tagging and consistent repeated tagging through reusable defaults and suggestions.

## 4. Current State in Slipwise

Current repository truth:

- invoices and vouchers are first-class document models
- invoice and voucher reports already exist under intel reports
- vault search is powered by `DocumentIndex`
- customers already have `tags: String[]`
- vendors already have `tags: String[]`
- invoices do not have a document-level tag model
- vouchers do not have a document-level tag model
- invoice and voucher APIs do not expose first-class document tags
- report filters do not provide tag-aware grouping or analytics

Current product limitation:

- users can identify counterparties, but not consistently identify business dimensions
- voucher line `category` is useful but too narrow and line-level only
- customer and vendor tags are not enough because one customer or vendor may span multiple projects, branches, events, or internal cost centers
- there is no cross-document, tag-aware monthly spend or revenue view

## 5. Product Principles

- Tags are internal operational metadata, not customer-facing document content.
- A shared tag model must work across invoices and vouchers.
- Tags must be easy to apply, but hard to misuse at scale.
- Reporting must make the feature valuable, not just technically present.
- Defaults and suggestions are required for adoption.
- Tag changes must not disturb accounting, numbering, payment, or sharing workflows.
- Historical reporting must remain stable across rename and archive actions.
- Governance must prevent taxonomy chaos without making tagging slow.

## 6. Scope

This release covers:

- invoice document tags
- voucher document tags
- reusable org tag catalog
- tag defaulting from customers and vendors
- tag management console
- invoice, voucher, and vault tag filters
- invoice and voucher CSV export with tags
- tag analytics hub
- bulk tag operations
- tag-aware API support
- audit events and telemetry

This release does not cover:

- salary slip tags
- quote tags
- vendor bill tags
- hierarchical taxonomy
- budgets or budget alerts
- rule-engine auto-tagging beyond defaults and suggestions
- external/customer-visible tag rendering on PDF or portal surfaces
- accounting journal line tagging

## 7. Users and Permissions

Primary user groups:

- organization owner
- admin or operations manager
- finance operator
- document operator
- business analyst or reporting user

Permissions model:

- users who can create or edit invoices can assign and update invoice tags
- users who can create or edit vouchers can assign and update voucher tags
- only owner or org admin-equivalent roles can manage the shared tag catalog
- only owner or org admin-equivalent roles can rename or archive tags
- bulk tag operations follow the same permissions as the underlying document type

Required permission-sensitive actions:

- create tag
- rename tag
- archive tag
- unarchive tag
- assign tag
- remove tag
- bulk add tag
- bulk remove tag
- set customer default tags
- set vendor default tags

## 8. Core Product Model

### 8.1 Tag catalog

Tags are organization-scoped reusable records.

Each tag includes:

- `id`
- `organizationId`
- `name`
- `slug`
- `color`
- `description`
- `isArchived`
- `createdAt`
- `updatedAt`

Behavior rules:

- `slug` is normalized from `name`
- uniqueness is case-insensitive per organization
- archived tags remain valid for historical associations
- renaming a tag updates display name globally without breaking assignments

### 8.2 Document assignment

Invoices and vouchers support zero to many tags.

Recommended relational model:

- `DocumentTag`
- `InvoiceTagAssignment`
- `VoucherTagAssignment`

Do not store invoice or voucher tags as a raw `String[]` document field for v1 because that weakens:

- rename safety
- governance
- usage analytics
- usage counts
- referential integrity
- future extension

### 8.3 Default tags

Customers and vendors must support reusable default tag associations.

Behavior:

- selecting a customer on an invoice preloads or suggests that customer’s default tags
- selecting a vendor on a voucher preloads or suggests that vendor’s default tags
- users may remove inherited defaults before saving
- future customer/vendor default changes do not retroactively rewrite existing documents

### 8.4 Internal-only rule

Tags are not rendered on:

- invoice PDF
- voucher PDF
- print views
- public invoice token pages
- portal customer views
- outward-facing email templates unless explicitly approved in a later roadmap

## 9. Reporting and Attribution Rules

### 9.1 Core reporting behavior

The system must support:

- filtering by one or more tags
- top tags by invoice amount
- top tags by voucher amount
- combined tag activity counts
- monthly trend by tag
- drill-down to source documents

### 9.2 Attribution rule

If a document has multiple tags, the full document amount is attributed to each assigned tag.

Example:

- one voucher worth `10,000`
- tags: `hotel-sarovar`, `mumbai-branch`
- tag analytics shows `10,000` under each tag

This is intentional because tags represent overlapping business dimensions.

Required disclosure:

- UI and export surfaces must state that tag totals are non-exclusive
- summed tag totals can exceed company grand totals

### 9.3 Time basis

- invoices use `invoiceDate`
- vouchers use `voucherDate`
- archived documents are excluded by default in analytics and standard reports

## 10. UI and Surface Requirements

### 10.1 Invoice and voucher editors

Add a reusable tag picker to invoice and voucher creation/edit flows.

The picker must support:

- search existing tags
- inline create new tag
- multi-select
- remove existing tag
- keyboard-friendly selection
- archived-tag-safe rendering for historical docs
- customer/vendor default tag prefilling or suggestion

### 10.2 Detail pages

Display tags in document detail metadata surfaces.

Required behavior:

- tags visible without entering edit mode
- long tag lists collapse gracefully
- archived tags remain visually identifiable

### 10.3 List views

Add tag filter and chip display to:

- invoice list
- voucher list
- document vault

Filter behavior:

- v1 supports “match any selected tag”
- “match all selected tags” is reserved for a later phase, not implemented now

### 10.4 Bulk operations

Support from list views:

- bulk add tag
- bulk remove tag

Do not include in v1:

- bulk replace complete tag set

### 10.5 Tag management console

Add an org-level tag management screen under settings or data admin.

The console must support:

- create tag
- rename tag
- archive tag
- unarchive tag
- usage counts by document type
- last activity date
- where-used drill-down
- default tag usage visibility

### 10.6 Analytics hub

Create a tag intelligence surface under the intel or reports suite.

Required modules:

- top tags leaderboard
- invoice total by tag
- voucher total by tag
- combined activity count
- monthly trend chart
- revenue-only mode
- expense-only mode
- combined mode
- tag drill-down into source docs

## 11. API and Interface Changes

### 11.1 Invoice interfaces

Invoice create and update paths must accept:

- `tagIds?: string[]`

Invoice detail responses must include:

- `tags: Array<{ id, name, slug, color, isArchived }>`

Invoice list/report paths must support:

- `tagIds?: string[]`
- `tagMatch?: "any"`

### 11.2 Voucher interfaces

Voucher create and update paths must accept:

- `tagIds?: string[]`

Voucher detail responses must include:

- `tags: Array<{ id, name, slug, color, isArchived }>`

Voucher list/report paths must support:

- `tagIds?: string[]`
- `tagMatch?: "any"`

### 11.3 Catalog interfaces

Add internal app/server interfaces for:

- list tags
- create tag
- rename tag
- archive tag
- unarchive tag
- list tag usage
- get tag analytics summary

### 11.4 Vault and index interfaces

Extend `DocumentIndex` sync or adjacent query path to support tag-aware search and filtering.

Implementation can use either:

- denormalized searchable tag names in index state
- relational join filtering outside index table

Engineering must choose the path that preserves query clarity and performance while keeping index sync behavior reliable.

## 12. Branching and Delivery Workflow

Base branch for this initiative:

- `feature/platform-rebrand-redesign`

Feature integration branch:

- `feature/platform-rebrand-redesign-tagging`

Phase branches:

- `feature/platform-rebrand-redesign-tagging-phase-1-foundation`
- `feature/platform-rebrand-redesign-tagging-phase-2-document-workflows`
- `feature/platform-rebrand-redesign-tagging-phase-3-reporting-intelligence`
- `feature/platform-rebrand-redesign-tagging-phase-4-governance-automation`
- `feature/platform-rebrand-redesign-tagging-phase-5-hardening-release`

Sprint branches branch from the current phase branch head.

Examples:

- `feature/platform-rebrand-redesign-tagging-phase-1-sprint-1-tag-schema-catalog`
- `feature/platform-rebrand-redesign-tagging-phase-1-sprint-2-assignment-service`
- `feature/platform-rebrand-redesign-tagging-phase-1-sprint-3-migration-index-sync`

PR target rules:

- each sprint PR targets its phase branch
- each completed phase PR targets `feature/platform-rebrand-redesign-tagging`
- final feature PR targets `feature/platform-rebrand-redesign`

No sprint or phase PR targets `master` directly.

## 13. Delivery Roadmap

| Phase | Goal | Sprints |
| --- | --- | --- |
| Phase 1 | Data platform and service foundation | 1.1, 1.2, 1.3 |
| Phase 2 | Document workflows and operational UX | 2.1, 2.2, 2.3 |
| Phase 3 | Reporting and spend intelligence | 3.1, 3.2, 3.3 |
| Phase 4 | Governance, defaults, and adoption quality | 4.1, 4.2, 4.3 |
| Phase 5 | Hardening, QA, API completion, and release | 5.1, 5.2, 5.3 |

## 14. Phase 1 - Foundation

### 14.1 Phase objective

Establish a durable, queryable, and extensible tag platform that becomes the source of truth for all invoice and voucher tag behavior.

### 14.2 Phase in scope

- schema and migrations
- catalog services
- assignment services
- default tag relations
- vault/index compatibility plan

### Sprint 1.1 - Tag Schema and Catalog

Objective:

- create the persistent tag catalog and governance-safe validation rules

In scope:

- Prisma models and migration
- unique constraints and indexes
- tag slug normalization
- create/list/update/archive service methods
- permission boundaries for catalog mutation

Acceptance criteria:

- tags can be created safely per org
- duplicate tags by case-insensitive name are rejected
- rename and archive operations preserve historical meaning
- catalog listing supports active-only and all-tag views

### Sprint 1.2 - Assignment and Default Relations

Objective:

- wire tags into invoices, vouchers, customers, and vendors

In scope:

- invoice tag assignment relation
- voucher tag assignment relation
- customer default tag relation
- vendor default tag relation
- internal assignment service for add/remove/set behavior

Acceptance criteria:

- invoices and vouchers can persist multiple tags
- customer and vendor default tags can be stored
- assignment changes do not disturb unrelated document logic

### Sprint 1.3 - Search, Index, and Migration Compatibility

Objective:

- make tagged documents discoverable and compatible with existing listing layers

In scope:

- document vault filter path
- document index sync changes or equivalent relational query path
- migration stance for existing customer/vendor raw tag arrays
- initial telemetry hooks for tag creation and assignment

Acceptance criteria:

- vault can filter tagged docs
- search/index behavior remains correct
- no regressions in existing invoice/voucher listing behavior

## 15. Phase 2 - Document Workflows

### 15.1 Phase objective

Make tagging feel native inside invoice and voucher workflows rather than bolted on.

### 15.2 Phase in scope

- reusable picker
- editor integration
- detail page display
- list filters
- bulk operations

### Sprint 2.1 - Shared Tag Picker

Objective:

- build the reusable UX foundation for all tag assignment surfaces

In scope:

- searchable multi-select tag picker
- inline create
- chip rendering
- keyboard controls
- overflow behavior
- archived-tag display state

Acceptance criteria:

- users can add and remove tags quickly in a single interaction surface
- inline create does not break the current editing flow
- component can be reused across invoice, voucher, and management screens

### Sprint 2.2 - Invoice and Voucher Integration

Objective:

- integrate the picker into document creation, editing, and detail experiences

In scope:

- invoice form integration
- voucher form integration
- document detail tag display
- customer/vendor default prefilling or suggestion logic

Acceptance criteria:

- selected customer or vendor can supply default tags
- users can override defaults before save
- tags are visible on saved documents without entering edit mode

### Sprint 2.3 - Lists, Filters, and Bulk Tagging

Objective:

- allow operational teams to find and update tagged docs at scale

In scope:

- invoice list tag filter
- voucher list tag filter
- vault tag filter
- bulk add tag
- bulk remove tag

Acceptance criteria:

- users can filter each list by one or more tags
- bulk operations work across multiple selected records
- UI behavior clearly distinguishes add and remove actions

## 16. Phase 3 - Reporting and Intelligence

### 16.1 Phase objective

Turn tags into a meaningful management reporting layer for outgoing and incoming document activity.

### 16.2 Phase in scope

- invoice report tag filters
- voucher report tag filters
- CSV export support
- tag analytics hub
- drill-down navigation

### Sprint 3.1 - Tag-Aware Reports and Exports

Objective:

- make existing report surfaces tag-aware

In scope:

- invoice report filters and result rows
- voucher report filters and result rows
- tags column in exports
- tag-filter-compatible totals

Acceptance criteria:

- both reports can filter by tags
- CSV exports include tag values
- totals reflect tag filter state accurately

### Sprint 3.2 - Tag Analytics Hub

Objective:

- create a dedicated tag reporting experience for finance and operations

In scope:

- top tags summary
- invoice total by tag
- voucher total by tag
- combined activity count
- last activity metadata
- monthly trend chart

Acceptance criteria:

- users can identify major spend and revenue tags for a selected period
- analytics clearly separate revenue and expense views
- non-exclusive attribution notice is visible

### Sprint 3.3 - Drill-Down and Navigation

Objective:

- connect summary insights back to operational action

In scope:

- click tag to open filtered invoice list
- click tag to open filtered voucher list
- click tag to open combined drill-down where applicable
- preserve date range and mode state when drilling

Acceptance criteria:

- every analytics summary can lead to source documents
- filtered routes remain understandable and shareable

## 17. Phase 4 - Governance and Adoption

### 17.1 Phase objective

Prevent taxonomy drift and improve real customer adoption quality.

### 17.2 Phase in scope

- default tags on master data
- suggestion logic
- management console
- safety warnings around archive and rename

### Sprint 4.1 - Customer and Vendor Default Tags

Objective:

- reduce repetitive manual tagging

In scope:

- default tag editing on customer surfaces
- default tag editing on vendor surfaces
- prefill or suggestion behavior in document flows

Acceptance criteria:

- repeat counterparties reduce manual tagging overhead
- defaults do not silently overwrite user changes

### Sprint 4.2 - Suggestions and Usage Signals

Objective:

- improve tag quality without adding a full rule engine

In scope:

- most-used tag suggestions
- recent tag suggestions by customer or vendor
- similar-document suggestion hooks if reliable

Acceptance criteria:

- suggestions feel relevant and assistive
- no hidden auto-assignment beyond explicit defaults

### Sprint 4.3 - Tag Management Console

Objective:

- give admins a safe place to manage taxonomy

In scope:

- tag directory page
- usage counts
- where-used drill-down
- rename flow
- archive and unarchive flow
- warnings before mutating heavily used tags

Acceptance criteria:

- admins can manage tags without SQL-level intervention
- high-usage tag changes are transparent and deliberate

## 18. Phase 5 - Hardening and Release

### 18.1 Phase objective

Finalize correctness, scale behavior, APIs, testing, and rollout readiness.

### 18.2 Phase in scope

- API completion
- auditability
- performance
- QA closure
- support and rollout docs

### Sprint 5.1 - API and Audit Completion

Objective:

- finish public and internal interface coverage

In scope:

- invoice API tag support
- voucher API tag support
- list and detail response changes
- audit events for tag mutations and bulk changes

Acceptance criteria:

- supported API paths expose tags correctly
- audit events exist for sensitive governance actions

### Sprint 5.2 - Performance and Edge-Case Hardening

Objective:

- make the system safe for higher-volume orgs and tricky document states

In scope:

- query optimization for filters and analytics
- archived tag behavior
- renamed tag propagation behavior
- high-cardinality tag dataset validation
- multi-tag attribution correctness

Acceptance criteria:

- common filters and analytics remain responsive
- renamed and archived tags behave predictably everywhere

### Sprint 5.3 - QA, Docs, and Release Signoff

Objective:

- close the feature for production release under the redesign line

In scope:

- QA plan completion
- support playbook
- rollout checklist
- telemetry verification
- final signoff notes

Acceptance criteria:

- all phase acceptance criteria are closed
- support and QA have operational guidance
- final phase PR is ready for review and merge into the tagging branch

## 19. Data and Technical Requirements

Engineering must explicitly handle:

- relational integrity between tags and documents
- efficient tag count and usage queries
- deterministic rename propagation
- archive-safe filtering
- revalidation of invoice, voucher, vault, and report surfaces after tag mutation
- compatibility with current org-scoped auth model

Required technical non-goals:

- do not couple tags to invoice numbering logic
- do not couple tags to voucher approval logic
- do not add tag rendering into PDF templates

## 20. QA Requirements

Mandatory scenarios:

- create invoice with multiple tags
- create voucher with multiple tags
- save with customer default tags
- save with vendor default tags
- remove inherited default before save
- rename active tag
- archive active tag
- filter invoice list by tag
- filter voucher list by tag
- filter vault by tag
- bulk add tag
- bulk remove tag
- run report with tag filter
- export CSV with tags
- view analytics totals for a tag
- drill from analytics into source documents
- confirm tags do not appear on public or printable document surfaces

## 21. Analytics and Telemetry

Track at minimum:

- tag created
- tag renamed
- tag archived
- tag assigned to invoice
- tag assigned to voucher
- tag removed from invoice
- tag removed from voucher
- bulk tag operation started
- bulk tag operation completed
- tag report filter applied
- tag analytics page viewed
- tag drill-down opened

Telemetry goals:

- measure adoption
- identify taxonomy sprawl
- identify whether defaults improve tagging consistency

## 22. Risks and Mitigations

Risk:

- customers create too many near-duplicate tags

Mitigation:

- case-insensitive uniqueness, admin governance, usage visibility, archive flow

Risk:

- reports become misleading when multi-tag totals are summed

Mitigation:

- explicit non-exclusive attribution disclosure everywhere relevant

Risk:

- tag filtering becomes slow on larger org datasets

Mitigation:

- proper indexes, bounded joins, and performance validation in Phase 5

Risk:

- default tags feel too aggressive

Mitigation:

- defaults are editable before save and do not silently reapply after manual user removal within the same edit flow

## 23. Success Criteria

This initiative is successful when:

- customers can classify invoices and vouchers by business dimensions without external spreadsheets
- finance or operations can calculate monthly spend or billed totals by tag in-product
- tag-based drill-down to source documents is reliable
- taxonomy remains manageable through rename, archive, and usage controls
- the feature integrates cleanly with the platform redesign branch and review workflow

## 24. Final Delivery Notes

Implementation sequencing must follow the phase and sprint structure in this document.

This PRD is intended to be sufficient for:

- branch creation
- sprint breakdown
- engineering execution
- QA planning
- PR review expectations

If follow-up enhancements are desired after this roadmap, they should be planned as a separate post-release phase rather than inserted ad hoc into the above five phases.
