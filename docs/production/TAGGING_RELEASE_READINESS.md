# Tagging Platform — Release Readiness Checklist

## Branch: `feature/platform-rebrand-redesign-tagging`

## Phase Coverage

| Phase | Sprint | Status |
|-------|--------|--------|
| 1 | Tag Schema & Catalog | ✅ Merged |
| 2 | Document Workflows | ✅ Merged |
| 3 | Reporting & Intelligence | ✅ Merged |
| 4 | Governance & Automation | ✅ Merged |
| 5 | Hardening & Release | ✅ In Review |

## Pre-Launch Verification

### 1. Database
- [x] `DocumentTag` table created with org-scoped uniqueness
- [x] `InvoiceTagAssignment` / `VoucherTagAssignment` junction tables
- [x] `CustomerDefaultTag` / `VendorDefaultTag` junction tables
- [x] Indexes on `[orgId, slug]`, `[tagId]`, `[orgId, isArchived]`
- [x] Cascade deletes on parent document/customer/vendor removal

### 2. Permissions
- [x] Tag catalog mutations require `admin` role (create, rename, archive, unarchive)
- [x] Tag assignments require org membership
- [x] Default tag editing follows customer/vendor edit permission model
- [x] All operations org-scoped with cross-org rejection
- [x] `tags` resource added to RBAC RESOURCES

### 3. Audit & Observability
- [x] 11 tag audit action labels defined in `AUDIT_ACTION_LABELS`
- [x] Audit logging wired to all tag catalog mutations
- [x] Audit logging wired to assignment mutations (setInvoiceTags, setVoucherTags)
- [x] Audit logging wired to default tag mutations
- [x] Telemetry instrumentation for PostHog (tag_created, tag_applied, tag_removed, tag_analytics_viewed, tag_drilldown_opened, tag_defaults_updated)
- [x] Telemetry instrumentation for PostHog (tag_created, tag_applied, tag_removed, tag_analytics_viewed, tag_drilldown_opened, tag_defaults_updated)

### 4. API Surface
- [x] REST API: `GET /api/tags` — list tags
- [x] REST API: `POST /api/tags` — create tag
- [x] REST API: `GET /api/tags/[id]` — get tag detail
- [x] REST API: `PATCH /api/tags/[id]` — rename or archive/unarchive
- [x] Server actions for all tag operations
- [x] Tag-aware list filters (`listInvoices`, `listVouchers` with `tagIds`/`hasTags`)

### 5. Reports & Exports
- [x] Invoice report supports tag filtering
- [x] Voucher report supports tag filtering
- [x] CSV exports include Tags column
- [x] Report totals reflect server-filtered tag data

### 6. Analytics
- [x] Tag Analytics Hub at `/app/intel/reports/tag-analytics`
- [x] Revenue/Expense/Combined modes
- [x] Monthly trend chart
- [x] Top tags leaderboard
- [x] KPI summary cards (server-side aggregates)
- [x] Drill-down navigation to filtered document lists
- [x] Non-exclusive attribution disclosure

### 7. Document Workflows
- [x] Tag picker in invoice workspace
- [x] Tag picker in voucher workspace
- [x] Customer default tags pre-fill on invoice create
- [x] Vendor default tags pre-fill on voucher create
- [x] Suggestions (recent + popular) in both workspaces
- [x] Users can override defaults and suggestions before save

### 8. Management Console
- [x] Settings page at `/app/settings/tags`
- [x] Tag list with usage counts (invoices, vouchers, defaults)
- [x] Inline rename
- [x] Archive/unarchive with impact warnings
- [x] Search/filter by name or slug
- [x] Active vs archived sections
- [x] Registered in settings navigation

### 9. Edge Cases
- [x] Archived tags rendered correctly on historical documents
- [x] Renamed tags propagate via ID-based relationships
- [x] Multi-tag attribution explicitly non-exclusive
- [x] KPI totals use server-side aggregates (not truncated leaderboard)
- [x] Empty/zero-tag states handled correctly
- [x] Cross-org tag references rejected
- [x] Empty/invalid tag names rejected

### 10. Test Coverage
- [x] Tag catalog service: 22 tests
- [x] Assignment service: 16 tests
- [x] Suggestion service: 8 tests
- [x] Default tag CRUD: 12 tests
- [x] Governance/admin: 8 tests
- [x] Edge cases: 8 tests
- [x] **Total: 74 tests**

### 11. Internal-Only Enforcement
- [x] Tags not rendered on PDF views
- [x] Tags not on public token pages
- [x] Tags not exposed in portal views
- [x] Tags not in email templates

## Release Sign-off

- [ ] Feature owner approval
- [ ] QA verification pass
- [ ] Staging deployment smoke test
- [ ] Production rollout plan approved
