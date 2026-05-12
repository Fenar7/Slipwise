# Slipwise Platform Rebrand and SaaS UX Redesign PRD

## 1. Document Purpose

This PRD defines the full rebrand and redesign program for the Slipwise platform. It is written for the product, design, and software engineering teams that will implement the redesign phase by phase in production.

This is not a visual refresh brief and not a surface-level styling task. This initiative changes:

- the platform brand system
- the application shell
- the information architecture
- the dashboard model
- the data presentation model
- the document studio experience
- the settings and admin experience
- the master-data, CRM, and books experience
- the interaction and motion language

The redesign must produce a high-quality, minimal, modern SaaS experience that feels intentional, clear, fast, and premium while remaining practical for daily business work.

## 2. Executive Summary

Slipwise already contains many useful features, but the current product experience does not present them with enough clarity, hierarchy, consistency, or polish. Users can technically complete many workflows, but too much of the experience still feels like stitched-together pages rather than one cohesive platform.

The current product problems are not limited to color or typography. The deeper issues are:

- navigation hierarchy is weak and hard to scan
- the shell does not feel premium or modern
- page composition varies too much between modules
- dashboards are too sparse and not information-rich enough
- tables, forms, actions, and detail pages are not presented in the clearest way
- studio workflows such as invoice creation require more cognitive effort than necessary
- settings are hard to scan and do not feel like a serious admin workspace
- the product lacks a unified motion and interaction system
- multiple business modules feel functionally useful but visually and structurally immature

This PRD addresses the above by establishing a full platform-level design system and implementation roadmap, then applying it to the current live suites and to future-ready CRM and sales patterns that must be aligned now to prevent another fragmented product cycle later.

## 3. Product Direction

### 3.1 Product intent

Slipwise should feel like a premium business operating system for finance, documents, customers, books, and future workflow modules.

The design direction is:

- light-first
- clean and minimal
- sharp and modern
- calm and readable
- business-dense without feeling cluttered
- familiar to SaaS users
- production-grade, not template-like

### 3.2 Desired user feeling

When a user enters Slipwise, they should immediately feel:

- they understand where they are
- they understand where key actions are
- they can scan dense business information quickly
- the product is trustworthy enough for finance and operations work
- the product feels smooth and modern
- the product is easier to use than the underlying complexity of the business work

### 3.3 Non-goals

This initiative is not trying to:

- redesign the marketing site first
- imitate any single reference product exactly
- introduce heavy visual decoration that reduces clarity
- prioritize novelty over usability
- change backend business logic unless needed to support new UX behavior
- rebuild every module at once with full functionality changes

## 4. Current-State Diagnosis

This section is grounded in the current repository and current screenshots supplied by product.

### 4.1 Brand system issues

Current repo truth:

- the global token system in `src/app/globals.css` is still primarily red-accent based
- the sidebar uses a hard dark background
- font system is currently `Lato`
- there is no platform-wide semantic token model for module colors, charts, motion, or page composition
- the new brand logo now exists in `public/images/slipwise-logo.png`, but the shell still uses a small red `SW` badge rather than the new identity

Observed problems:

- the product still looks like an older internal tool rather than a refined SaaS product
- the brand identity is inconsistent across shell, actions, and content surfaces
- module colors feel incidental instead of strategic

### 4.2 Shell and navigation issues

Current repo truth:

- `AppShell` is a basic split shell with fixed sidebar + topbar
- `AppSidebar` is mostly text-only, dark, and nested via simple child links
- `AppTopbar` handles breadcrumbs and user state but is visually thin
- suite navigation is defined centrally in `src/components/layout/suite-nav-items.ts`
- an `OrgSwitcher` component exists, but it is not integrated into the main shell in the way the user wants

Observed problems:

- left nav is visually heavy but not structurally expressive
- there is not enough icon-led scanning support
- hierarchy between top-level suites and sub-navigation is weak
- organization context is not presented as a first-class shell behavior
- the shell does not communicate premium SaaS quality

### 4.3 Dashboard issues

Current repo truth:

- Home, Docs, CRM, and Books all use different dashboard styles
- current pages rely on simple cards and list blocks rather than a strong widget system
- charts exist in some modules, but there is no unified chart style

Observed problems:

