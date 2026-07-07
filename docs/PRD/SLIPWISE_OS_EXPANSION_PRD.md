# SLIPWISE ONE — OS EXPANSION
## Product Requirements Document (PRD)
### People OS · Work OS · BDR & CRM · Internal ITSM · CX Lifecycle

---

| Field | Value |
|---|---|
| **Document Version** | 1.0.0 |
| **Status** | APPROVED FOR ENGINEERING |
| **Classification** | INTERNAL — CONFIDENTIAL |
| **Prepared By** | Office of the CTO |
| **Date** | July 2026 |
| **Next Review** | September 2026 |
| **Platform** | Slipwise One (Next.js 16 / Prisma 7 / PostgreSQL / Supabase) |
| **Target Cloud** | AWS (Production) |

---

## HOW TO READ THIS DOCUMENT

This PRD is the **single source of truth** for the Slipwise OS Expansion. Every engineer, product manager, QA analyst, and DevOps engineer must read and operate from this document.

- **Section 1–5**: Read before writing a single line of code. These govern architecture, security, and workflow.
- **Section 6 onwards**: Phase-by-phase epics. Each sprint includes User Stories, Acceptance Criteria, Full Prisma Schema, API Contracts, UI Spec, Security Considerations, and Definition of Done.
- **Phases A, B, C** are sequential at the phase level. However, within Phase B, certain epics (BDR and ITSM) can be developed in parallel worktrees — this is explicitly noted.
- Every API route follows REST. Every Prisma model includes full field definitions. Do not deviate without a Tech Lead review.

---

## TABLE OF CONTENTS

1. Executive Summary & Business Case
2. Glossary
3. Technology Stack Reference
4. Git Workflow & Team Structure
5. Security Practices Mandate
6. AWS Production Architecture
7. Code Quality & Engineering Standards
8. PHASE A — Foundation (Months 1–3, Sprints 1–9)
   - A1: RBAC, Org Tree & Granular Permissions (Sprints 1–3)
   - A2: Work OS Foundation — Spaces, Lists, Tasks (Sprints 4–6)
   - A3: HRIS Foundation — Employee Profiles, Leave & Org Chart (Sprints 7–9)
9. PHASE B — Core Modules (Months 4–6, Sprints 10–21)
   - B1: Work OS Advanced — Gantt, Workload, Time Tracking, Sprints (Sprints 10–12)
   - B2: HR Advanced — Attendance, Performance Reviews, Payroll Deep Integration (Sprints 13–15)
   - B3: BDR & CRM — Leads, Deals, Pipelines, Email Sequences (Sprints 16–18)
   - B4: Internal ITSM — Service Catalogue, SLA, Escalation Engine (Sprints 19–21)
10. PHASE C — Intelligence & Integrations (Months 7–9, Sprints 22–38)
    - C1: CX Lifecycle — Onboarding, Health Scores, Renewal Engine (Sprints 22–24)
    - C2: Dashboards, Goals & OKRs (Sprints 25–26)
    - C3: Proposal Builder & Contract CLM (Sprints 27–28)
    - C4: Docs, Wikis & Knowledge Base (Sprints 29–30)
    - C5: Automation Engine (Sprints 31–33)
    - C6: AI Intelligence Layer — Slipwise Brain (Sprints 34–35)
    - C7: External Integrations (Sprints 36–37)
    - C8: Mobile PWA (Sprint 38)
11. Full Consolidated Database Schema
12. Full API Reference Index
13. Testing Strategy & QA Methodology
14. Deployment, DevOps & Observability Plan

---

# SECTION 1: EXECUTIVE SUMMARY & BUSINESS CASE

## 1.1 The Problem

Slipwise One today is an exceptionally strong Finance and Document Operations platform. However, businesses using Slipwise are also paying for an average of **6–9 additional SaaS tools** to handle their human and operational workflows: a project management tool (ClickUp or Asana), an HR system (BambooHR or Zoho People), a CRM (HubSpot or Salesforce), an internal helpdesk (Jira Service Management or Freshservice), and a knowledge base (Notion or Confluence).

Each of these tools represents:
- An additional monthly subscription cost (average business pays $2,000–$8,000/month on these tools alone)
- A separate login and authentication system
- Data that never syncs back to financial records
- Manual reconciliation work that wastes hours every week
- Security risk through multiple third-party data custodians

The most painful gap is **financial disconnection**. A BDR closes a deal in HubSpot. A Finance person manually creates an invoice in Slipwise. A different person creates an onboarding project in Asana. The payroll team cannot see who is on leave from within the financial system. This fragmentation costs accuracy, time, and money.

## 1.2 The Solution

The Slipwise OS Expansion converts Slipwise One from a Finance platform into a **complete Business Operating System**. Every human and operational process the business runs — closing a deal, managing a project, onboarding an employee, resolving an IT request, running payroll, tracking contract renewals — lives inside one connected, intelligent platform.

The critical competitive differentiator is **native financial context**. When a BDR views a client in the CRM, they see not just CRM notes but the actual Slipwise invoice history, payment behaviour, lifetime value, and upcoming renewal date — all from the existing Slipwise Books engine with zero integration or data sync.

## 1.3 Market Opportunity

- The global Project Management Software market is valued at $7.6B (2024), growing at 13.7% CAGR.
- The global HRMS market is valued at $19.5B (2024), growing at 9.4% CAGR.
- The global CRM market is valued at $101B (2024), growing at 12% CAGR.
- Combined, businesses spend over $130B/year on tools that Slipwise OS intends to consolidate.
- The sweet spot target market: **SMBs and mid-market businesses with 20–500 employees** that are actively looking to reduce their SaaS sprawl.

## 1.4 Success Metrics (KPIs)

| Metric | Target (12 months post-launch) |
|---|---|
| Monthly Active Users on Work OS | 60% of org members using task management |
| Leave Requests through HRIS | 90% of orgs using leave module |
| CRM Pipeline Value Tracked | $50M+ across all orgs |
| Internal Tickets via ITSM | 500+ tickets/month across platform |
| Churn Reduction | 15% reduction in customer churn due to higher platform stickiness |
| ARPU (Average Revenue Per User) Increase | 35% increase due to new module pricing |

---

# SECTION 2: GLOSSARY

| Term | Definition |
|---|---|
| **Acceptance Criteria** | Conditions that a user story must satisfy to be considered complete |
| **BDR** | Business Development Representative — a salesperson focused on prospecting and qualifying leads |
| **CLM** | Contract Lifecycle Management — the process of managing contracts from creation to renewal |
| **CRM** | Customer Relationship Management — software for tracking interactions with prospects and customers |
| **CSAT** | Customer Satisfaction Score — a metric measuring how satisfied customers are after an interaction |
| **CX** | Customer Experience — the overall journey a customer has after purchasing |
| **Definition of Done (DoD)** | A shared checklist that must be met before a story is considered complete |
| **EAV** | Entity-Attribute-Value — a data model for storing arbitrary custom fields |
| **Epic** | A large body of work containing multiple User Stories, scoped to a feature area |
| **HRIS** | Human Resources Information System — software managing employee data and HR processes |
| **ITSM** | IT Service Management — the practice of managing IT services via structured processes |
| **JWT** | JSON Web Token — a signed token used for authentication |
| **LTV** | Lifetime Value — the total revenue a customer is expected to generate |
| **MFA** | Multi-Factor Authentication |
| **NPS** | Net Promoter Score — a metric measuring customer likelihood to recommend |
| **NRR** | Net Revenue Retention — the % of revenue retained from existing customers including expansions |
| **OKR** | Objectives and Key Results — a goal-setting framework |
| **Org Tree** | A hierarchical structure representing the organisation's reporting relationships |
| **PWA** | Progressive Web App — a web app that can be installed and used offline like a native app |
| **RBAC** | Role-Based Access Control — a system for controlling access based on roles |
| **RLS** | Row-Level Security — PostgreSQL feature to restrict which rows a user can see |
| **SLA** | Service Level Agreement — a commitment to respond/resolve within a set time |
| **Sprint** | A time-boxed iteration (2 weeks) in Agile development |
| **Story Points** | A relative unit for estimating development effort |
| **User Story** | A requirement written from the perspective of the end user |
| **Worktree** | A Git feature allowing multiple branches to be checked out simultaneously in separate directories |
| **Zod** | A TypeScript schema validation library used for API input validation |

---

# SECTION 3: TECHNOLOGY STACK REFERENCE

## 3.1 Core Platform (Existing — Do Not Change)

| Layer | Technology | Version |
|---|---|---|
| **Framework** | Next.js | 16.x (App Router) |
| **UI Library** | React | 19.x |
| **Language** | TypeScript | 5.x (strict mode) |
| **ORM** | Prisma | 7.x |
| **Database** | PostgreSQL | 16.x (via Supabase) |
| **Auth** | Supabase Auth | Latest |
| **File Storage** | Supabase Storage / S3 | Latest |
| **Realtime** | Supabase Realtime | Latest |
| **Email** | Resend / AWS SES | Latest |
| **Queue** | Inngest / AWS SQS | Latest |

## 3.2 New Dependencies for This Module

| Dependency | Purpose | Install Command |
|---|---|---|
| `react-organizational-chart` | Org Tree visualisation | `npm install react-organizational-chart` |
| `@dnd-kit/core` | Drag and drop (Kanban, Gantt) | `npm install @dnd-kit/core @dnd-kit/sortable` |
| `react-gantt-chart` or custom | Gantt chart rendering | Evaluate at Sprint 10 |
| `date-fns` | Date manipulation for sprints, SLA | Already installed |
| `zod` | API input validation | Already installed |
| `recharts` | Dashboard widgets, burndown charts | `npm install recharts` |
| `@tanstack/react-query` | Server state management | Already installed |
| `tiptap` | Rich text editor for Docs/Wiki | `npm install @tiptap/react @tiptap/starter-kit` |
| `rrule` | Recurring task rule engine | `npm install rrule` |
| `openai` | AI layer (Slipwise Brain) | Already installed |

## 3.3 AWS Production Architecture (Target State)

```
Internet
   │
   ▼
Route 53 (DNS)
   │
   ▼
CloudFront CDN (Static assets, Edge caching)
   │
   ▼
Application Load Balancer (ALB)
   │
   ├──────────────────────────────┐
   ▼                              ▼
ECS Fargate                   ECS Fargate
(Next.js App Container 1)     (Next.js App Container 2)
[Private Subnet AZ-a]         [Private Subnet AZ-b]
   │                              │
   └──────────┬───────────────────┘
              │
              ▼
         ┌─────────────────────────────────┐
         │          Data Layer             │
         │                                 │
         │  RDS PostgreSQL (Multi-AZ)      │
         │  ElastiCache Redis              │
         │  S3 (File Storage)              │
         │  SES (Transactional Email)      │
         │  SQS (Async Job Queue)          │
         │  Secrets Manager (KMS)          │
         └─────────────────────────────────┘

Monitoring:
  CloudWatch (Logs, Metrics, Alarms)
  AWS X-Ray (Distributed tracing)
  Sentry (Application error tracking)
```

**Key Architecture Decisions for AWS:**
- Next.js runs in ECS Fargate containers (not Lambda@Edge) to avoid cold-start latency for complex server actions.
- PostgreSQL runs in RDS Multi-AZ with automated failover and daily snapshots.
- File uploads (employee documents, attachments) go directly to S3 via pre-signed URLs — never through the application server.
- All async work (email sending, payroll calculation, automation triggers) goes through SQS → ECS Worker containers to avoid blocking the main request thread.
- Secrets (database URLs, API keys) stored in AWS Secrets Manager, injected as environment variables at container startup via IAM roles.
- All data encrypted at rest via AWS KMS. All data in transit via TLS 1.3.

---

# SECTION 4: GIT WORKFLOW & TEAM STRUCTURE

## 4.1 Branch Strategy

```
main (production)
  │
  └── develop (staging — all features merge here first)
        │
        ├── feature/rbac-org-tree         [Worktree: ../slipwise-rbac]
        ├── feature/work-os               [Worktree: ../slipwise-work-os]
        ├── feature/hris-foundation       [Worktree: ../slipwise-hris]
        ├── feature/bdr-crm               [Worktree: ../slipwise-crm]
        ├── feature/itsm                  [Worktree: ../slipwise-itsm]
        ├── feature/cx-lifecycle          [Worktree: ../slipwise-cx]
        ├── feature/automation-engine     [Worktree: ../slipwise-automation]
        ├── feature/ai-layer              [Worktree: ../slipwise-ai]
        └── feature/mobile-pwa            [Worktree: ../slipwise-pwa]
```

## 4.2 Setting Up Git Worktrees

Run these commands from the root of the repository:

```bash
# RBAC must be done first — everything depends on it
git worktree add ../slipwise-rbac feature/rbac-org-tree

# Phase A parallel tracks (after RBAC is merged to develop)
git worktree add ../slipwise-work-os feature/work-os
git worktree add ../slipwise-hris feature/hris-foundation

# Phase B parallel tracks
git worktree add ../slipwise-crm feature/bdr-crm
git worktree add ../slipwise-itsm feature/itsm

# Phase C
git worktree add ../slipwise-cx feature/cx-lifecycle
git worktree add ../slipwise-automation feature/automation-engine
git worktree add ../slipwise-ai feature/ai-layer
```

## 4.3 Parallel Development Plan

