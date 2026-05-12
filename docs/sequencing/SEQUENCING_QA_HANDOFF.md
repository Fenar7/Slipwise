# Slipwise Document Sequencing Platform
## QA Testing Handoff Source

Prepared for: QA / Testing Team  
Date: May 3, 2026  
Scope: Sequencing platform through Phase 7  
Document types in scope: Invoices and vouchers only

---

## 1. Executive Summary

This handoff covers the full sequencing platform after completion of Phases 1 through 7.

The QA team should use this document to validate that:

- invoice official numbers are assigned only when an invoice becomes ISSUED
- voucher official numbers are assigned only when a voucher becomes APPROVED
- drafts do not consume official numbers
- sequence governance and resequencing remain owner-only
- lock-date enforcement blocks unsafe resequencing
- diagnostics and support tooling remain read-only and owner-only
- numbering remains consistent, unique, and stable after final Phase 7 hardening

This is a tester-facing execution document, not an engineering design note.

---

## 2. Critical Product Rules

Any violation of these rules is at least a major defect, and some are blocker-level:

1. Draft invoices must not receive official invoice numbers.
2. Draft vouchers must not receive official voucher numbers.
3. Official invoice numbers are assigned on ISSUED only.
4. Official voucher numbers are assigned on APPROVED only.
5. The same document must not receive a second official number through retry, refresh, or repeated action.
6. Resequencing is owner-only.
7. Locked date ranges must block unsafe resequencing preview or apply.
8. Diagnostics and support tooling must not mutate records from read-only flows.
9. Invoice and voucher numbers must remain unique within the organization.

---

## 3. Test Environment Checklist

Before execution begins, confirm the following:

| Item | Requirement |
|---|---|
| Environment | Dedicated staging or test environment with sequencing Phases 1-7 deployed |
| Org setup | At least one org with invoice and voucher sequences configured |
| Roles | One owner account and one non-owner account |
| Invoice data | Draft invoices and already-issued invoices available |
| Voucher data | Draft vouchers and already-approved vouchers available |
| Historical data | Enough older documents to test resequence preview/apply |
| Lock-date scenario | At least one test org with a lock date configured |
| Exports | PDF/document export surfaces available where sequencing numbers render |

---

## 4. Recommended Execution Order

Run tests in this order:

1. Access and governance
2. Sequence settings visibility
3. Invoice numbering
4. Voucher numbering
5. Draft-state negative checks
6. Resequence preview
7. Resequence apply
8. Lock-date enforcement
9. Diagnostics and support tooling
10. Final regression confirmation

This order matters because resequencing changes historical numbering state.

---

## 5. Manual Test Matrix

### Group A: Access and Governance

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| A1 | Owner can access sequence settings | Owner login | Open sequence settings | Settings page loads with invoice and voucher sequencing sections | Screenshot |
| A2 | Non-owner cannot mutate sequence governance | Non-owner login | Open sequence settings and attempt edit | Edit or governance controls blocked or hidden | Screenshot |
| A3 | Non-owner cannot access resequence and diagnostics actions | Non-owner login | Attempt diagnostics and resequence flows | Access denied or controls hidden | Screenshot with error if present |
| A4 | Cross-org isolation | Two orgs available | Switch org or use another user | No data from another org is visible | Screenshot |

### Group B: Invoice Numbering

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| B1 | Draft invoice has no official number | New invoice draft | Create and save draft | No official number assigned | Screenshot |
| B2 | Issuing invoice assigns official number once | Draft invoice exists | Issue invoice | Official number assigned exactly once on issue | Screenshot |
| B3 | Repeated issue path does not double-assign | Issued invoice from B2 | Retry issue path or refresh after issue | Number remains unchanged | Before/after screenshots |
| B4 | Sequential issues preserve order | Two drafts available | Issue invoice 1, then issue invoice 2 | Distinct numbers assigned in correct sequence order | Screenshot of both |
| B5 | Official number is consistent across surfaces | Issued invoice exists | Compare list, detail, and export/PDF if available | Same official number everywhere | Screenshots or PDF |

### Group C: Voucher Numbering

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| C1 | Draft voucher has no official number | New voucher draft | Create and save draft | No official number assigned | Screenshot |
| C2 | Approving voucher assigns official number once | Draft voucher exists | Approve voucher | Official number assigned exactly once | Screenshot |
| C3 | Repeated approval path does not double-assign | Approved voucher from C2 | Retry approval path or refresh | Number remains unchanged | Before/after screenshots |
| C4 | Sequential approvals preserve order | Two voucher drafts available | Approve voucher 1, then voucher 2 | Distinct numbers assigned in correct sequence order | Screenshot |
| C5 | Official number is consistent across surfaces | Approved voucher exists | Compare list, detail, and export/PDF if available | Same official number everywhere | Screenshots or PDF |

### Group D: Negative Lifecycle Checks

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| D1 | Draft edits do not consume numbers | Draft invoice or voucher exists | Edit and save draft multiple times | No official number assigned | Screenshot sequence |
| D2 | Editing finalized doc does not silently renumber | Issued invoice or approved voucher exists | Edit allowed fields and save | Official number stays unchanged | Before/after screenshots |
| D3 | Non-finalized states do not present false official numbering | Draft docs exist | Review list and detail screens | Drafts do not display official numbering as finalized docs | Screenshot |