- key metrics are not always presented with enough hierarchy
- quick actions are useful but too lightweight visually
- dashboards are sparse in some areas and over-simplified in others
- modules do not feel like they belong to the same product family

### 4.4 Data and list-view issues

Current repo truth:

- customer and vendor pages use a generic `DataTable`
- row actions are plain text links
- search/filter behavior is minimal
- entity detail pages do not yet provide the richer side-panel pattern shown in the references

Observed problems:

- tables feel like internal CRUD scaffolding
- important entity context is not visible at a glance
- add/edit flows are not elevated enough for frequent use
- users must work harder than necessary to inspect relationships and key facts

### 4.5 Docs and studio issues

Current repo truth:

- Docs home exists and is useful, but still feels transitional
- Invoice Studio uses a custom `DocumentWorkspaceLayout`
- the studio has a current “form vs document” mode and save bar, but the UX is still harder than it should be
- invoice creation has long vertical form sections with live preview but not the strongest left-form/right-preview composition
- templates exist, but there is not yet a strong governed default-template system from settings

Observed problems:

- document creation feels more effortful than the best SaaS reference flows
- action bars for issued docs are not yet as strong or obvious as reference products
- document preview and form entry do not create the most efficient loop for creation and review
- templates are available but not managed in the most discoverable way

### 4.6 Settings issues

Current repo truth:

- settings layout is still a simple left list plus right content area
- org settings, sequences, portal, integrations, templates, and admin options are not grouped into a robust admin IA

Observed problems:

- settings is navigable, but not fast to scan
- there is little sense of category grouping
- admin surfaces feel flatter and less structured than reference-quality products
- important controls such as org, defaults, templates, numbering, and integrations need clearer discoverability

### 4.7 Books issues

Current repo truth:

- Books overview and chart of accounts pages exist and are functional
- pages use mostly basic cards and standard tables

Observed problems:

- the finance experience does not yet feel polished enough for a premium books workspace
- metrics, charts, journals, periods, and financial data density need stronger hierarchy
- create and edit interactions can be clearer and more professional

## 5. Goals and Success Criteria

### 5.1 Primary goals

1. Rebrand the entire app around the new Slipwise visual identity.
2. Redesign the platform so it feels like a premium, high-quality SaaS application.
3. Make navigation, scanning, and task completion faster and more intuitive.
4. Improve information density without making the UI feel busy or heavy.
5. Make studios and operational workflows significantly easier to use.
6. Establish a reusable shared design system so all future suites ship consistently.

### 5.2 Success criteria

The initiative is successful when:

- a user can identify where they are and what to do next within seconds
- key modules feel clearly related but purposefully distinct
- dashboards expose important metrics and actions without forcing hunting
- master-data and entity management flows feel easy and professional
- document studios feel fast, understandable, and confidence-building
- settings feel like a serious admin environment
- charts, tables, tags, and statuses look intentional and branded
- interaction motion feels smooth but not flashy
- the product is visibly more refined than the current experience

## 6. Brand System

### 6.1 Canonical palette

The redesign will use the following palette as the foundation:

- Primary navy: `#16294D`
- Brand purple: `#C05092`
- CTA red: `#DC2626`
- Surface light blue: `#E2E6EF`
- Black: `#000000`
- White: `#FFFFFF`

### 6.2 Color role mapping

The PRD will define semantic roles, not only raw hex values.

Required roles:

- `brand.primary`
- `brand.secondary`
- `brand.cta`
- `surface.base`
- `surface.panel`
- `surface.subtle`
- `surface.selected`
- `surface.accent`
- `text.primary`
- `text.secondary`
- `text.muted`
- `border.default`
- `border.soft`
- `focus.ring`
- `state.success`
- `state.warning`
- `state.danger`
- `chart.series.1`
- `chart.series.2`
- `chart.series.3`
- `chart.series.4`
- `chart.neutral`

### 6.3 Brand usage rules

The logo system must define:

- full wordmark usage
- compact mark usage
- shell header placement
- favicon and app icon use
- loading and empty-state use
- document template use
- light-background and tinted-background safe variants

### 6.4 Typography

The platform must move from page-level ad hoc typography to a real type scale.

The PRD will define:

- display headings
- page headings
- section headings
- card titles
- body copy
- labels
- table headers
- captions
- status chips