| Phase | Can be parallel? | Dependency |
|---|---|---|
| A1: RBAC | ❌ Must go first | None |
| A2: Work OS | ✅ After A1 is merged | Needs Member/Org models from A1 |
| A3: HRIS | ✅ After A1 is merged | Needs OrgNode from A1 |
| B1: Work OS Advanced | ✅ Extends A2 | Needs A2 merged |
| B2: HR Advanced | ✅ Extends A3 | Needs A3 merged |
| B3: BDR/CRM | ✅ Parallel with B2 | Needs A1 RBAC |
| B4: ITSM | ✅ Parallel with B3 | Needs A1 (OrgTree for routing) |
| C1–C8 | Mix — see Phase C | |

## 4.4 Branch Naming Conventions

```
feature/[epic-name]       — new feature development
fix/[issue-description]   — bug fixes
chore/[task]              — dependency updates, refactors, tooling
hotfix/[issue]            — urgent production fixes (branch from main, merge back to main AND develop)
release/v[x.y.z]          — release candidates
```

## 4.5 Pull Request Process

1. Engineer creates PR from `feature/*` → `develop`
2. PR must include:
   - Description of changes
   - Screenshots / Loom video for UI changes
   - Link to User Story in this PRD
   - Checklist: tests passing, lint clean, no console.logs, migrations reviewed
3. Minimum 2 reviewer approvals required
4. Tech Lead must approve any Prisma migration PR
5. QA must sign off on any Sprint before it merges to `main`
6. `main` branch is protected — no direct commits, squash merge only

## 4.6 Commit Message Convention (Conventional Commits)

```
feat(work-os): add task dependency linking
fix(hris): correct leave balance deduction on unpaid leave
chore(deps): upgrade prisma to 7.x
docs(prd): update sprint 4 acceptance criteria
test(rbac): add unit tests for permission matrix
```

---

# SECTION 5: SECURITY PRACTICES MANDATE

**ALL engineers MUST follow these practices. No exceptions. Code reviews will reject PRs that violate these.**

## 5.1 Authentication & Authorization

1. **JWT Verification on Every API Route**: Every `/api/*` route must call `createClient()` from Supabase and verify the session. Never trust client-side claims.
   ```typescript
   // Required in every API route handler
   const supabase = createClient(cookies())
   const { data: { user }, error } = await supabase.auth.getUser()
   if (!user || error) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
   ```

2. **Row-Level Security (RLS)**: Every new Prisma model that contains organisation-scoped data MUST have a corresponding PostgreSQL RLS policy. The policy must verify that the requesting user's `organization_id` matches the record's `organization_id`. Write these policies in migration files.

3. **Permission Check Before Every Mutation**: For any CRUD operation, verify the user's `GranularPermissionGrant` before executing the database operation. Use a helper function:
   ```typescript
   await requirePermission(user.id, orgId, 'invoice', 'create')
   // throws 403 if not permitted
   ```

4. **MFA Enforcement**: Admin and Owner roles must have MFA enabled. Enforce this at login. If MFA is not configured for an admin, redirect them to the MFA setup screen.

## 5.2 Input Validation

5. **Zod Validation on ALL API Inputs**: Every POST/PATCH/PUT request body must be validated with a Zod schema before touching the database.
   ```typescript
   const schema = z.object({
     title: z.string().min(1).max(255),
     priority: z.enum(['URGENT', 'HIGH', 'NORMAL', 'LOW']),
     dueDate: z.string().datetime().optional(),
   })
   const body = schema.parse(await request.json())
   ```

6. **Never Trust URL Parameters for Org ID**: Always derive `organizationId` from the authenticated user's session, never from the URL. A malicious user could pass a different org ID in the URL to access another org's data.

7. **File Upload Validation**: For any file upload to S3, validate: file type (whitelist only pdf, png, jpg, docx), file size (max 10MB), and scan the filename for path traversal attempts.

## 5.3 Data Protection

8. **Sensitive Fields in Logs**: NEVER log: salary amounts, bank account numbers, password hashes, JWT tokens, or personal identification numbers. Use a log sanitiser middleware.

9. **Employee PII Behind HR RLS**: The `employee_profile`, `leave_request`, `attendance_record`, and `performance_review` tables must have RLS policies that restrict access to users with the `hr:read` permission grant ONLY.

10. **Salary Data Isolation**: Salary fields in `EmployeeProfile` must only be returned to users with the `hr:payroll:read` permission. Strip these fields from responses for all other roles. Use Prisma's `select` to explicitly exclude them.

11. **Encryption at Rest (AWS)**: All RDS data encrypted with AWS KMS. All S3 objects encrypted with SSE-S3. All Secrets Manager entries encrypted with KMS.

12. **Encryption in Transit**: TLS 1.3 enforced at the ALB level. Reject all HTTP connections. HSTS header with 1-year max-age.

## 5.4 API Security

13. **Rate Limiting**: Use Upstash Redis rate limiting on ALL public-facing API routes. Limits: 100 requests/minute per IP for auth endpoints, 500 requests/minute per user for regular endpoints.

14. **CORS Policy**: `Access-Control-Allow-Origin` must only include the production domain and localhost for development. Never `*` in production.

15. **CSRF Protection**: All state-changing requests (POST, PATCH, DELETE) must include the Supabase auth session cookie which provides implicit CSRF protection. For any forms using fetch, include the `X-CSRF-Token` header.

16. **SQL Injection Prevention**: Prisma's ORM provides parameterised queries by default. Never use `$queryRaw` with string interpolation. If raw SQL is absolutely needed, use `$queryRawUnsafe` with explicit parameterisation.

17. **XSS Prevention**: React's JSX escapes output by default. Never use `dangerouslySetInnerHTML` without explicit sanitisation via DOMPurify. Set CSP headers: `Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{nonce}'`.

## 5.5 Operations & Governance

18. **Audit Log for All Mutations**: Every create/update/delete operation across ALL new models must write a record to the existing `AuditLog` table with: `actorId`, `organizationId`, `action`, `resourceType`, `resourceId`, `before` (JSON), `after` (JSON), `ipAddress`, `timestamp`.

19. **API Key Rotation Policy**: Third-party API keys (Google Calendar OAuth, Twilio, DocuSign) must be stored in AWS Secrets Manager and rotated every 90 days. A CloudWatch alarm alerts the DevOps team 14 days before expiry.

20. **Dependency Vulnerability Scanning**: `npm audit` must pass with zero high/critical vulnerabilities before any production deployment. Use Dependabot for automated PRs.

21. **Environment Variables Only**: No secrets, API keys, database URLs, or tokens hardcoded anywhere in the codebase. Use `.env.local` for development. AWS Secrets Manager for production.

22. **GDPR — Right to Deletion**: Every new model that stores personal data must be included in the `DELETE /api/admin/gdpr/delete-user` endpoint. Document which tables contain PII in the schema migration PR.

23. **Data Retention Policy**: Audit logs retained for 7 years (compliance). Deleted employee data retained for 3 years (legal). All other soft-deleted records retained for 90 days before hard deletion via a scheduled job.

24. **Penetration Testing**: A full pentest must be conducted by a third-party security firm before Phase B goes to production. High and Critical findings must be resolved before launch.

25. **Secret Scanning**: GitHub Advanced Security secret scanning must be enabled on the repository. Any committed secret triggers an immediate incident response: revoke, rotate, investigate.

---

# SECTION 6: CODE QUALITY & ENGINEERING STANDARDS

## 6.1 TypeScript Standards

- `strict: true` in `tsconfig.json` — no `any` types permitted. Use `unknown` and type-narrow.
- Every function must have explicit return type annotation.
- No `@ts-ignore` or `@ts-expect-error` without a written comment explaining why it is unavoidable.
- Enums for all fixed-value fields (status, priority, type, etc.) — define them in Prisma schema.

## 6.2 File & Folder Structure for New Modules

```
src/
  app/
    app/
      people/          ← HRIS module routes
        page.tsx       ← /app/people (Employee Directory)
        [id]/          ← /app/people/:id (Employee Profile)
          page.tsx
        leave/         ← /app/people/leave
          page.tsx
        org-chart/     ← /app/people/org-chart
          page.tsx
      work/            ← Work OS module routes
        page.tsx
        [spaceId]/
          page.tsx
          [listId]/
            page.tsx
      crm/             ← BDR & CRM routes
      itsm/            ← Internal Ticketing
      cx/              ← Customer Experience
  components/
    work-os/           ← Work OS specific components
    hris/              ← HR specific components
    crm/               ← CRM specific components
    itsm/              ← ITSM specific components
  lib/
    permissions.ts     ← Permission check helpers
    org-tree.ts        ← Org tree traversal utilities
    sla.ts             ← SLA calculation utilities
    lead-scoring.ts    ← Lead score engine
  api/
    (routes live in app/api/)
```

## 6.3 Testing Requirements

- **Unit Tests (Vitest)**: Every utility function in `lib/` must have unit tests. Target: 100% coverage on utilities.
- **Integration Tests (Vitest + Prisma)**: Every API route must have integration tests using a test PostgreSQL database. Target: 80% coverage.
- **E2E Tests (Playwright)**: Critical user journeys must have Playwright tests: Leave application flow, Task creation flow, Deal creation and pipeline move, Ticket creation and routing.
- Run `npm run test` in CI on every PR to `develop`. Block merge on test failure.

## 6.4 Performance Standards

- No Prisma query without a corresponding database index on all WHERE and ORDER BY fields.
- All list/table pages must implement cursor-based pagination (no OFFSET). Maximum 50 records per page.
- Expensive computations (lead scoring, payroll calculation, report generation) must be offloaded to SQS worker queues.
- Core Web Vitals targets: LCP < 2.5s, FID < 100ms, CLS < 0.1. Measure with Vercel Analytics or AWS CloudWatch Synthetics.

---

# SECTION 7: PHASE A — FOUNDATION (Months 1–3, Sprints 1–9)

**Phase A Goal:** Build the foundational systems that every other module depends on. At the end of Phase A, the engineering team will have: a fully working org hierarchy system, granular permission controls, a basic but functional task management system, and a complete employee profile and leave management system.

**Phase A Git Branch:** `feature/rbac-org-tree` (Sprint 1–3), then `feature/work-os` and `feature/hris-foundation` in parallel (Sprints 4–9).

---

## EPIC A1: RBAC, Org Tree & Granular Permissions
### Sprints 1–3 (6 weeks)

### Sprint 1 Goal
Deliver the database models and API endpoints for the Organisational Hierarchy (Org Tree). By end of Sprint 1, an admin can create, read, update, and delete org nodes via API, and the visual Org Chart renders correctly in the UI.

---

### Sprint 1 User Stories

**Story A1-1:** As an Organisation Owner, I want to create a position/node in the org chart (e.g., "Marketing Head") and assign an existing member to it, so that I can establish reporting relationships.

*Acceptance Criteria:*
- GIVEN I am an authenticated Owner
- WHEN I POST to `/api/org/nodes` with a valid payload
- THEN a new OrgNode record is created with the correct parentId and memberId
- AND the API returns 201 with the created node
- AND an Audit Log entry is created
- AND if the parentId doesn't belong to my org, I receive a 400 error

**Story A1-2:** As an Organisation Owner, I want to view the entire org chart as a nested tree, so that I can see all reporting relationships at a glance.

*Acceptance Criteria:*
- GIVEN I am authenticated
- WHEN I GET `/api/org/tree`
- THEN I receive the full org tree as a nested JSON structure
- AND leaf nodes have an empty `children` array
- AND each node includes: id, positionTitle, memberId, member.name, member.avatarUrl
- AND orphaned nodes (parentId = null) appear at the root level

**Story A1-3:** As an Organisation Owner, I want to drag-and-drop a node in the Org Chart UI to change someone's reporting manager, so that I can reorganise the org structure visually.

*Acceptance Criteria:*
- GIVEN I am viewing the Org Chart page
- WHEN I drag a node and drop it onto another node
- THEN the parentId of the dragged node is updated via PATCH `/api/org/nodes/:id`
- AND the tree re-renders to reflect the new structure
- AND a confirmation toast is shown

**Story A1-4:** As an Organisation Owner, I want to delete an org node, so that I can remove positions that no longer exist.

*Acceptance Criteria:*
- GIVEN I am viewing an org node
- WHEN I click Delete and confirm
- THEN the node is soft-deleted (deletedAt is set)
- AND all children of that node are re-parented to the deleted node's parent (not orphaned)
- AND if the node had the last active member assigned, no payroll or leave records are affected

---

### Sprint 1 Prisma Schema

```prisma
// ─── Org Tree — Adjacency List Model ─────────────────────────────────────────

model OrgNode {
  id             String    @id @default(cuid())
  organizationId String
  memberId       String?   // nullable — a position can exist without a member
  parentId       String?   // null = root node (CEO/Owner)
  positionTitle  String    // e.g., "Marketing Head", "Finance Manager"
  department     String?   // e.g., "Marketing", "Engineering"
  isPrimary      Boolean   @default(true)   // false if matrix (secondary reporting line)
  sortOrder      Int       @default(0)
  isActive       Boolean   @default(true)
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  member       Member?       @relation(fields: [memberId], references: [id], onDelete: SetNull)
  parent       OrgNode?      @relation("OrgTreeHierarchy", fields: [parentId], references: [id])
  children     OrgNode[]     @relation("OrgTreeHierarchy")

  @@index([organizationId, isActive])
  @@index([organizationId, memberId])
  @@index([parentId])
  @@map("org_node")
}
```

### Sprint 1 API Contracts

**POST /api/org/nodes**
```json
// Request Body
{
  "positionTitle": "Marketing Head",
  "department": "Marketing",
  "parentId": "node_abc123",    // null for root
  "memberId": "member_xyz789"   // optional
}

// 201 Response
{
  "id": "node_new456",
  "positionTitle": "Marketing Head",
  "department": "Marketing",
  "parentId": "node_abc123",
  "memberId": "member_xyz789",
  "member": { "name": "Rahul Sharma", "avatarUrl": "..." },
  "createdAt": "2026-07-01T10:00:00Z"
}

