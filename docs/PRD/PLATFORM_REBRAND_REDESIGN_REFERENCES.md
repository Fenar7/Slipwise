# Slipwise Platform Rebrand and Redesign Reference Mapping

## 1. Document Purpose

This document preserves the reference patterns provided for the Slipwise redesign initiative and maps them to concrete Slipwise surfaces.

This is not a “copy these screenshots” instruction set. It is a translation layer between inspiration and implementation so the software engineering team understands exactly:

- which references matter
- what behavior or structure should be borrowed
- what should remain uniquely Slipwise
- where the references apply in the product

If the raw screenshots are later exported into repo-managed image assets, they should be placed under:

- `docs/PRD/assets/platform-redesign/`

This document can then be updated to point to exact local asset filenames.

## 2. Brand Inputs

### 2.1 New Slipwise brand assets

Repo truth:

- logo currently available at `public/images/slipwise-logo.png`

### 2.2 Color palette supplied by product

- Navy: `#16294D`
- Purple: `#C05092`
- CTA red: `#DC2626`
- Surface light blue: `#E2E6EF`
- Black: `#000000`
- White: `#FFFFFF`

### 2.3 Brand intent

The new brand should feel:

- premium
- crisp
- modern
- minimal
- calm
- trustworthy for finance and operations

## 3. Reference Groups

## Group A — Dashboard and Shell Quality

### Reference intent

The provided dashboard references show:

- cleaner SaaS shells
- better information hierarchy
- stronger metric cards
- more useful dashboards
- calmer spacing and typography
- more refined chart treatment

### Mapped Slipwise surfaces

- `/app/home`
- `/app/docs`
- `/app/books`
- future `/app/crm`
- future suite dashboards generally

### What Slipwise should borrow

- widget-based page composition
- better hierarchy between page title, KPI summary, and secondary data
- more refined shell proportions
- cleaner card structure
- clearer grouping of information
- chart blocks that look first-class rather than generic
- stronger top action areas

### What Slipwise should not copy directly

- exact color use
- exact KPI wording
- exact chart values
- exact layout proportions when Slipwise modules need different density

## Group B — Left Sidebar and Navigation Hierarchy

### Reference intent

The navigation references show:

- softer and more premium left rails
- icon-led scanning
- stronger grouping of modules
- more confidence in hierarchy between apps and sub-sections

### Mapped Slipwise surfaces

- global app shell
- docs sub-navigation
- books sub-navigation
- settings navigation
- future CRM/Sales navigation

### What Slipwise should borrow

- stronger grouping
- better active state treatment
- more useful icon presence
- visually lighter shell
- cleaner spacing between groups
- easier scan path

### What Slipwise should not copy directly

- exact icon set or exact placements
- exact hierarchy labels from other products
- consumer-product patterns that do not fit Slipwise suite depth

## Group C — Data Tables and Dense Operational Views

### Reference intent

The customer/vendor/client references show:

- dense but readable information grids
- better inline metadata
- more powerful row structure
- detail contexts that stay visible

### Mapped Slipwise surfaces

- customer list
- vendor list
- invoice and voucher vaults
- chart of accounts
- journals
- template list
- future clients, leads, and deals lists

### What Slipwise should borrow

- cleaner list density
- more useful status chips and inline metadata
- better row scanning
- stronger column hierarchy
- more structured action placement
- better summary information around lists

### What Slipwise should not copy directly

- overly dense enterprise grid behavior that hurts readability
- exact field ordering without validating Slipwise business needs

## Group D — Detail Workspaces with Right-Side Summary Rails

### Reference intent

The detail-view references show:

- main content area paired with persistent details
- action bars at top
- related tabs
- visible key facts without extra clicks

### Mapped Slipwise surfaces

- customer detail
- vendor detail
- future client detail
- future deal detail
- document detail views
- books detail surfaces where applicable

### What Slipwise should borrow

- top action rails
- summary facts panel on the right
- tabbed related records
- visible contact, status, and relationship context
- better document-linked entity surfaces

### What Slipwise should not copy directly

- exact CRM semantics from the reference products
- excessive panel density if it hurts smaller screens

## Group E — Create and Edit Modals / Drawers

### Reference intent

The add-lead and add-deal references show:

- dense but readable modals
- clean grouped form fields
- strong footer CTAs
- professional spacing and field rhythm

### Mapped Slipwise surfaces

- add customer
- add vendor
- add employee
- add account
- add bank
- add lead
- add deal
- add tags, sources, categories, or similar admin objects

### What Slipwise should borrow

- stronger field grouping
- better two-column layout where appropriate
- sticky footer CTA on taller forms
- more intentional close and secondary action handling
- cleaner visual rhythm in long forms

### What Slipwise should not copy directly

- exact field contents from CRM-heavy products
- fixed modal size without responsive behavior

## Group F — Document Action Bars

### Reference intent

The action bar references show:

- strong top-level commands after a document exists
- better discoverability for print, preview, share, copy link, email, and edit

### Mapped Slipwise surfaces

- issued invoice detail
- issued quote detail
- voucher detail when applicable
- customer portal sharing surfaces
- document template preview and review surfaces

### What Slipwise should borrow