The type system should optimize for:

- readability
- crisp SaaS feel
- fast scanning
- denser information surfaces without visual fatigue

The final implementation may keep current dependencies or switch to a more suitable pair already available in the repo, but the PRD must lock the hierarchy and tone even before the exact font decision is finalized in code.

### 6.5 Shape, spacing, and elevation

The current product already uses rounded cards and light borders, but inconsistently.

The new system must define:

- standard page widths
- standard panel padding
- section spacing
- radii scale
- border thickness and softness
- elevation ladder
- overlay and drawer depth
- sticky action bar treatment

## 7. Motion and Interaction System

The redesign must define a platform-wide motion language.

### 7.1 Goals

- make interactions feel smooth and premium
- support orientation and spatial continuity
- avoid sudden pop-in or awkward layout jumps
- keep performance high

### 7.2 Required motion surfaces

- sidebar expand/collapse
- org switcher dropdown
- tabs and segmented controls
- hover state transitions
- modal open/close
- drawer open/close
- accordion expansion
- table row detail reveal
- preview pane transitions
- save/success/error state feedback
- dashboard widget appearance

### 7.3 Motion rules

- motion must be short and controlled
- no exaggerated bounce
- reduced motion must be supported
- animation should clarify structure, not decorate for its own sake
- loading and async feedback should feel responsive, not vague

## 8. Information Architecture and Shell

### 8.1 Shell model

The new shell must have:

- a lighter and more refined left navigation
- better grouping of suites
- icon-supported navigation scanning
- clearer active and expanded states
- a proper organization switcher
- a stronger topbar with search, context, and user actions

### 8.2 Sidebar model

The sidebar should support:

- top-level suites
- nested suite areas
- clear group headings where necessary
- active suite and active sub-surface distinction
- compact and full-width responsive behavior
- future expansion to CRM/Sales patterns

### 8.3 Topbar model

The topbar should support:

- brand context
- page title and optional subtitle
- breadcrumb when useful
- global search entry
- org switcher or org identity anchor
- notification entry
- user menu
- page-level contextual actions where appropriate

### 8.4 Organization switching

An organization switcher must become first-class in the shell. It already exists as a component, but the redesign must define:

- where it lives
- what context it shows
- how role and org information are surfaced
- how switching feels
- how multi-org identity is handled visually

## 9. Shared Page Patterns

The redesign must establish reusable page archetypes.

### 9.1 Dashboard pattern

For Home, Docs, Books, CRM, and similar:

- page intro block
- high-priority KPIs
- quick actions
- recent activity
- live operational status
- lightweight charts where relevant
- modular widgets

### 9.2 List page pattern

For customers, vendors, invoices, quotes, templates, accounts, journals, and similar:

- clear page header
- search
- filter controls
- segment switches when applicable
- dense but readable table/list body
- row-level quick actions
- empty state
- bulk or batch affordances where appropriate

### 9.3 Detail page pattern

For customers, vendors, deals, documents, and similar:

- top action bar
- main content area
- right-side detail rail
- tabs or segmented sections
- metadata, related records, activity, and quick actions

### 9.4 Studio/editor pattern

For invoice, voucher, salary slip, quote, and template editing:

- left-side step or section navigation
- center or left build form
- right-side live preview
- persistent action bar
- status indicators
- document mode and form mode where needed
- export/print/preview controls that are easy to discover

### 9.5 Settings/admin pattern

For org settings, templates, integrations, security, sequences, and similar:

- grouped left navigation
- content pane with stronger sectioning
- optional search and secondary filtering
- denser settings card layout
- stronger admin hierarchy

## 10. Suite-by-Suite Redesign Requirements

### 10.1 Home

Home must become a true landing dashboard rather than a simple quick-action screen.

Required improvements:

- better greeting hierarchy
- richer “what matters now” area
- improved quick actions
- recent docs and finance activity
- meaningful metrics
- cleaner card composition
- less empty visual space

### 10.2 Docs

Docs landing should become an operational hub.

Required improvements:

- clearer suite summary cards
- better recent-doc presentation
- stronger quick actions
- better vault entry points
- more cohesive card layout

### 10.3 Invoice, voucher, quote, and salary-slip studios

Studios must be redesigned around easier creation.