// Error Responses
// 400: { "error": "INVALID_PARENT", "message": "Parent node does not belong to your organisation" }
// 401: { "error": "UNAUTHORIZED" }
// 403: { "error": "FORBIDDEN", "message": "You do not have permission to manage the org chart" }
```

**GET /api/org/tree**
```json
// 200 Response — nested tree structure
[
  {
    "id": "node_root",
    "positionTitle": "CEO",
    "department": null,
    "memberId": "member_owner",
    "member": { "name": "Fenar Ahmed", "avatarUrl": "..." },
    "children": [
      {
        "id": "node_mkthead",
        "positionTitle": "Marketing Head",
        "department": "Marketing",
        "memberId": "member_mkt",
        "member": { "name": "Priya Patel", "avatarUrl": "..." },
        "children": []
      }
    ]
  }
]
```

**PATCH /api/org/nodes/:id**
```json
// Request Body (partial update)
{
  "parentId": "node_newparent",
  "positionTitle": "Senior Marketing Head"
}
// 200 Response: updated OrgNode object
// 404: { "error": "NODE_NOT_FOUND" }
// 400: { "error": "CIRCULAR_REFERENCE", "message": "Cannot set a node as its own ancestor" }
```

**DELETE /api/org/nodes/:id**
```json
// 200 Response
{
  "message": "Node deleted. 2 child nodes re-parented to node_abc123.",
  "reParentedCount": 2
}
```

### Sprint 1 UI Specification

**Page: `/app/people/org-chart`**

Layout:
- Full-width canvas with zoom in/out controls (+ / - buttons and scroll wheel)
- Pan by clicking and dragging the canvas
- Each node renders as a card:
  - Employee avatar (32px circle)
  - Full name (bold)
  - Position title (gray, smaller)
  - Department badge (coloured pill)
  - Click: opens a side panel showing employee details
  - Right-click: context menu with Edit, Add Report, Remove
- Connecting lines between nodes are drawn using SVG
- Drag-and-drop: hold and drag a node card; a visual line shows the new parent on hover; drop to confirm

**Component Breakdown:**
- `OrgChartPage` — page container, fetches tree from API
- `OrgChart` — renders the tree recursively
- `OrgNode` — individual node card component
- `OrgNodePanel` — side panel for editing a node
- `AddNodeModal` — modal for adding a new node

**State Management:** Use React Query (`useQuery`) to fetch the tree. Optimistic updates on drag-and-drop. Invalidate cache after any mutation.

---

### Sprint 2 Goal
Deliver the GranularPermissionGrant system — the full permissions matrix that controls exactly what every user can do across every module.

### Sprint 2 User Stories

**Story A1-5:** As an Organisation Admin, when I add a new member, I want to see a complete permissions matrix (organised by module) and explicitly check/uncheck each permission, so that I have precise control over what the new user can access.

*Acceptance Criteria:*
- GIVEN I am an Admin onboarding a new member
- WHEN I reach the Permissions step
- THEN I see a table with: rows = permission resources, columns = actions (View, Create, Edit, Delete, Approve)
- AND permissions are pre-filled based on the selected role template
- AND I can toggle any individual checkbox
- AND clicking Save grants the selected permissions via POST `/api/permissions/grant` (batch)

**Story A1-6:** As an Organisation Admin, I want to create a custom Role Template (e.g., "Sales Representative") with pre-defined permissions, so that I can quickly onboard multiple people with the same role.

**Story A1-7:** As a system, I want to check if a user has a specific permission before executing any API operation, so that unauthorised access is prevented at the server level.

**Story A1-8:** As an Organisation Admin, I want to see a list of all members and their assigned roles/permissions, so that I can audit access levels at any time.

### Sprint 2 Prisma Schema

```prisma
// ─── Permission System ────────────────────────────────────────────────────────

// Granular permissions per member per resource per action
model GranularPermissionGrant {
  id             String   @id @default(cuid())
  organizationId String
  memberId       String
  resource       String   // e.g., "invoice", "mailbox:sales@company.com", "work-os:space:abc"
  action         String   // "view" | "create" | "edit" | "delete" | "approve"
  granted        Boolean  @default(true)
  grantedById    String   @db.Uuid
  grantedAt      DateTime @default(now())
  revokedAt      DateTime?

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  member       Member       @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([organizationId, memberId, resource, action])
  @@index([organizationId, memberId])
  @@index([memberId, resource])
  @@map("granular_permission_grant")
}

// Role Templates — pre-defined sets of permissions
model RoleTemplate {
  id             String   @id @default(cuid())
  organizationId String?  // null = system-wide template
  name           String   // "Sales Representative", "HR Manager"
  description    String?
  isSystem       Boolean  @default(false)
  permissions    Json     // Array of { resource, action, granted }
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@map("role_template")
}

// Add to Member model:
// permissionGrants GranularPermissionGrant[]
```

### Sprint 2 API Contracts

**GET /api/permissions/matrix?memberId=xxx**
```json
// Returns the full permission matrix for a specific member
{
  "memberId": "member_xyz",
  "memberName": "Priya Patel",
  "role": "member",
  "permissions": {
    "invoice": { "view": true, "create": true, "edit": true, "delete": false, "approve": false },
    "voucher": { "view": true, "create": false, "edit": false, "delete": false, "approve": false },
    "mailbox:sales@company.com": { "view": true, "create": false, "edit": false, "delete": false, "approve": false },
    "work-os:spaces": { "view": true, "create": true, "edit": true, "delete": false, "approve": false },
    "hr:leave": { "view": true, "create": false, "edit": false, "delete": false, "approve": false }
  }
}
```

**POST /api/permissions/grant** (batch)
```json
// Request Body
{
  "memberId": "member_xyz",
  "permissions": [
    { "resource": "invoice", "action": "view", "granted": true },
    { "resource": "invoice", "action": "create", "granted": true },
    { "resource": "mailbox:sales@company.com", "action": "view", "granted": true }
  ]
}
// 200 Response: { "updated": 3 }
```

**Server-side Permission Check Helper:**
```typescript
// src/lib/permissions.ts
export async function requirePermission(
  userId: string,
  organizationId: string,
  resource: string,
  action: string
): Promise<void> {
  // 1. Check if user is owner or admin — they bypass granular checks
  const member = await db.member.findUnique({ where: { organizationId_userId: { organizationId, userId } } })
  if (!member) throw new ApiError(403, 'FORBIDDEN', 'Not a member of this organisation')
  if (member.role === 'owner' || member.role === 'admin') return // Full access

  // 2. Check granular permission grant
  const grant = await db.granularPermissionGrant.findUnique({
    where: { organizationId_memberId_resource_action: { organizationId, memberId: member.id, resource, action } }
  })
  if (!grant || !grant.granted || grant.revokedAt) {
    throw new ApiError(403, 'FORBIDDEN', `You do not have ${action} permission on ${resource}`)
  }
}
```

### Sprint 3 Goal
Integrate the permissions system with the member onboarding flow. Deliver the Permission Matrix UI inside the Settings > Team Members page. Deliver Role Templates CRUD.

---

## EPIC A2: Work OS Foundation — Spaces, Lists, Tasks
### Sprints 4–6 (6 weeks)

### Sprint 4 Goal
Deliver the database models for the full Work OS hierarchy (Space, Folder, ProjectList, Task, Subtask) and the core API endpoints. Users can create spaces, create lists within spaces, and create, read, update, and delete tasks.

### Sprint 4 User Stories

**Story A2-1:** As a team member, I want to create a Space (e.g., "Marketing") so that I can organise work for my department.

**Story A2-2:** As a team member, I want to create a List/Project inside a Space (e.g., "Q3 Campaign") so that I have a container for related tasks.

**Story A2-3:** As a team member, I want to create a Task inside a List with a title, description, assignee, and due date, so that I can track a piece of work.

**Story A2-4:** As a team member, I want to add Subtasks to a Task so that I can break it down into smaller actionable steps.

**Story A2-5:** As a team member, I want to add a Checklist to a Task so that I can track granular action items within a single task.

**Story A2-6:** As a team member, I want to comment on a Task so that I can communicate with my team within the context of the work.

**Story A2-7:** As a Space Admin, I want to define custom statuses for my space (e.g., "Ideation → Copywriting → Published") so that the workflow matches my team's actual process.

**Story A2-8:** As a system, I should enforce space membership — users who are not members of a Space must not be able to see or interact with tasks in that Space.

### Sprint 4 Prisma Schema

```prisma
// ─── Work OS Core Hierarchy ───────────────────────────────────────────────────

enum SpaceVisibility {
  PUBLIC
  PRIVATE
  SHARED
}

enum TaskPriority {
  URGENT
  HIGH
  NORMAL
  LOW
  NONE
}

model Space {
  id             String          @id @default(cuid())
  organizationId String
  name           String
  description    String?
  icon           String?         // emoji or icon name
  color          String?         // hex color
  visibility     SpaceVisibility @default(PUBLIC)
  isArchived     Boolean         @default(false)
  sortOrder      Int             @default(0)
  createdById    String          @db.Uuid
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  organization  Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  memberships   SpaceMembership[]
  folders       Folder[]
  lists         ProjectList[]    // lists not inside a folder
  customStatuses CustomStatus[]
  sprints       Sprint[]
  goals         Goal[]

  @@index([organizationId, isArchived])
  @@map("space")
}

model SpaceMembership {
  id         String   @id @default(cuid())
  spaceId    String
  memberId   String
  role       String   @default("member") // "owner" | "admin" | "member" | "viewer"
  joinedAt   DateTime @default(now())

  space  Space  @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([spaceId, memberId])
  @@map("space_membership")
}

model Folder {
  id        String   @id @default(cuid())
  spaceId   String
  name      String
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  space Space        @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  lists ProjectList[]

  @@index([spaceId])
  @@map("folder")
}

model ProjectList {
  id          String   @id @default(cuid())
  spaceId     String
  folderId    String?
  name        String
  description String?
  color       String?
  isArchived  Boolean  @default(false)
  sortOrder   Int      @default(0)
  createdById String   @db.Uuid
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  space   Space   @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  folder  Folder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
  tasks   Task[]
  customStatuses CustomStatus[]

  @@index([spaceId, isArchived])
  @@map("project_list")
}

model CustomStatus {
  id           String   @id @default(cuid())
  spaceId      String?
  listId       String?
  name         String   // "To Do", "In Progress", "Review", "Done"
  color        String   // "#6366F1"
  statusType   String   // "OPEN" | "ACTIVE" | "CLOSED"
  sortOrder    Int      @default(0)

  space    Space?       @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  list     ProjectList? @relation(fields: [listId], references: [id], onDelete: Cascade)
  tasks    Task[]

  @@index([spaceId])
  @@index([listId])
  @@map("custom_status")
}

model Task {
  id             String       @id @default(cuid())
  listId         String
  parentTaskId   String?      // null = top-level task; set = subtask
  statusId       String
  title          String
  description    String?      // markdown content
  priority       TaskPriority @default(NORMAL)
  dueDate        DateTime?
  startDate      DateTime?
  estimatedHours Float?
  storyPoints    Int?
  sprintId       String?
  isArchived     Boolean      @default(false)
  isRecurring    Boolean      @default(false)
  recurringRule  String?      // rrule string e.g. "FREQ=WEEKLY;BYDAY=MO"
  // CRM & Finance Linkages
  linkedDealId    String?
  linkedInvoiceId String?
  createdById    String       @db.Uuid
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  deletedAt      DateTime?

  list        ProjectList   @relation(fields: [listId], references: [id], onDelete: Cascade)
  parentTask  Task?         @relation("TaskHierarchy", fields: [parentTaskId], references: [id])
  subtasks    Task[]        @relation("TaskHierarchy")
  status      CustomStatus  @relation(fields: [statusId], references: [id])
  assignees   TaskAssignee[]
  watchers    TaskWatcher[]
  checklists  TaskChecklist[]
  comments    TaskComment[]
  attachments TaskAttachment[]
  tags        TaskTag[]
  dependencies TaskDependency[] @relation("BlockingTask")
  blockedBy    TaskDependency[] @relation("BlockedTask")
  timeEntries  TimeEntry[]
  customFieldValues TaskCustomFieldValue[]
  sprint       Sprint?      @relation(fields: [sprintId], references: [id])

  @@index([listId, isArchived])
  @@index([parentTaskId])
  @@index([statusId])
  @@index([sprintId])
  @@map("task")
}

model TaskAssignee {
  taskId   String
  memberId String
  assignedAt DateTime @default(now())

  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@id([taskId, memberId])
  @@map("task_assignee")
}

model TaskWatcher {
  taskId   String
  memberId String

  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@id([taskId, memberId])
  @@map("task_watcher")
}

model TaskChecklist {
  id        String   @id @default(cuid())
  taskId    String
  item      String
  completed Boolean  @default(false)
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId])
  @@map("task_checklist")
}

model TaskComment {
  id           String   @id @default(cuid())
  taskId       String
  authorId     String   @db.Uuid
  content      String   // markdown
  isEdited     Boolean  @default(false)
  editedAt     DateTime?
  createdAt    DateTime @default(now())
  deletedAt    DateTime?
  attachments  TaskCommentAttachment[]

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([taskId, createdAt])
  @@map("task_comment")
}

model TaskCommentAttachment {
  id        String @id @default(cuid())
  commentId String
  name      String
  url       String
  size      Int
  mimeType  String

  comment TaskComment @relation(fields: [commentId], references: [id], onDelete: Cascade)

  @@map("task_comment_attachment")
}