- action grouping at top
- visibility for copy-link and share behaviors
- clear primary vs secondary action separation
- better issued-document lifecycle controls

### What Slipwise should not copy directly

- irrelevant actions not supported by Slipwise
- cluttered toolbars with too many equal-priority actions

## Group G — Invoice / Quote / Document Studio Layout

### Reference intent

The studio references show:

- left-side form sections
- right-side live preview
- stronger progress through document construction
- a more obvious authoring loop

### Mapped Slipwise surfaces

- Invoice Studio
- Voucher Studio
- Salary Slip Studio
- Quote Studio
- template editor where the preview relationship is similar

### What Slipwise should borrow

- section nav on the left
- build workflow on the left or center
- persistent preview on the right
- better authoring ergonomics
- easier template and client information entry
- stronger preview visibility while editing

### What Slipwise should not copy directly

- quote-specific fields for invoice flows
- template-specific editors where Slipwise needs a different model
- behaviors that conflict with existing document export architecture

## Group H — Template Governance and Template Settings

### Reference intent

The template references show:

- a settings-level template management model
- template categories
- default template selection
- template editing with field maps and live preview

### Mapped Slipwise surfaces

- document templates area
- org settings for default document templates
- template editing experiences
- start-from-template entry points in studios

### What Slipwise should borrow

- “start from a default/Slipwise template” concept
- clearer template browsing and ownership
- easier default assignment
- better preview and editing structure
- stronger categorization by doc type and use case

### What Slipwise should not copy directly

- field systems that do not match Slipwise document architecture
- hidden template governance that makes ownership ambiguous

## Group I — Settings and Admin Navigation

### Reference intent

The settings references show:

- grouped navigation
- stronger admin categories
- more discoverable settings
- a cleaner shell for heavy configuration areas

### Mapped Slipwise surfaces

- all settings
- organization settings
- integrations
- security
- templates
- numbering
- portal
- roles and members

### What Slipwise should borrow

- grouped settings architecture
- cleaner left navigation
- stronger category labeling
- easier scanability
- more “admin workspace” confidence

### What Slipwise should not copy directly

- exact category names when Slipwise’s domain is different
- over-deep nesting that harms discoverability

## Group J — Organization Menu and Multi-Org Context

### Reference intent

The org-menu reference shows:

- clearly visible organization identity
- direct access to org settings and account context
- a product that visibly supports multi-organization use

### Mapped Slipwise surfaces

- global shell
- topbar / org switcher
- settings entry points
- onboarding and organization management touchpoints

### What Slipwise should borrow

- explicit organization identity in shell
- easy switching and org-specific settings access
- role visibility where useful

### What Slipwise should not copy directly

- any behavior that bypasses the current authorization model

## Group K — Payment and Flow Simplicity

### Reference intent

The payment flow reference shows:

- clean step-based progression
- simplified amount and conversion blocks
- clearer primary CTA and step framing

### Mapped Slipwise surfaces

- payment-related flows
- send-link or send-proof flows
- export and share flows where a stepper is more useful than a plain form

### What Slipwise should borrow

- step clarity
- cleaner conversion of complex financial actions into guided flows
- strong primary CTA layout

### What Slipwise should not copy directly

- payments-specific flows where the Slipwise use case differs materially

## 4. Reference-to-Slipwise Mapping Table

| Reference pattern | Slipwise target | Priority | Notes |
| --- | --- | --- | --- |
| Dashboard composition | Home, Docs, Books, CRM | High | Must drive overall page hierarchy redesign |
| Sidebar and app shell | Global shell | High | Core to full rebrand success |
| Dense operational tables | Data, Books, Vault | High | Replace current generic table feel |
| Right-side detail rails | Customers, Vendors, Deals, Docs | High | Needed for better operational clarity |
| Add/edit modal layout | Data, CRM, Books | High | Must standardize cross-suite forms |
| Document action bars | Docs detail flows | High | Needed for issued-doc usability |
| Studio left form / right preview | Invoice/Voucher/Quote/Slip studios | High | Major usability upgrade |
| Template settings and defaults | Settings, Templates, Studios | High | Explicitly requested product addition |
| Org switcher/dropdown | Global shell and settings | Medium-High | Already partially exists in code |
| Payment stepper clarity | Pay and related guided flows | Medium | Reusable pattern for future flows |

## 5. Engineering Guidance

The engineering team should use this appendix together with the main PRD as follows:

1. Read the main PRD for product intent, architecture, phases, and acceptance criteria.
2. Use this appendix to understand the visual and interaction benchmarks.
3. Borrow structure and clarity from the references.
4. Do not reproduce reference products literally.
5. Resolve conflicts in favor of:
   - Slipwise brand system
   - Slipwise domain model
   - usability and implementation quality

## 6. Final Notes

These references were selected because they present business information in a clearer, more premium, and more operationally useful way than the current Slipwise experience.

The redesign program should treat them as high-signal benchmarks for:

- information hierarchy
- shell quality
- form usability
- detail-view composition
- document workflow clarity
- overall SaaS polish

The result should be a clearly Slipwise product, not a clone, but it must reach a comparable quality bar in structure, smoothness, and confidence.