### Group E: Resequence Preview

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| E1 | Owner can run resequence preview | Owner login, historical docs exist | Run preview on valid date range | Preview succeeds and returns summary | Screenshot |
| E2 | Preview is non-mutating | Preview completed | Re-open affected docs | No number changes after preview only | Screenshot |
| E3 | Preview shows unchanged, renumbered, and blocked states clearly | Mixed test data exists | Run preview on mixed range | Result statuses are understandable and coherent | Screenshot |

### Group F: Resequence Apply

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| F1 | Owner can apply valid resequence | Valid preview exists | Confirm and apply | Eligible records updated to proposed values | Before/after screenshots |
| F2 | Blocked records remain unchanged | Preview includes blocked rows | Apply resequence | Blocked rows are preserved | Before/after screenshots |
| F3 | Apply is reflected in sequence history or support surfaces | Apply completed | Open history/support area | Resequence activity visible if product surface provides it | Screenshot |
| F4 | Unsafe replay or stale apply remains safe | Applied range exists | Attempt replay or retry path if available | No silent corruption or unsafe second mutation | Screenshot or unchanged proof |

### Group G: Lock-Date Enforcement

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| G1 | Preview blocked by lock date | Lock date configured | Run preview across locked range | Preview blocked with clear error | Screenshot |
| G2 | Apply blocked by lock date | Lock date configured | Attempt apply in locked range | Apply blocked with clear error | Screenshot |
| G3 | Locked records remain protected | Locked historical records exist | Attempt unsafe resequence path | Locked records remain unchanged | Before/after screenshots |

### Group H: Diagnostics and Support Tooling

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| H1 | Owner can run health check | Owner login | Run health check | Structured health result is returned | Screenshot |
| H2 | Owner can view support overview | Owner login | Open support overview | Period state, counters, and sequence context render correctly | Screenshot |
| H3 | Owner can run diagnostics | Owner login | Run diagnostics | Gaps, warnings, and criticals surface coherently | Screenshot |
| H4 | Diagnostics are read-only | Docs exist before test | Run diagnostics and re-open docs | No visible mutation from read-only tooling | Before/after screenshots |
| H5 | Non-owner cannot use support tooling | Non-owner login | Attempt to access support tools | Access denied or controls hidden | Screenshot |

### Group I: Final Regression

| ID | Scenario | Preconditions | Steps | Expected Result | Evidence |
|---|---|---|---|---|---|
| I1 | Invoice numbering still works after resequence and diagnostics | Prior groups executed | Create and issue fresh invoice | New official number still assigns correctly | Screenshot |
| I2 | Voucher numbering still works after resequence and diagnostics | Prior groups executed | Create and approve fresh voucher | New official number still assigns correctly | Screenshot |
| I3 | No visible duplicate numbering in tested org | Multiple finalized docs exist | Review recent finalized docs | No obvious duplicate official numbers | Screenshot |
| I4 | Historical docs remain readable after Phase 7 flows | Historical docs exist | Open older docs | Existing documents render correctly | Screenshot |

---

## 6. Evidence Capture Log

Maintain an execution sheet with these columns:

| Test ID | Pass/Fail | Tester | Date/Time | Org | Document IDs | Official Numbers | Evidence Reference | Notes |
|---|---|---|---|---|---|---|---|---|

For every failure, capture:

- exact user role
- exact organization
- exact document ID
- exact official number shown
- exact error text
- whether the issue reproduces consistently

---

## 7. Defect Severity Rules

### Blocker

- duplicate official numbers
- official number assigned in draft state
- same document receives a second official number on retry/replay
- non-owner can execute owner-only sequencing governance
- lock-date protection can be bypassed
- cross-org sequencing data leakage

### Critical

- wrong official number displayed after finalization
- inconsistent official number across major product surfaces
- resequence apply mutates the wrong records
- read-only diagnostics mutate production-visible numbering state

### Major

- preview/apply summaries wrong but data remains intact
- support overview or diagnostics are materially misleading
- owner-only controls exposed incorrectly even if server later blocks them

### Minor

- copy issues
- layout issues
- non-critical display inconsistencies

---

## 8. QA Exit Criteria

QA should not sign off sequencing unless:

- all blocker scenarios pass
- all critical scenarios pass
- invoice numbering invariants are verified
- voucher numbering invariants are verified
- owner-only governance restrictions are verified
- resequence preview and apply are verified
- lock-date enforcement is verified
- diagnostics and support tooling are verified
- no unresolved integrity, permission, or resequence-safety defect remains

---

## 9. Sign-Off Record

| Field | Entry |
|---|---|
| Tester Name |  |
| QA Lead |  |
| Environment |  |
| Org Tested |  |
| Start Date |  |
| End Date |  |
| Blockers Found |  |
| Criticals Found |  |
| Final Status | Pass / Fail / Conditional |
| Notes |  |