model TaskAttachment {
  id       String   @id @default(cuid())
  taskId   String
  name     String
  url      String
  size     Int
  mimeType String
  uploadedById String @db.Uuid
  uploadedAt   DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@map("task_attachment")
}

model TaskTag {
  taskId String
  tag    String
  color  String?

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@id([taskId, tag])
  @@map("task_tag")
}

model TaskDependency {
  id            String @id @default(cuid())
  blockingTaskId String  // this task must be done first
  blockedTaskId  String  // this task is waiting
  type          String  // "BLOCKING" | "WAITING_ON" | "RELATED"

  blockingTask Task @relation("BlockingTask", fields: [blockingTaskId], references: [id], onDelete: Cascade)
  blockedTask  Task @relation("BlockedTask",  fields: [blockedTaskId],  references: [id], onDelete: Cascade)

  @@unique([blockingTaskId, blockedTaskId])
  @@map("task_dependency")
}

model CustomFieldDefinition {
  id          String   @id @default(cuid())
  spaceId     String?
  listId      String?
  name        String
  fieldType   String   // "TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "CHECKBOX" | "MEMBER" | "CURRENCY"
  options     Json?    // for DROPDOWN: [{ value, color }]
  isRequired  Boolean  @default(false)
  sortOrder   Int      @default(0)
  createdAt   DateTime @default(now())

  values TaskCustomFieldValue[]

  @@map("custom_field_definition")
}

model TaskCustomFieldValue {
  id          String @id @default(cuid())
  taskId      String
  fieldId     String
  textValue   String?
  numberValue Float?
  dateValue   DateTime?
  jsonValue   Json?

  task  Task                 @relation(fields: [taskId], references: [id], onDelete: Cascade)
  field CustomFieldDefinition @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  @@unique([taskId, fieldId])
  @@map("task_custom_field_value")
}
```

### Sprint 4 API Contracts

**POST /api/work/spaces**
```json
// Request
{ "name": "Marketing", "description": "All marketing work", "visibility": "PUBLIC", "color": "#F59E0B", "icon": "📣" }
// 201 Response
{ "id": "space_abc", "name": "Marketing", ... }
```

**GET /api/work/spaces**
```json
// Returns spaces the current user is a member of
[{ "id": "space_abc", "name": "Marketing", "listCount": 5, "memberCount": 8 }]
```

**POST /api/work/spaces/:spaceId/lists**
```json
// Request
{ "name": "Q3 Campaign", "folderId": null }
// 201 Response
{ "id": "list_xyz", "name": "Q3 Campaign", "spaceId": "space_abc" }
```

**POST /api/work/lists/:listId/tasks**
```json
// Request
{
  "title": "Write landing page copy",
  "description": "Write compelling copy for the Q3 campaign landing page",
  "priority": "HIGH",
  "dueDate": "2026-08-15T00:00:00Z",
  "assigneeIds": ["member_abc", "member_def"],
  "statusId": "status_todo"
}
// 201 Response: complete Task object with assignees and status
```

**PATCH /api/work/tasks/:taskId**
```json
// Partial update — any combination of fields
{
  "statusId": "status_done",
  "priority": "URGENT"
}
```

**GET /api/work/lists/:listId/tasks**
```json
// Query params: status, assignee, priority, page, pageSize, cursor
// Returns paginated tasks with assignees, status, checklist summary
{
  "tasks": [...],
  "nextCursor": "cursor_abc",
  "total": 47
}
```

### Sprint 5 Goal
Deliver the List View and Board View (Kanban) UI for tasks. Implement real-time updates so task changes by one user are reflected immediately for all other users viewing the same list.

### Sprint 5 UI Specification

**Page: `/app/work/[spaceId]/[listId]`**

**List View:**
- Table layout with columns: Checkbox (select), Status pill, Title, Assignees (stacked avatars), Priority badge, Due date, Tags
- Clicking a row opens a Task Detail Side Panel (slides in from the right, 480px wide)
- "Add Task" button at the bottom of each status group — opens inline input
- Grouping: tasks grouped by Status by default. Can switch to group by: Assignee, Priority, Due Date
- Sorting: click any column header to sort ascending/descending
- Filtering: filter bar at the top — filter by assignee, priority, due date range, tag

**Board View (Kanban):**
- Columns = each custom status
- Cards show: title, assignee avatar(s), priority icon, due date, subtask count (e.g., "2/5 subtasks")
- Drag a card between columns to change its status — triggers PATCH /api/work/tasks/:id
- Cards per column are sorted by priority then due date
- "Add Task" card at the bottom of each column

**Task Detail Side Panel:**
- Left column (60%): Title (editable inline), Description (TipTap rich text editor), Subtasks list, Checklist, Comments thread
- Right column (40%): Status selector, Assignee multi-picker, Priority picker, Due date picker, Time estimate input, Tags, Attachments, Activity log
- Real-time: if another user updates the task, the panel updates without a page reload

**Real-time Implementation:**
```typescript
// Subscribe to task changes via Supabase Realtime
const channel = supabase
  .channel(`task:${taskId}`)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'task', filter: `id=eq.${taskId}` },
    (payload) => { queryClient.invalidateQueries(['task', taskId]) }
  )
  .subscribe()
```

### Sprint 6 Goal
Deliver space-level permission enforcement. Only Space members can see space data. Deliver the Space Members management UI (add/remove members, set their role in the space). Deliver the "My Tasks" view across all spaces.

---

## EPIC A3: HRIS Foundation — Employee Profiles, Org Chart & Leave Management
### Sprints 7–9 (6 weeks)

### Sprint 7 Goal
Deliver the Employee Profile system — every team member has a rich profile with personal, employment, and HR data. Deliver the Employee Directory page.

### Sprint 7 Prisma Schema

```prisma
// ─── Employee / HR Profiles ───────────────────────────────────────────────────

enum EmploymentType {
  FULL_TIME
  PART_TIME
  CONTRACTOR
  INTERN
}

enum EmployeeStatus {
  ACTIVE
  ON_NOTICE
  OFFBOARDED
  ON_LEAVE
}

model EmployeeProfile {
  id             String         @id @default(cuid())
  organizationId String
  memberId       String         @unique
  employeeCode   String?        // e.g., "EMP-001"

  // Personal
  fullName       String
  dateOfBirth    DateTime?      @db.Date
  gender         String?
  personalEmail  String?
  personalPhone  String?
  address        String?
  city           String?
  country        String         @default("IN")
  emergencyContactName  String?
  emergencyContactPhone String?

  // Employment
  jobTitle       String?
  department     String?
  employmentType EmploymentType @default(FULL_TIME)
  status         EmployeeStatus @default(ACTIVE)
  startDate      DateTime       @db.Date
  probationEndDate DateTime?    @db.Date
  exitDate       DateTime?      @db.Date
  exitReason     String?

  // Compensation (HR/Finance eyes only — enforced by RLS)
  salaryGrade    String?
  currentSalary  Float?
  salaryCurrency String         @default("INR")
  bankName       String?
  bankAccountNo  String?        // encrypted at application layer
  bankIFSC       String?
  panNumber      String?        // encrypted at application layer
  pfAccountNo    String?
  esiNumber      String?

  // Skills & Education
  skills         String[]       @default([])

  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  member       Member       @relation(fields: [memberId], references: [id], onDelete: Cascade)
  leaveBalances LeaveBalance[]
  leaveRequests LeaveRequest[]
  attendanceRecords AttendanceRecord[]
  performanceReviews PerformanceReview[] @relation("RevieweeReviews")
  reviewsGiven       PerformanceReview[] @relation("ReviewerReviews")

  @@index([organizationId, status])
  @@index([organizationId, department])
  @@map("employee_profile")
}
```

### Sprint 8 Goal
Deliver the full Leave Management system. Admin configures leave types and policies. Employees apply for leave. Managers approve or reject. Balances are updated automatically.

### Sprint 8 Prisma Schema

```prisma
// ─── Leave Management ─────────────────────────────────────────────────────────

enum LeaveRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
  PENDING_INFO
}

model LeaveType {
  id             String   @id @default(cuid())
  organizationId String
  name           String   // "Casual Leave", "Sick Leave"
  code           String   // "CL", "SL"
  color          String   @default("#6366F1")
  description    String?
  maxDaysPerYear Int?
  accrualRatePerMonth Float? // days accrued per month
  carryForwardLimit   Int    @default(0)
  isEncashable   Boolean  @default(false)
  requiresApproval Boolean @default(true)
  requiresDocument Boolean @default(false) // e.g., sick leave > 3 days requires doctor note
  allowHalfDay   Boolean  @default(true)
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())

  organization  Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  leaveBalances LeaveBalance[]
  leaveRequests LeaveRequest[]

  @@unique([organizationId, code])
  @@map("leave_type")
}

model LeaveBalance {
  id               String   @id @default(cuid())
  employeeProfileId String
  leaveTypeId      String
  fiscalYear       Int      // e.g., 2026
  totalDays        Float    @default(0)
  usedDays         Float    @default(0)
  pendingDays      Float    @default(0)
  remainingDays    Float    @default(0)
  carriedForward   Float    @default(0)
  lastAccrualDate  DateTime?
  updatedAt        DateTime @updatedAt

  employee  EmployeeProfile @relation(fields: [employeeProfileId], references: [id], onDelete: Cascade)
  leaveType LeaveType       @relation(fields: [leaveTypeId], references: [id], onDelete: Cascade)

  @@unique([employeeProfileId, leaveTypeId, fiscalYear])
  @@map("leave_balance")
}

model LeaveRequest {
  id               String             @id @default(cuid())
  organizationId   String
  employeeProfileId String
  leaveTypeId      String
  status           LeaveRequestStatus @default(PENDING)

  startDate        DateTime           @db.Date
  endDate          DateTime           @db.Date
  numberOfDays     Float              // calculated, allowing half-days
  isHalfDay        Boolean            @default(false)
  halfDayPeriod    String?            // "MORNING" | "AFTERNOON"
  reason           String
  documentUrl      String?            // supporting document if required
  approverComment  String?
  approvedById     String?

  // Payroll linkage — set when leave is approved
  payrollImpact    String?            // "NONE" | "LOP" (Loss of Pay)
  payrollRunId     String?            // linked to payroll run where deduction applies

  createdAt        DateTime           @default(now())
  updatedAt        DateTime           @updatedAt

  organization  Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  employee      EmployeeProfile @relation(fields: [employeeProfileId], references: [id])
  leaveType     LeaveType       @relation(fields: [leaveTypeId], references: [id])
  approvalSteps LeaveApprovalStep[]

  @@index([organizationId, status])
  @@index([employeeProfileId, startDate])
  @@map("leave_request")
}

model LeaveApprovalStep {
  id             String             @id @default(cuid())
  leaveRequestId String
  stepNumber     Int
  approverId     String             // memberId of the approver
  status         LeaveRequestStatus @default(PENDING)
  comment        String?
  actedAt        DateTime?
  notifiedAt     DateTime?

  leaveRequest LeaveRequest @relation(fields: [leaveRequestId], references: [id], onDelete: Cascade)

  @@index([leaveRequestId])
  @@map("leave_approval_step")
}

model PublicHoliday {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  date           DateTime @db.Date
  region         String?  // "PAN_INDIA" | "Maharashtra" | custom
  isRecurring    Boolean  @default(false)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId, date])
  @@map("public_holiday")
}
```

### Sprint 8 Business Logic — Leave Request Flow

```
1. Employee submits leave request
   → Validate: dates are in future, sufficient balance, no conflict with existing approved leaves
   → Set status = PENDING
   → Query OrgTree to find direct manager
   → Create LeaveApprovalStep (stepNumber=1, approverId=directManagerId)
   → Send in-app notification + email to direct manager
   → Deduct `pendingDays` from LeaveBalance

2. Manager receives notification
   → Manager can: Approve, Reject, or Request More Info
   
3a. On APPROVE:
   → Set LeaveApprovalStep.status = APPROVED, actedAt = now
   → If no more steps, set LeaveRequest.status = APPROVED
   → Move pendingDays to usedDays in LeaveBalance
   → If LeaveType is Unpaid: set payrollImpact = "LOP", flag the relevant PayrollRun
   → Update EmployeeProfile.status = "ON_LEAVE" if leave starts today
   → Notify employee of approval
   → Create event on Team Calendar

3b. On REJECT:
   → Set LeaveApprovalStep.status = REJECTED
   → Set LeaveRequest.status = REJECTED
   → Add pendingDays back to LeaveBalance (cancel the pending hold)
   → Notify employee with approver's comment

4. On CANCEL (by employee, only if still PENDING):
   → Set LeaveRequest.status = CANCELLED
   → Add pendingDays back to LeaveBalance
```

### Sprint 8 API Contracts

**POST /api/hr/leave/request**
```json
// Request
{
  "leaveTypeId": "lt_casual",
  "startDate": "2026-08-01",
  "endDate": "2026-08-03",
  "reason": "Personal family event",
  "isHalfDay": false
}
// 201 Response
{
  "id": "lr_abc123",
  "status": "PENDING",
  "numberOfDays": 3,
  "leaveType": { "name": "Casual Leave", "code": "CL" },
  "approver": { "name": "Rahul Sharma", "position": "Marketing Head" }
}
// Error Cases:
// 400 INSUFFICIENT_BALANCE: remaining days < requested days
// 400 DATE_CONFLICT: overlaps with existing approved leave
// 400 HOLIDAY_CONFLICT: selected dates include public holidays
// 400 PAST_DATE: start date is in the past
```

**PATCH /api/hr/leave/requests/:id/approve**
```json
// Request (by manager)
{ "comment": "Approved. Have a good break!" }
// 200 Response: { "status": "APPROVED", "approvedAt": "2026-07-15T09:00:00Z" }
// Error: 403 if caller is not the designated approver for this step
```

**GET /api/hr/leave/team-calendar?month=2026-08**
```json
// Returns all approved leaves for the caller's department for the month
{
  "month": "2026-08",
  "leaves": [
    {
      "employeeName": "Priya Patel",
      "avatarUrl": "...",
      "leaveType": "Casual Leave",
      "startDate": "2026-08-01",
      "endDate": "2026-08-03",
      "days": 3
    }
  ],
  "holidays": [
    { "name": "Independence Day", "date": "2026-08-15" }
  ]
}
```

### Sprint 9 Goal
Deliver the Attendance Management system. Web clock-in/clock-out. Daily attendance report. Regularisation request flow. Payroll integration for LOP calculation.

### Sprint 9 Prisma Schema

```prisma
// ─── Attendance Management ────────────────────────────────────────────────────