Required improvements:

- persistent section nav
- build-left / preview-right default behavior
- clearer sticky action bar
- faster template switching
- better form grouping
- better visibility controls
- clearer status and export affordances
- top action bar for issued and reviewable documents

### 10.4 Books

Books must feel like a serious finance surface.

Required improvements:

- stronger KPI composition
- better cards and metrics
- improved chart styling
- clearer recent journal and period sections
- denser finance table patterns
- better modal and workflow forms

### 10.5 Master Data

Customers and vendors must be redesigned from generic CRUD into higher-quality operating views.

Required improvements:

- richer tables
- quick actions
- add/edit in modal or drawer patterns where suitable
- better detail pages
- better relationship presentation

### 10.6 CRM and Sales future patterns

The PRD must define the future experience for:

- leads
- deals
- goals
- clients
- contacts
- CRM dashboard
- sales-linked quotes and invoices

These patterns are in scope for design governance even if they are not all fully built today.

### 10.7 Settings

Settings must be redesigned to feel more structured and discoverable.

Required improvements:

- stronger category grouping
- cleaner nav hierarchy
- document templates section
- org branding and defaults
- better admin IA
- more discoverable advanced controls

## 11. New UX Features Required by the Redesign

The redesign must not be treated as visual-only. The following additions are part of the required product improvement.

### 11.1 Organization switcher in main shell

Already partly available in code, but must be elevated into the core shell experience.

### 11.2 Richer document action bars

Issued documents need better top action bars, including things like:

- preview
- print
- export
- share
- copy link
- edit
- status actions

### 11.3 Default template selector system

Users need a clear settings-led way to:

- view Slipwise default templates
- select default templates by doc type/category
- override defaults at the org level
- preview and manage templates easily

### 11.4 Better create/edit overlays

Customer, vendor, deal, lead, account, and similar creation/editing should use cleaner modal/drawer forms with more structured grouping and better CTA treatment.

### 11.5 Richer entity detail workspaces

Customer and vendor pages must evolve into detail surfaces with:

- summary metrics
- related documents
- contacts
- balances or status
- quick actions
- right-side info rail

## 12. Charts and Analytics

The redesign must define a chart language for all current and future analytic surfaces.

Requirements:

- chart colors align with the new palette
- neutral grid and axis styling
- readable labels and legends
- dashboard-friendly density
- loading and no-data states
- consistent positive/negative value treatment

Current stack supports `recharts`, so the PRD should assume that charts can be implemented without adding a new charting library unless a future phase proves otherwise.

## 13. Accessibility and Usability

The redesign must remain highly usable.

Requirements:

- accessible focus states
- keyboard reachability
- sufficient contrast
- reduced motion support
- responsive behavior
- consistent form labels and validation cues
- color not being the only meaning carrier

## 14. Responsive Behavior

The redesign is desktop-first, but must include responsive rules.

Required responsive targets:

- large desktop
- laptop
- tablet
- mobile

Behavioral expectations:

- shell collapses intentionally
- tables degrade gracefully
- studios switch from side-by-side to stacked when needed
- right-side rails become drawers or stacked panels on smaller screens

## 15. Phases and Sprints

### 15.1 Root branch

- `feature/platform-rebrand-redesign`

### 15.2 Phase branches

- `feature/platform-rebrand-redesign-phase-1-foundation-shell`
- `feature/platform-rebrand-redesign-phase-2-dashboard-primitives`
- `feature/platform-rebrand-redesign-phase-3-docs-studios`
- `feature/platform-rebrand-redesign-phase-4-data-crm-sales`
- `feature/platform-rebrand-redesign-phase-5-books-finance`
- `feature/platform-rebrand-redesign-phase-6-settings-templates`
- `feature/platform-rebrand-redesign-phase-7-polish-hardening`

### 15.3 Sprint branch pattern

- `feature/platform-rebrand-redesign-phase-x-sprint-y-description`

### 15.4 Delivery rules

Each sprint must:

- branch from its phase branch
- remain reviewable and isolated
- merge into the phase branch only after approval

Each phase must:

- meet its acceptance criteria
- merge into `feature/platform-rebrand-redesign` only after approval

### 15.5 Phase 1 — Foundation and Shell

Goal:

- establish the brand system, shell, navigation, org switcher, motion rules, and shared UI foundations

Sprints:

1. Brand tokens and typography
2. Logo and shell identity
3. Sidebar and topbar redesign
4. Org switcher integration
5. Motion baseline and shared primitives

### 15.6 Phase 2 — Dashboards and Shared Primitives

Goal:

- define the reusable page system used by all major suites

Sprints:

1. KPI cards and dashboard blocks
2. Table and list redesign
3. Detail rail and right-panel patterns
4. Modal and drawer overlay system
5. Chart styling system

### 15.7 Phase 3 — Docs and Studios

Goal:

- redesign Docs landing, vault behavior, document workspaces, and template selection

Sprints:

1. Docs dashboard redesign
2. Document vault and recent activity redesign
3. Invoice/Voucher/Quote/Slip studio shell redesign
4. Issued document top action bars
5. Template governance and default selector experience

### 15.8 Phase 4 — Data, CRM, and Sales

Goal:

- redesign master data and define future CRM/Sales workspace patterns

Sprints:

1. Customers and vendors list redesign
2. Customer and vendor detail workspace redesign
3. Leads and deals design system
4. CRM dashboard and activity patterns
5. Cross-linking between customers, deals, quotes, and invoices

### 15.9 Phase 5 — Books and Finance

Goal:

- redesign SW Books for clarity, density, and trust

Sprints:

1. Books dashboard redesign
2. Finance table and list patterns
3. Books workflow forms and overlays
4. Reconciliation and banking surfaces
5. Finance charts and reporting polish

### 15.10 Phase 6 — Settings and Templates

Goal:

- redesign settings and admin IA and deliver template governance surfaces

Sprints:

1. Settings shell redesign
2. Organization and branding settings redesign
3. Security, integrations, and advanced settings grouping
4. Document templates management redesign
5. Default template selection system

### 15.11 Phase 7 — Polish and Hardening

Goal:

- make the final experience smooth, aligned, and production-ready

Sprints:

1. Motion polish
2. Responsive QA
3. Design consistency audit
4. Performance polish
5. Launch readiness review

## 16. Acceptance Criteria by Phase

### Phase 1 acceptance

- new brand system is applied to shell and shared tokens
- org switcher is first-class and obvious
- shell feels premium and modern

### Phase 2 acceptance

- dashboards, tables, overlays, and charts share one design language
- page patterns are reusable across suites

### Phase 3 acceptance

- Docs and studio experience is significantly easier to use
- issued docs have clear actions
- templates feel governable and discoverable

### Phase 4 acceptance

- master data is easy to scan and manage
- future CRM/Sales modules have a clear implementation target

### Phase 5 acceptance

- Books feels trustworthy, clean, and dense without confusion
- finance workflows are easier to scan and act on

### Phase 6 acceptance

- settings are easier to navigate than the current experience
- org, templates, numbering, security, and integrations are easier to discover

### Phase 7 acceptance

- the whole product feels cohesive
- motion is smooth
- interaction quality is premium
- responsive behavior is intentional

## 17. QA and Validation Expectations

The redesign PRD must be validated through:

- design review against reference mapping
- suite-by-suite walkthroughs
- stakeholder usability review
- accessibility review
- responsive review
- motion review
- engineering feasibility review

## 18. Engineering Notes

The implementation should prefer a shared-system approach over repeated page-specific overrides.

Current repo implications:

- `globals.css` will need a real semantic token pass
- shell components will need redesign, not incremental polish only
- page headers, tables, forms, cards, badges, and buttons need shared standards
- `motion` and `recharts` are already available and should be leveraged where they fit
- current `DataTable`, `PageHeader`, and several suite pages should be treated as patterns to replace rather than preserve exactly

## 19. Document Deliverables

This redesign initiative will be documented with:

1. this main PRD
2. a mapped reference appendix
3. optional asset folder for exported reference stills if the team later adds them

The appendix is intentionally separate so engineering can read:

- the strategic and implementation requirements in the main PRD
- the visual pattern references in the companion reference document

## 20. Final Decision

This initiative is approved as a full platform redesign program, not a limited visual refresh.

Implementation should proceed phase by phase using the branch workflow above, with each sprint isolated, reviewed, and approved before merge.