enum AttendanceStatus {
  PRESENT
  ABSENT
  HALF_DAY
  ON_LEAVE
  HOLIDAY
  WEEKEND
}

model AttendanceRecord {
  id               String           @id @default(cuid())
  organizationId   String
  employeeProfileId String
  date             DateTime         @db.Date
  status           AttendanceStatus
  clockIn          DateTime?
  clockOut         DateTime?
  totalHours       Float?           // calculated
  overtimeHours    Float?           // hours beyond standard working hours
  isRegularised    Boolean          @default(false)
  regularisedById  String?          @db.Uuid
  regularisedAt    DateTime?
  regularisationNote String?
  createdAt        DateTime         @default(now())
  updatedAt        DateTime         @updatedAt

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  employee     EmployeeProfile @relation(fields: [employeeProfileId], references: [id])

  @@unique([employeeProfileId, date])
  @@index([organizationId, date])
  @@map("attendance_record")
}
```

---

# SECTION 8: PHASE B — CORE MODULES (Months 4–6, Sprints 10–21)

**Phase B Git Branches:** Multiple parallel worktrees.
- `feature/work-os` continues (Sprints 10–12)
- `feature/hris-foundation` continues (Sprints 13–15)
- `feature/bdr-crm` (new worktree, Sprints 16–18) — PARALLEL with B2
- `feature/itsm` (new worktree, Sprints 19–21) — PARALLEL with B3

---

## EPIC B1: Work OS Advanced — Gantt, Workload, Time Tracking & Sprints
### Sprints 10–12 (6 weeks)

### Sprint 10 Goal
Deliver Time Tracking (native timer per task, manual entry, timesheets). Deliver the Gantt/Timeline View with dependency visualisation.

### Sprint 10 Prisma Schema

```prisma
// ─── Time Tracking ────────────────────────────────────────────────────────────

model TimeEntry {
  id          String   @id @default(cuid())
  taskId      String
  memberId    String
  description String?
  startedAt   DateTime
  endedAt     DateTime?
  minutes     Int?     // calculated on endedAt
  isBillable  Boolean  @default(false)
  isBillToClient Boolean @default(false)
  billedClientId String? // CRM Company link
  isManual    Boolean  @default(false)
  createdAt   DateTime @default(now())

  task   Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  member Member @relation(fields: [memberId], references: [id])

  @@index([taskId])
  @@index([memberId, startedAt])
  @@map("time_entry")
}
```

### Sprint 10 Business Logic — Time Tracking

```
Start Timer:
- POST /api/work/time/start { taskId }
- Check: no existing running timer for this member (only one at a time)
- Create TimeEntry with startedAt = now(), endedAt = null
- Return timer state

Stop Timer:
- POST /api/work/time/stop { entryId }
- Set endedAt = now()
- Calculate minutes = (endedAt - startedAt) / 60
- Update TimeEntry

Manual Entry:
- POST /api/work/time/manual { taskId, startedAt, endedAt, description }
- Validate: endedAt > startedAt, duration < 24 hours
- Create TimeEntry with isManual = true
```

### Sprint 11 Goal
Deliver Sprint Management (Sprint cycles, Backlog, Sprint Planning Board, Burndown Chart). Deliver the Workload View.

### Sprint 11 Prisma Schema

```prisma
// ─── Sprint Management ────────────────────────────────────────────────────────

model Sprint {
  id          String    @id @default(cuid())
  spaceId     String
  name        String    // "Sprint 1", "Sprint Q3-W1"
  goal        String?
  startDate   DateTime  @db.Date
  endDate     DateTime  @db.Date
  isActive    Boolean   @default(false)
  isCompleted Boolean   @default(false)
  velocity    Int?      // story points completed in this sprint
  createdAt   DateTime  @default(now())

  space Space  @relation(fields: [spaceId], references: [id], onDelete: Cascade)
  tasks Task[]

  @@index([spaceId, isActive])
  @@map("sprint")
}
```

### Sprint 12 Goal
Deliver the Mind Map View and the Forms feature (custom intake forms that create tasks).

---

## EPIC B2: HR Advanced — Performance Reviews, Payroll Integration & Offboarding
### Sprints 13–15 (6 weeks)

### Sprint 13 Goal
Deliver the Performance Review system — cycle creation, self-review, manager review, peer review, 360 review.

### Sprint 13 Prisma Schema

```prisma
// ─── Performance Management ───────────────────────────────────────────────────

enum ReviewCycleStatus {
  DRAFT
  ACTIVE
  CLOSED
}

model ReviewCycle {
  id             String            @id @default(cuid())
  organizationId String
  name           String            // "Q2 2026 Annual Review"
  reviewType     String            // "SELF" | "MANAGER" | "PEER" | "360"
  status         ReviewCycleStatus @default(DRAFT)
  startDate      DateTime
  endDate        DateTime
  selfReviewDeadline     DateTime?
  peerReviewDeadline     DateTime?
  managerReviewDeadline  DateTime?
  ratingScale    Int               @default(5)   // 1-5 or 1-10
  createdAt      DateTime          @default(now())

  organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  reviews      PerformanceReview[]

  @@index([organizationId, status])
  @@map("review_cycle")
}

model PerformanceReview {
  id              String   @id @default(cuid())
  cycleId         String
  revieweeId      String   // EmployeeProfile being reviewed
  reviewerId      String   // EmployeeProfile doing the reviewing
  reviewType      String   // "SELF" | "MANAGER" | "PEER"
  status          String   @default("PENDING") // "PENDING" | "SUBMITTED" | "ACKNOWLEDGED"
  ratings         Json     // { "communication": 4, "deliverables": 5, "teamwork": 3 }
  qualitative     Json?    // { "strengths": "...", "improvements": "...", "overall": "..." }
  overallRating   Float?
  calibratedRating Float?  // adjusted by HR after calibration
  submittedAt     DateTime?
  acknowledgedAt  DateTime?
  createdAt       DateTime @default(now())

  cycle    ReviewCycle     @relation(fields: [cycleId], references: [id])
  reviewee EmployeeProfile @relation("RevieweeReviews", fields: [revieweeId], references: [id])
  reviewer EmployeeProfile @relation("ReviewerReviews", fields: [reviewerId], references: [id])

  @@unique([cycleId, revieweeId, reviewerId, reviewType])
  @@map("performance_review")
}
```

### Sprint 14 Goal
Deliver the Onboarding and Offboarding workflow engine. When a new employee is created → auto-trigger onboarding task list. When exitDate is set → auto-trigger offboarding task list.

### Sprint 14 Onboarding Workflow Logic

```
Trigger: EmployeeProfile created with startDate within 7 days

Actions (in order):
1. Create WorkOS task list: "Onboarding - [Employee Name]" in the HR Space
2. Create Task: "Send welcome email" (assigned to HR, due: startDate - 2 days)
3. Create Task: "Set up laptop & accounts" (assigned to IT Manager, due: startDate)
4. Create Task: "Create email account" (assigned to IT, due: startDate - 1 day)
5. Create Internal ITSM Ticket: "IT Setup for [Name]" (routes to IT)
6. Create Task: "Introduce to team" (assigned to Reporting Manager, due: startDate)
7. Create Task: "30-day check-in" (assigned to Reporting Manager, due: startDate + 30 days)
8. Create Task: "Probation review" (assigned to HR, due: probationEndDate)
9. Send automated welcome email to employee's personal email with login link
```

### Sprint 15 Goal
Deliver deep Payroll integration. Leave deductions auto-applied to payroll runs. Expense Reimbursement module. Full & Final settlement calculations for exiting employees.

---

## EPIC B3: BDR & CRM — Leads, Deals, Pipelines, Proposals & Email Sequences
### Sprints 16–18 (6 weeks) — PARALLEL WORKTREE: `../slipwise-crm`

### Sprint 16 Goal
Deliver the full CRM data model. Contacts, Companies, Pipelines, Stages, Deals. Core CRUD APIs. Pipeline Kanban board UI.

### Sprint 16 Prisma Schema

```prisma
// ─── CRM / BDR Module ─────────────────────────────────────────────────────────

enum DealStatus {
  OPEN
  WON
  LOST
  ABANDONED
}

model CrmContact {
  id             String    @id @default(cuid())
  organizationId String
  companyId      String?
  ownerId        String    // memberId of the BDR who owns this contact
  firstName      String
  lastName       String?
  email          String?
  phone          String?
  jobTitle       String?
  linkedInUrl    String?
  source         String?   // "WEBSITE" | "REFERRAL" | "COLD_OUTREACH" | "EVENT"
  leadScore      Int       @default(0)
  fitScore       Int       @default(0)
  engagementScore Int      @default(0)
  tags           String[]  @default([])
  isUnsubscribed Boolean   @default(false)
  lastActivityAt DateTime?
  notes          String?
  customFields   Json?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  company      CrmCompany?  @relation(fields: [companyId], references: [id])
  deals        CrmDeal[]
  activities   CrmActivity[]
  sequenceEnrollments SequenceEnrollment[]
  meetingBookings     MeetingBooking[]

  @@index([organizationId, ownerId])
  @@index([organizationId, leadScore])
  @@map("crm_contact")
}

model CrmCompany {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  website        String?
  industry       String?
  size           String?  // "1-10" | "11-50" | "51-200" | "200+"
  annualRevenue  Float?
  country        String?
  city           String?
  notes          String?
  customFields   Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  contacts     CrmContact[]
  deals        CrmDeal[]

  @@index([organizationId])
  @@map("crm_company")
}

model CrmPipeline {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  isDefault      Boolean  @default(false)
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  stages       CrmStage[]
  deals        CrmDeal[]

  @@map("crm_pipeline")
}

model CrmStage {
  id          String   @id @default(cuid())
  pipelineId  String
  name        String   // "Prospect" | "Discovery Call" | "Proposal Sent"
  probability Int      @default(0)  // 0-100 %
  sortOrder   Int      @default(0)
  color       String?

  pipeline CrmPipeline @relation(fields: [pipelineId], references: [id], onDelete: Cascade)
  deals    CrmDeal[]

  @@index([pipelineId])
  @@map("crm_stage")
}

model CrmDeal {
  id             String     @id @default(cuid())
  organizationId String
  pipelineId     String
  stageId        String
  contactId      String?
  companyId      String?
  ownerId        String     // BDR member ID
  name           String
  value          Float      @default(0)
  currency       String     @default("INR")
  status         DealStatus @default(OPEN)
  expectedCloseDate DateTime?
  actualCloseDate   DateTime?
  winReason      String?
  lossReason     String?
  lostToCompetitor String?
  customFields   Json?
  // Finance linkages
  linkedInvoiceId  String?
  linkedContractId String?
  linkedQuoteId    String?
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  pipeline     CrmPipeline  @relation(fields: [pipelineId], references: [id])
  stage        CrmStage     @relation(fields: [stageId], references: [id])
  contact      CrmContact?  @relation(fields: [contactId], references: [id])
  company      CrmCompany?  @relation(fields: [companyId], references: [id])
  activities   CrmActivity[]
  proposals    Proposal[]
  contracts    Contract[]

  @@index([organizationId, status])
  @@index([organizationId, ownerId])
  @@index([stageId])
  @@map("crm_deal")
}

model CrmActivity {
  id          String   @id @default(cuid())
  organizationId String
  contactId   String?
  dealId      String?
  memberId    String   // who logged the activity
  type        String   // "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK"
  subject     String?
  description String?
  outcome     String?  // "CONNECTED" | "NO_ANSWER" | "VOICEMAIL"
  duration    Int?     // minutes (for calls/meetings)
  datedAt     DateTime // when the activity happened
  taskId      String?  // linked Work OS task
  createdAt   DateTime @default(now())

  contact  CrmContact? @relation(fields: [contactId], references: [id])
  deal     CrmDeal?    @relation(fields: [dealId], references: [id])

  @@index([contactId, datedAt])
  @@index([dealId, datedAt])
  @@map("crm_activity")
}
```

### Sprint 17 Goal
Deliver Email Sequences. Lead Scoring Engine. Meeting Booking. Activity Timeline UI.

### Sprint 17 Prisma Schema

```prisma
// ─── Email Sequences ──────────────────────────────────────────────────────────

model EmailSequence {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  isActive       Boolean  @default(true)
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())

  organization   Organization         @relation(fields: [organizationId], references: [id])
  steps          EmailSequenceStep[]
  enrollments    SequenceEnrollment[]

  @@map("email_sequence")
}

model EmailSequenceStep {
  id         String   @id @default(cuid())
  sequenceId String
  stepNumber Int
  subject    String
  body       String   // HTML with {{First Name}} tokens
  delayDays  Int      @default(0)  // days after previous step
  delayHours Int      @default(9)  // send at this hour
  createdAt  DateTime @default(now())

  sequence EmailSequence @relation(fields: [sequenceId], references: [id], onDelete: Cascade)

  @@unique([sequenceId, stepNumber])
  @@map("email_sequence_step")
}

model SequenceEnrollment {
  id         String   @id @default(cuid())
  sequenceId String
  contactId  String
  status     String   @default("ACTIVE") // "ACTIVE" | "PAUSED" | "COMPLETED" | "UNSUBSCRIBED"
  currentStep Int     @default(1)
  pauseReason String? // "REPLIED" | "MEETING_BOOKED" | "MANUAL"
  enrolledAt  DateTime @default(now())
  completedAt DateTime?

  sequence EmailSequence @relation(fields: [sequenceId], references: [id])
  contact  CrmContact    @relation(fields: [contactId], references: [id])

  @@unique([sequenceId, contactId])
  @@map("sequence_enrollment")
}

// ─── Meeting Booking ──────────────────────────────────────────────────────────

model MeetingBookingPage {
  id          String   @id @default(cuid())
  memberId    String   @unique
  slug        String   @unique  // /book/rahul-sharma
  title       String
  duration    Int      @default(30)   // minutes
  description String?
  bufferBefore Int     @default(15)   // minutes before next meeting
  bufferAfter  Int     @default(15)
  availableDays String[] @default(["MON","TUE","WED","THU","FRI"])
  startTime   String   @default("09:00")
  endTime     String   @default("18:00")
  timezone    String   @default("Asia/Kolkata")
  calendarProvider String? // "GOOGLE" | "OUTLOOK"
  createdAt   DateTime @default(now())

  member   Member          @relation(fields: [memberId], references: [id])
  bookings MeetingBooking[]

  @@map("meeting_booking_page")
}

model MeetingBooking {
  id          String   @id @default(cuid())
  pageId      String
  contactId   String?
  bookerName  String
  bookerEmail String
  scheduledAt DateTime
  duration    Int
  meetLink    String?   // Google Meet / Zoom link
  status      String    @default("CONFIRMED") // "CONFIRMED" | "CANCELLED" | "RESCHEDULED"
  cancelledAt DateTime?
  createdAt   DateTime  @default(now())

  page    MeetingBookingPage @relation(fields: [pageId], references: [id])
  contact CrmContact?         @relation(fields: [contactId], references: [id])

  @@map("meeting_booking")
}
```

### Sprint 17 Lead Scoring Engine

```typescript
// src/lib/lead-scoring.ts

interface LeadScoreFactors {
  companySize: string | null       // "1-10" | "11-50" | "51-200" | "200+"
  industry: string | null
  jobTitle: string | null
  emailReplied: boolean
  emailOpened: number              // count
  meetingAttended: boolean
  proposalOpened: boolean
  followUpsIgnored: number         // count
}

export function calculateLeadScore(factors: LeadScoreFactors): { fitScore: number; engagementScore: number; total: number } {
  let fitScore = 0
  let engagementScore = 0

  // Fit Score — based on ICP match
  if (factors.companySize === '200+') fitScore += 30
  else if (factors.companySize === '51-200') fitScore += 20
  else if (factors.companySize === '11-50') fitScore += 10

  if (factors.jobTitle?.toLowerCase().includes('ceo') || factors.jobTitle?.toLowerCase().includes('founder')) fitScore += 25
  else if (factors.jobTitle?.toLowerCase().includes('head') || factors.jobTitle?.toLowerCase().includes('vp')) fitScore += 15
  else if (factors.jobTitle?.toLowerCase().includes('manager')) fitScore += 8

  // Engagement Score — based on behavioural signals
  if (factors.emailReplied) engagementScore += 25
  engagementScore += Math.min(factors.emailOpened * 5, 20)  // max 20 pts from opens
  if (factors.meetingAttended) engagementScore += 30
  if (factors.proposalOpened) engagementScore += 20
  engagementScore -= factors.followUpsIgnored * 5  // penalty for ignoring

  const total = Math.min(Math.max(fitScore + engagementScore, 0), 100)
  return { fitScore, engagementScore, total }
}
```

### Sprint 18 Goal
Deliver Proposal Builder, Pricing Approval Workflow, Contract CLM. Revenue Analytics Dashboard.

### Sprint 18 Prisma Schema

```prisma
// ─── Proposals & Contracts ────────────────────────────────────────────────────

enum ProposalStatus {
  DRAFT
  SENT
  VIEWED
  ACCEPTED
  REJECTED
  REVISION_REQUESTED
}

model Proposal {
  id             String         @id @default(cuid())
  organizationId String
  dealId         String?
  title          String
  status         ProposalStatus @default(DRAFT)
  content        Json           // TipTap JSON document
  totalValue     Float
  currency       String         @default("INR")
  discountPercent Float         @default(0)
  discountRequiresApproval Boolean @default(false)
  approvalStatus String?        // "PENDING" | "APPROVED" | "REJECTED"
  approvedById   String?
  approvedAt     DateTime?
  sentAt         DateTime?
  viewedAt       DateTime?
  acceptedAt     DateTime?
  signedByName   String?
  signedAt       DateTime?
  expiresAt      DateTime?
  shareToken     String         @unique @default(cuid())
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  deal         CrmDeal?     @relation(fields: [dealId], references: [id])

  @@map("proposal")
}

enum ContractStatus {
  DRAFT
  SENT_FOR_SIGNING
  ACTIVE
  EXPIRED
  TERMINATED
  RENEWED
}

model Contract {
  id             String         @id @default(cuid())
  organizationId String
  dealId         String?
  title          String
  status         ContractStatus @default(DRAFT)
  content        Json
  totalValue     Float
  currency       String         @default("INR")
  startDate      DateTime       @db.Date
  endDate        DateTime       @db.Date
  autoRenew      Boolean        @default(false)
  renewalNoticeDays Int         @default(30)
  signedByClient   Boolean      @default(false)
  clientSignedAt   DateTime?
  clientSignedBy   String?
  signedByVendor   Boolean      @default(false)
  vendorSignedAt   DateTime?
  shareToken       String       @unique @default(cuid())
  renewedFromId    String?      // previous contract
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  deal         CrmDeal?     @relation(fields: [dealId], references: [id])
  renewedFrom  Contract?    @relation("ContractRenewals", fields: [renewedFromId], references: [id])
  renewals     Contract[]   @relation("ContractRenewals")

  @@index([organizationId, status])
  @@index([organizationId, endDate])  // for renewal tracking
  @@map("contract")
}
```

---

## EPIC B4: Internal ITSM — Service Catalogue, SLA & Escalation Engine
### Sprints 19–21 (6 weeks) — PARALLEL WORKTREE: `../slipwise-itsm`

### Sprint 19 Goal
Deliver the Service Catalogue and Internal Ticket data models. All CRUD APIs. Basic ticket submission and queue views.

### Sprint 19 Prisma Schema

```prisma
// ─── Internal ITSM ────────────────────────────────────────────────────────────

enum TicketPriority {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum InternalTicketStatus {
  OPEN
  IN_PROGRESS
  AWAITING_INFO
  ESCALATED
  RESOLVED
  CLOSED
}

model ServiceCategory {
  id               String    @id @default(cuid())
  organizationId   String
  name             String    // "IT Support"
  slug             String    // "it-support"
  description      String?
  icon             String?
  parentId         String?
  defaultAssigneeGroupId String?
  formSchema       Json?     // custom form fields for this category
  slaPolicy        Json?     // { critical: { responseMinutes: 30, resolutionMinutes: 240 }, ... }
  routingRules     Json?     // [{ condition: "orgHasITHead", routeTo: "IT_HEAD" }, ...]
  isActive         Boolean   @default(true)
  createdAt        DateTime  @default(now())

  organization Organization      @relation(fields: [organizationId], references: [id])
  parent       ServiceCategory?  @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children     ServiceCategory[] @relation("CategoryHierarchy")
  tickets      InternalTicket[]

  @@map("service_category")
}

model InternalTicket {
  id               String               @id @default(cuid())
  organizationId   String
  ticketNumber     String               // e.g., "IT-0042"
  submitterId      String               // memberId
  categoryId       String
  assigneeId       String?
  assigneeGroupId  String?
  status           InternalTicketStatus @default(OPEN)
  priority         TicketPriority       @default(MEDIUM)
  title            String
  description      String
  customFieldData  Json?
  attachmentUrls   String[]             @default([])
  
  // SLA Tracking
  slaResponseTarget   DateTime?
  slaResolutionTarget DateTime?
  firstResponseAt     DateTime?
  resolvedAt          DateTime?
  closedAt            DateTime?
  slaResponseBreached Boolean   @default(false)
  slaResolutionBreached Boolean @default(false)

  // CC/BCC for escalation visibility
  ccMemberIds      String[]  @default([])
  
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt

  organization  Organization    @relation(fields: [organizationId], references: [id])
  category      ServiceCategory @relation(fields: [categoryId], references: [id])
  comments      InternalTicketComment[]
  escalations   TicketEscalation[]
  csatResponse  TicketCsat?

  @@index([organizationId, status])
  @@index([organizationId, assigneeId])
  @@index([organizationId, submitterId])
  @@map("internal_ticket")
}

model InternalTicketComment {
  id        String   @id @default(cuid())
  ticketId  String
  authorId  String
  content   String
  isInternal Boolean @default(false)  // true = agent-only note, not visible to submitter
  createdAt DateTime @default(now())
  editedAt  DateTime?

  ticket InternalTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@map("internal_ticket_comment")
}

model TicketEscalation {
  id           String   @id @default(cuid())
  ticketId     String
  escalatedToId String
  reason       String   // "SLA_BREACH" | "MANUAL" | "UNRESPONSIVE"
  escalatedAt  DateTime @default(now())
  resolvedAt   DateTime?

  ticket InternalTicket @relation(fields: [ticketId], references: [id])

  @@map("ticket_escalation")
}

model TicketCsat {
  id       String   @id @default(cuid())
  ticketId String   @unique
  rating   Int      // 1-5
  comment  String?
  submittedAt DateTime @default(now())

  ticket InternalTicket @relation(fields: [ticketId], references: [id])

  @@map("ticket_csat")
}
```

### Sprint 19 Business Logic — Ticket Routing

```typescript
// src/lib/itsm/routing.ts
export async function routeTicket(ticket: InternalTicket, org: Organization) {
  const category = await db.serviceCategory.findUnique({
    where: { id: ticket.categoryId },
    include: { children: true }
  })
  
  // 1. Try to find the designated department head via Org Tree
  const departmentHead = await findDepartmentHead(ticket.submitterId, category.slug, org.id)
  
  if (departmentHead) {
    await db.internalTicket.update({
      where: { id: ticket.id },
      data: { assigneeId: departmentHead.memberId }
    })
    await sendNotification(departmentHead.memberId, 'NEW_TICKET_ASSIGNED', ticket)
    return
  }

  // 2. No department head found — apply fallback routing
  const fallback = await db.orgRoutingFallback.findFirst({
    where: { organizationId: org.id, categorySlug: category.slug }
  })
  
  const fallbackAssigneeId = fallback?.assigneeId ?? await getOrgAdminId(org.id)
  await db.internalTicket.update({
    where: { id: ticket.id },
    data: { assigneeId: fallbackAssigneeId }
  })
  await sendNotification(fallbackAssigneeId, 'NEW_TICKET_ASSIGNED', ticket)
}

async function findDepartmentHead(submitterId: string, categorySlug: string, orgId: string) {
  // Walk up the OrgTree from the submitter to find the relevant department head
  // For IT tickets: look for a node with department = "IT" or title containing "IT"
  // For HR tickets: look for HR department head
  // Returns the OrgNode of the head, or null if not found
}
```

### Sprint 20 Goal
SLA calculation engine. SLA breach detection cron job. Escalation engine. CSAT survey on ticket resolution.

### Sprint 20 — SLA Engine

```typescript
// src/lib/itsm/sla.ts

interface SLAPolicy {
  responseMinutes: number
  resolutionMinutes: number
}

function getSLAPolicyForTicket(ticket: InternalTicket, categoryPolicy: any): SLAPolicy {
  const priority = ticket.priority.toLowerCase()
  return categoryPolicy[priority] ?? { responseMinutes: 480, resolutionMinutes: 4320 }
}

export async function setTicketSLATargets(ticketId: string) {
  const ticket = await db.internalTicket.findUnique({
    where: { id: ticketId },
    include: { category: true }
  })
  const policy = getSLAPolicyForTicket(ticket, ticket.category.slaPolicy)
  const now = new Date()
  await db.internalTicket.update({
    where: { id: ticketId },
    data: {
      slaResponseTarget: addMinutes(now, policy.responseMinutes),
      slaResolutionTarget: addMinutes(now, policy.resolutionMinutes)
    }
  })
}

// Cron Job: run every 15 minutes to check for SLA breaches
// src/app/api/cron/sla-check/route.ts
export async function GET(request: Request) {
  // Verify Cron secret header
  const now = new Date()
  
  // Find all open tickets whose SLA response target has passed but no first response
  const responseBreaches = await db.internalTicket.findMany({
    where: {
      status: { notIn: ['RESOLVED', 'CLOSED'] },
      slaResponseTarget: { lte: now },
      firstResponseAt: null,
      slaResponseBreached: false
    }
  })
  
  for (const ticket of responseBreaches) {
    await db.internalTicket.update({ where: { id: ticket.id }, data: { slaResponseBreached: true } })
    // Notify assignee and their manager
    await triggerSLABreachEscalation(ticket, 'RESPONSE')
  }
  
  // Similar for resolution breaches...
}
```

### Sprint 21 Goal
Analytics and reporting for ITSM: ticket volume by category, average resolution times, SLA compliance rate, CSAT scores, agent performance dashboard.

---

# SECTION 9: PHASE C — INTELLIGENCE & INTEGRATIONS (Months 7–9, Sprints 22–38)

---

## EPIC C1: CX Lifecycle — Onboarding, Health Scores, Renewal Engine
### Sprints 22–24

### Sprint 22 — CX Onboarding Automation

When a CRM Deal is marked as `WON`:
1. Trigger `onDealWon` automation
2. Create a new WorkOS Project from the "Client Onboarding" template
3. Assign CX Manager to all tasks
4. Generate a secure Client Portal link
5. Send welcome email via SES/Resend
6. Create a `CxAccount` record linking the Deal/Company to the CX team

```prisma
model CxAccount {
  id             String   @id @default(cuid())
  organizationId String
  companyId      String   // CrmCompany
  dealId         String?
  cxManagerId    String   // assigned CX manager
  onboardingStatus String  @default("NOT_STARTED") // "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE"
  healthScore    Int      @default(100)  // 0-100
  healthStatus   String   @default("HEALTHY") // "HEALTHY" | "AT_RISK" | "CHURNING"
  lastContactedAt DateTime?
  npsScore       Float?
  npsRespondedAt DateTime?
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  company      CrmCompany   @relation(fields: [companyId], references: [id])
  healthChecks CxHealthCheck[]
  npsResponses CxNpsResponse[]

  @@map("cx_account")
}

model CxHealthCheck {
  id          String   @id @default(cuid())
  accountId   String
  score       Int
  factors     Json     // { lastContact: -5, openTickets: -10, latePayment: -20, ... }
  checkedAt   DateTime @default(now())

  account CxAccount @relation(fields: [accountId], references: [id])

  @@map("cx_health_check")
}

model CxNpsResponse {
  id          String   @id @default(cuid())
  accountId   String
  score       Int      // 0-10
  comment     String?
  respondedAt DateTime @default(now())

  account CxAccount @relation(fields: [accountId], references: [id])

  @@map("cx_nps_response")
}
```

### Sprint 23 — Health Score Engine

```typescript
// src/lib/cx/health-score.ts
export async function recalculateHealthScore(accountId: string): Promise<number> {
  const account = await db.cxAccount.findUnique({
    where: { id: accountId },
    include: { company: true }
  })
  
  let score = 100
  const factors: Record<string, number> = {}
  
  // Factor 1: Days since last contact (decays score over time)
  const daysSinceContact = differenceInDays(new Date(), account.lastContactedAt ?? account.createdAt)
  if (daysSinceContact > 30) { score -= 20; factors.noRecentContact = -20 }
  else if (daysSinceContact > 14) { score -= 10; factors.noRecentContact = -10 }
  
  // Factor 2: Open support tickets
  const openTickets = await db.internalTicket.count({ where: { /* linked to this company */ } })
  if (openTickets > 3) { score -= 20; factors.manyOpenTickets = -20 }
  else if (openTickets > 0) { score -= 5 * openTickets; factors.openTickets = -5 * openTickets }
  
  // Factor 3: Invoice payment health (from Slipwise Finance — native integration)
  const overdueInvoices = await db.invoice.count({
    where: { customerId: account.companyId, status: 'OVERDUE' }
  })
  if (overdueInvoices > 0) { score -= 25; factors.overdueInvoices = -25 }
  
  // Factor 4: NPS score (if recent)
  if (account.npsScore !== null && account.npsRespondedAt) {
    if (account.npsScore >= 9) { score += 10; factors.highNps = 10 }
    else if (account.npsScore <= 6) { score -= 15; factors.lowNps = -15 }
  }
  
  const finalScore = Math.max(0, Math.min(100, score))
  const healthStatus = finalScore >= 70 ? 'HEALTHY' : finalScore >= 40 ? 'AT_RISK' : 'CHURNING'
  
  await db.cxAccount.update({
    where: { id: accountId },
    data: { healthScore: finalScore, healthStatus }
  })
  await db.cxHealthCheck.create({
    data: { accountId, score: finalScore, factors }
  })
  
  if (healthStatus !== 'HEALTHY') {
    await notifyCxManager(account.cxManagerId, account, healthStatus, factors)
  }
  
  return finalScore
}
```

### Sprint 24 — Renewal Engine

Scheduled job (runs daily at 8 AM IST):
1. Query all contracts where `endDate` is within 90 days AND status = `ACTIVE`
2. For each: trigger the appropriate renewal playbook step based on days remaining
3. At 90 days: create WorkOS task for CX Manager "Initiate renewal discussion with [Company]"
4. At 60 days: auto-generate a renewal proposal using the existing Proposal Builder
5. At 30 days: send automated renewal reminder email to client
6. At 14 days: if no response, escalate to CX Head
7. At 0 days: if not renewed, mark contract as EXPIRED, log in CRM, alert CX team

---

## EPIC C2: Dashboards, Goals & OKRs
### Sprints 25–26

### Sprint 25 Prisma Schema

```prisma
model Goal {
  id             String    @id @default(cuid())
  organizationId String
  spaceId        String?
  parentGoalId   String?
  ownerId        String    // member
  title          String
  description    String?
  metricType     String    // "NUMERICAL" | "CURRENCY" | "BOOLEAN" | "TASK_COMPLETION" | "PERCENTAGE"
  targetValue    Float?
  currentValue   Float     @default(0)
  unit           String?   // "deals", "₹", "%"
  startDate      DateTime
  endDate        DateTime
  status         String    @default("ON_TRACK") // "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETE"
  isCompanyGoal  Boolean   @default(false)
  linkedListId   String?   // auto-update from task completion
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])
  parentGoal   Goal?        @relation("GoalHierarchy", fields: [parentGoalId], references: [id])
  childGoals   Goal[]       @relation("GoalHierarchy")
  updates      GoalUpdate[]

  @@map("goal")
}

model GoalUpdate {
  id          String   @id @default(cuid())
  goalId      String
  authorId    String
  value       Float
  note        String?
  createdAt   DateTime @default(now())

  goal Goal @relation(fields: [goalId], references: [id], onDelete: Cascade)

  @@map("goal_update")
}

model Dashboard {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  ownerId        String
  isShared       Boolean  @default(false)
  widgets        Json     // array of widget configs
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id])

  @@map("dashboard")
}
```

---

## EPIC C3: Docs, Wikis & Knowledge Base
### Sprints 27–28

### Sprint 27 Prisma Schema

```prisma
model WorkDoc {
  id             String    @id @default(cuid())
  organizationId String
  spaceId        String?
  folderId       String?
  parentDocId    String?
  title          String
  content        Json      // TipTap ProseMirror JSON
  isPublic       Boolean   @default(false)
  shareToken     String?   @unique
  createdById    String    @db.Uuid
  lastEditedById String?   @db.Uuid
  lastEditedAt   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  deletedAt      DateTime?

  organization Organization @relation(fields: [organizationId], references: [id])
  parentDoc    WorkDoc?     @relation("DocHierarchy", fields: [parentDocId], references: [id])
  childDocs    WorkDoc[]    @relation("DocHierarchy")
  versions     WorkDocVersion[]
  comments     WorkDocComment[]

  @@index([organizationId, spaceId])
  @@map("work_doc")
}

model WorkDocVersion {
  id        String   @id @default(cuid())
  docId     String
  version   Int
  content   Json
  editedById String  @db.Uuid
  createdAt DateTime @default(now())

  doc WorkDoc @relation(fields: [docId], references: [id], onDelete: Cascade)

  @@map("work_doc_version")
}

model WorkDocComment {
  id         String   @id @default(cuid())
  docId      String
  authorId   String   @db.Uuid
  content    String
  anchorText String?  // the selected text this comment is attached to
  resolved   Boolean  @default(false)
  createdAt  DateTime @default(now())

  doc WorkDoc @relation(fields: [docId], references: [id], onDelete: Cascade)

  @@map("work_doc_comment")
}
```

---

## EPIC C4: Automation Engine
### Sprints 29–31

### Sprint 29 Prisma Schema

```prisma
model AutomationRule {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  description    String?
  isActive       Boolean  @default(true)
  trigger        Json     // { type: "TASK_STATUS_CHANGED", conditions: [...] }
  actions        Json     // [{ type: "CREATE_TASK", params: {...} }, ...]
  lastRunAt      DateTime?
  runCount       Int      @default(0)
  errorCount     Int      @default(0)
  createdById    String   @db.Uuid
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization     @relation(fields: [organizationId], references: [id])
  executions   AutomationExecution[]

  @@map("automation_rule")
}

model AutomationExecution {
  id         String   @id @default(cuid())
  ruleId     String
  status     String   // "SUCCESS" | "FAILED" | "SKIPPED"
  triggerData Json
  actionsLog  Json?
  errorMessage String?
  executedAt DateTime @default(now())

  rule AutomationRule @relation(fields: [ruleId], references: [id])

  @@index([ruleId, executedAt])
  @@map("automation_execution")
}
```

### Sprint 30 — Automation Execution Engine

```typescript
// src/lib/automation/engine.ts
export async function executeAutomation(ruleId: string, triggerData: Record<string, any>) {
  const rule = await db.automationRule.findUnique({ where: { id: ruleId } })
  if (!rule?.isActive) return

  const execution = await db.automationExecution.create({
    data: { ruleId, status: 'SUCCESS', triggerData, executedAt: new Date() }
  })

  try {
    for (const action of rule.actions as AutomationAction[]) {
      await executeAction(action, triggerData, rule.organizationId)
    }
    await db.automationRule.update({
      where: { id: ruleId },
      data: { lastRunAt: new Date(), runCount: { increment: 1 } }
    })
  } catch (error) {
    await db.automationExecution.update({
      where: { id: execution.id },
      data: { status: 'FAILED', errorMessage: String(error) }
    })
    await db.automationRule.update({
      where: { id: ruleId },
      data: { errorCount: { increment: 1 } }
    })
  }
}

async function executeAction(action: AutomationAction, context: any, orgId: string) {
  switch (action.type) {
    case 'CREATE_TASK':
      await db.task.create({ data: { ...action.params, organizationId: orgId } })
      break
    case 'SEND_EMAIL':
      await sendEmail(action.params.to, action.params.subject, action.params.body)
      break
    case 'CREATE_INTERNAL_TICKET':
      await createTicket(action.params, orgId)
      break
    case 'NOTIFY_MEMBER':
      await createNotification(action.params.memberId, action.params.message, action.params.targetUrl)
      break
    case 'WEBHOOK':
      await fetch(action.params.url, { method: 'POST', body: JSON.stringify(context) })
      break
    case 'UPDATE_CRM_FIELD':
      await db.crmDeal.update({ where: { id: context.dealId }, data: { [action.params.field]: action.params.value } })
      break
  }
}
```

---

## EPIC C5: AI Intelligence Layer — Slipwise Brain
### Sprints 32–33

### Sprint 32 — AI Endpoints

**POST /api/ai/task/generate-subtasks**
```json
// Request
{ "taskId": "task_abc", "taskTitle": "Launch Q3 Campaign", "taskDescription": "..." }
// Response
{
  "subtasks": [
    { "title": "Create campaign brief", "suggestedAssignee": "marketing-manager", "estimatedHours": 2 },
    { "title": "Design landing page mockups", "suggestedAssignee": null, "estimatedHours": 8 },
    { "title": "Write copy for all ads", "suggestedAssignee": null, "estimatedHours": 4 }
  ]
}
```

**POST /api/ai/crm/draft-email**
```json
// Request
{ "contactId": "contact_xyz", "context": "last meeting was a discovery call, they were interested in Enterprise plan" }
// Response: { "subject": "...", "body": "..." }
```

**POST /api/ai/hr/answer**
```json
// Request
{ "question": "Who on my team is on leave this week?", "organizationId": "org_abc", "userId": "..." }
// Response: { "answer": "Priya Patel (Marketing) is on Casual Leave Aug 1–3. No other leaves this week." }
```

**POST /api/ai/project/status-update**
```json
// Request: { "listId": "list_abc" }
// Response: { "draft": "The Q3 Campaign project is 65% complete. 3 tasks are overdue: ... The team is blocked on design approval..." }
```

---

## EPIC C6: External Integrations
### Sprints 34–35

### Google Calendar Integration

```typescript
// When a task with a due date is created or updated:
// Sync to Google Calendar via the existing CalendarConnection model

// When a leave is approved:
// Block the employee's calendar for the leave period

// When a meeting is booked via MeetingBookingPage:
// Create Google Calendar event, generate Meet link, send invites
```

### GitHub Integration

```prisma
model GitHubIntegration {
  id             String   @id @default(cuid())
  organizationId String   @unique
  accessToken    String   // encrypted
  refreshToken   String?
  installationId String?
  repositories   String[] @default([])
  createdAt      DateTime @default(now())

  @@map("github_integration")
}

model TaskGitReference {
  id            String @id @default(cuid())
  taskId        String
  referenceType String // "PR" | "ISSUE" | "COMMIT"
  externalId    String
  externalUrl   String
  title         String
  status        String?
  mergedAt      DateTime?
  closedAt      DateTime?
  createdAt     DateTime @default(now())

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@map("task_git_reference")
}
```

---

## EPIC C7: Mobile PWA
### Sprint 36–38

**Service Worker Strategy:**
- Cache-First for static assets (CSS, JS, fonts)
- Network-First for API calls, with offline queue for mutations (task status changes, clock in/out)
- Background Sync to flush queued mutations when connectivity is restored

**PWA Manifest (public/manifest.json):**
```json
{
  "name": "Slipwise",
  "short_name": "Slipwise",
  "start_url": "/app",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Push Notifications (Web Push API):**
- Task assigned to me → push notification
- Leave request needs my approval → push notification
- SLA breach on my ticket → push notification
- Deal won → push notification to manager
- New message in conversation → push notification

---

# SECTION 10: FULL CONSOLIDATED DATABASE SCHEMA SUMMARY

All new tables introduced by this PRD, in order of dependency:

**Phase A:**
1. `org_node` — depends on `member`
2. `granular_permission_grant` — depends on `member`
3. `role_template` — depends on `organization`
4. `space` — depends on `organization`
5. `space_membership` — depends on `space`, `member`
6. `folder` — depends on `space`
7. `project_list` — depends on `space`, `folder`
8. `custom_status` — depends on `space`, `project_list`
9. `task` — depends on `project_list`, `custom_status`
10. `task_assignee` — depends on `task`, `member`
11. `task_watcher` — depends on `task`, `member`
12. `task_checklist` — depends on `task`
13. `task_comment` — depends on `task`
14. `task_comment_attachment` — depends on `task_comment`
15. `task_attachment` — depends on `task`
16. `task_tag` — depends on `task`
17. `task_dependency` — depends on `task`
18. `custom_field_definition` — depends on `space`
19. `task_custom_field_value` — depends on `task`, `custom_field_definition`
20. `employee_profile` — depends on `member`
21. `leave_type` — depends on `organization`
22. `leave_balance` — depends on `employee_profile`, `leave_type`
23. `leave_request` — depends on `employee_profile`, `leave_type`
24. `leave_approval_step` — depends on `leave_request`
25. `public_holiday` — depends on `organization`
26. `attendance_record` — depends on `employee_profile`

**Phase B:**
27. `time_entry` — depends on `task`, `member`
28. `sprint` — depends on `space`
29. `review_cycle` — depends on `organization`
30. `performance_review` — depends on `review_cycle`, `employee_profile`
31. `crm_contact` — depends on `organization`
32. `crm_company` — depends on `organization`
33. `crm_pipeline` — depends on `organization`
34. `crm_stage` — depends on `crm_pipeline`
35. `crm_deal` — depends on `crm_pipeline`, `crm_stage`
36. `crm_activity` — depends on `crm_contact`, `crm_deal`
37. `email_sequence` — depends on `organization`
38. `email_sequence_step` — depends on `email_sequence`
39. `sequence_enrollment` — depends on `email_sequence`, `crm_contact`
40. `meeting_booking_page` — depends on `member`
41. `meeting_booking` — depends on `meeting_booking_page`
42. `proposal` — depends on `crm_deal`
43. `contract` — depends on `crm_deal`
44. `service_category` — depends on `organization`
45. `internal_ticket` — depends on `service_category`
46. `internal_ticket_comment` — depends on `internal_ticket`
47. `ticket_escalation` — depends on `internal_ticket`
48. `ticket_csat` — depends on `internal_ticket`

**Phase C:**
49. `cx_account` — depends on `crm_company`
50. `cx_health_check` — depends on `cx_account`
51. `cx_nps_response` — depends on `cx_account`
52. `goal` — depends on `organization`
53. `goal_update` — depends on `goal`
54. `dashboard` — depends on `organization`
55. `work_doc` — depends on `organization`
56. `work_doc_version` — depends on `work_doc`
57. `work_doc_comment` — depends on `work_doc`
58. `automation_rule` — depends on `organization`
59. `automation_execution` — depends on `automation_rule`
60. `github_integration` — depends on `organization`
61. `task_git_reference` — depends on `task`

---

# SECTION 11: API REFERENCE INDEX

All new API routes introduced by this PRD:

## Org & Permissions
- `POST   /api/org/nodes`
- `GET    /api/org/tree`
- `PATCH  /api/org/nodes/:id`
- `DELETE /api/org/nodes/:id`
- `GET    /api/permissions/matrix?memberId=`
- `POST   /api/permissions/grant`
- `DELETE /api/permissions/revoke`
- `GET    /api/permissions/role-templates`
- `POST   /api/permissions/role-templates`

## Work OS
- `GET    /api/work/spaces`
- `POST   /api/work/spaces`
- `PATCH  /api/work/spaces/:id`
- `DELETE /api/work/spaces/:id`
- `GET    /api/work/spaces/:id/members`
- `POST   /api/work/spaces/:id/members`
- `POST   /api/work/spaces/:spaceId/lists`
- `GET    /api/work/lists/:listId/tasks`
- `POST   /api/work/lists/:listId/tasks`
- `GET    /api/work/tasks/:id`
- `PATCH  /api/work/tasks/:id`
- `DELETE /api/work/tasks/:id`
- `POST   /api/work/tasks/:id/comments`
- `POST   /api/work/tasks/:id/attachments`
- `POST   /api/work/tasks/:id/dependencies`
- `GET    /api/work/my-tasks`
- `POST   /api/work/time/start`
- `POST   /api/work/time/stop`
- `POST   /api/work/time/manual`
- `GET    /api/work/time/timesheet`
- `GET    /api/work/spaces/:id/sprints`
- `POST   /api/work/spaces/:id/sprints`
- `POST   /api/work/sprints/:id/start`
- `POST   /api/work/sprints/:id/complete`
- `GET    /api/work/spaces/:id/goals`
- `POST   /api/work/goals`

## HR
- `GET    /api/hr/employees`
- `POST   /api/hr/employees`
- `GET    /api/hr/employees/:id`
- `PATCH  /api/hr/employees/:id`
- `GET    /api/hr/leave/types`
- `POST   /api/hr/leave/types`
- `GET    /api/hr/leave/balances`
- `POST   /api/hr/leave/request`
- `PATCH  /api/hr/leave/requests/:id/approve`
- `PATCH  /api/hr/leave/requests/:id/reject`
- `PATCH  /api/hr/leave/requests/:id/cancel`
- `GET    /api/hr/leave/team-calendar`
- `GET    /api/hr/attendance`
- `POST   /api/hr/attendance/clock-in`
- `POST   /api/hr/attendance/clock-out`
- `POST   /api/hr/attendance/regularise`
- `GET    /api/hr/performance/cycles`
- `POST   /api/hr/performance/cycles`
- `GET    /api/hr/performance/reviews`
- `POST   /api/hr/performance/reviews/:id/submit`

## CRM/BDR
- `GET    /api/crm/contacts`
- `POST   /api/crm/contacts`
- `GET    /api/crm/contacts/:id`
- `PATCH  /api/crm/contacts/:id`
- `GET    /api/crm/companies`
- `POST   /api/crm/companies`
- `GET    /api/crm/pipelines`
- `POST   /api/crm/pipelines`
- `GET    /api/crm/deals`
- `POST   /api/crm/deals`
- `PATCH  /api/crm/deals/:id`
- `PATCH  /api/crm/deals/:id/stage`
- `PATCH  /api/crm/deals/:id/win`
- `PATCH  /api/crm/deals/:id/lose`
- `POST   /api/crm/activities`
- `GET    /api/crm/sequences`
- `POST   /api/crm/sequences`
- `POST   /api/crm/sequences/:id/enroll`
- `GET    /api/crm/book/:slug`
- `POST   /api/crm/book/:slug/confirm`
- `GET    /api/crm/proposals`
- `POST   /api/crm/proposals`
- `PATCH  /api/crm/proposals/:id/send`
- `PATCH  /api/crm/proposals/:id/approve`
- `GET    /api/crm/contracts`
- `POST   /api/crm/contracts`
- `PATCH  /api/crm/contracts/:id/sign`

## ITSM
- `GET    /api/itsm/categories`
- `POST   /api/itsm/categories`
- `GET    /api/itsm/tickets`
- `POST   /api/itsm/tickets`
- `GET    /api/itsm/tickets/:id`
- `PATCH  /api/itsm/tickets/:id`
- `POST   /api/itsm/tickets/:id/comments`
- `POST   /api/itsm/tickets/:id/escalate`
- `POST   /api/itsm/tickets/:id/resolve`
- `POST   /api/itsm/tickets/:id/csat`
- `GET    /api/itsm/analytics`

## CX
- `GET    /api/cx/accounts`
- `GET    /api/cx/accounts/:id`
- `POST   /api/cx/accounts/:id/health-check`
- `POST   /api/cx/accounts/:id/nps`
- `GET    /api/cx/renewals`

## Automation & AI
- `GET    /api/automation/rules`
- `POST   /api/automation/rules`
- `PATCH  /api/automation/rules/:id`
- `GET    /api/automation/executions`
- `POST   /api/ai/task/generate-subtasks`
- `POST   /api/ai/crm/draft-email`
- `POST   /api/ai/project/status-update`
- `POST   /api/ai/hr/answer`

---

# SECTION 12: TESTING STRATEGY & QA METHODOLOGY

## 12.1 Test Types by Sprint

| Sprint | Unit Tests | Integration Tests | E2E Tests (Playwright) |
|---|---|---|---|
| 1–3 | Permission check utilities, Org Tree traversal | All 8 new API routes | Org Chart drag-and-drop, Permission matrix save |
| 4–6 | Task recurrence engine, status pipeline | All task CRUD APIs | Task creation, Kanban drag-and-drop |
| 7–9 | Leave balance calculation, SLA time math | Leave request flow API | Leave application, manager approval, calendar update |
| 10–12 | Time entry calculation, burndown math | Gantt, Sprint APIs | Timer start/stop, sprint planning |
| 13–15 | Performance review scoring, FnF calculation | Review submission, payroll integration | Self-review form, manager review |
| 16–18 | Lead scoring engine, email token replacement | Deal creation, pipeline stage change | Deal kanban, win deal → invoice auto-creation |
| 19–21 | SLA target calculation, routing algorithm | Ticket creation, SLA cron job | Ticket submission, routing, escalation |
| 22–24 | Health score calculation, renewal date math | CX account health check, renewal trigger | Deal won → onboarding project created |
| 29–31 | Automation condition evaluation | Automation execution for all trigger types | Full automation: deal won → task created → email sent |
| 32–33 | AI prompt construction | AI API endpoints | AI subtask generation from task panel |

## 12.2 Critical E2E Test Scenarios (Must Pass Before Production)

1. **Full Employee Lifecycle**: Create employee → assign org position → grant permissions → apply for leave → manager approves → payroll deducted → exit employee → FnF calculated → access revoked
2. **Full Deal Lifecycle**: Create contact → create deal → move through stages → apply discount (triggers approval) → approval granted → proposal accepted → mark won → invoice auto-created → onboarding project created
3. **Full Ticket Lifecycle**: Submit ticket → system routes to IT Head → IT Head responds (SLA met) → resolves → CSAT sent → report shows data
4. **RBAC Security Test**: Create a "Finance Only" member → attempt to access HR endpoints → receive 403 → verify they CAN access invoice endpoints

---

# SECTION 13: DEPLOYMENT, DEVOPS & OBSERVABILITY PLAN

## 13.1 Environment Strategy

| Environment | Branch | Deployment Target | Database |
|---|---|---|---|
| Local | Any | `localhost:3001` (Turbopack) | Supabase local (Docker) |
| Staging | `develop` | ECS Fargate (staging cluster) | RDS PostgreSQL (staging) |
| Production | `main` | ECS Fargate (prod cluster, Multi-AZ) | RDS PostgreSQL (Multi-AZ, production) |

## 13.2 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test:ci    # Vitest
      - run: npm audit --audit-level=high

  deploy-staging:
    needs: lint-and-test
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - name: Build Docker image
        run: docker build -t slipwise:$GITHUB_SHA .
      - name: Push to ECR
        run: aws ecr get-login-password | docker login --username AWS ...
      - name: Deploy to ECS Staging
        run: aws ecs update-service --cluster slipwise-staging ...

  deploy-production:
    needs: lint-and-test
    if: github.ref == 'refs/heads/main'
    environment: production    # requires manual approval
    runs-on: ubuntu-latest
    steps:
      - name: Run Prisma Migrations
        run: npx prisma migrate deploy
      - name: Deploy to ECS Production
        run: aws ecs update-service --cluster slipwise-prod ...
      - name: Invalidate CloudFront cache
        run: aws cloudfront create-invalidation ...
```

## 13.3 Database Migration Strategy

- All schema changes via Prisma Migrations (`npx prisma migrate dev --name <name>`)
- Migrations are committed to git and applied in CI during deployment
- **No** destructive migrations (DROP COLUMN, DROP TABLE) without a **two-phase migration**: Phase 1 → stop writing to old column, Phase 2 → drop after 1 full deployment cycle
- All migrations reviewed by Tech Lead before merge to `develop`
- Staging migrations run automatically in CI; Production migrations require manual approval in GitHub Actions

## 13.4 Observability Stack

| Tool | Purpose |
|---|---|
| **AWS CloudWatch** | Application and infrastructure logs, custom metrics, alarms |
| **AWS X-Ray** | Distributed tracing for API requests |
| **Sentry** | Application error tracking and performance monitoring |
| **Upstash Redis** | Rate limiting state |
| **PgHero / pgAnalyze** | PostgreSQL query performance monitoring |

## 13.5 Alerting

Configure CloudWatch alarms for:
- API error rate > 1% over 5 minutes → PagerDuty alert (P1)
- ECS CPU > 80% for 10 minutes → PagerDuty alert (P2)
- RDS CPU > 70% → Slack alert
- SLA breach rate > 10% in ITSM → Slack alert to Engineering + Product
- Failed Cron Jobs (payroll, SLA check, renewal) → PagerDuty alert (P1)

---

*END OF PRD — SLIPWISE ONE OS EXPANSION v1.0.0*
*This document was prepared by the Office of the CTO and represents the authoritative specification for all engineering work in this expansion. Any deviation from this specification requires a formal change request reviewed by the Tech Lead and Product Owner.*
