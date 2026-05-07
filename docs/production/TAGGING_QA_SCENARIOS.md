# Tagging Platform — QA Scenarios

## Quick Verification Smoke Test (15 min)

### TS-1: Create and Use Tags
1. Go to Settings → Tag Management → verify admin access only
2. Create a tag: "Priority" with color red
3. Create another tag: "Q4 Budget" with color blue
4. Create invoice → select customer → verify "Priority" and "Q4 Budget" available
5. Add both tags to invoice → save → reopen → verify tags persisted

### TS-2: Default Tags
1. Go to Customers → select a customer → Edit → add "Priority" as default tag → Save
2. Create new invoice → select same customer → verify "Priority" auto-appears as selected
3. Remove the default tag before save → verify user can override
4. Go back to customer → remove default → create invoice → verify no pre-fill

### TS-3: Reports and Exports
1. Go to Intel → Reports → Invoice Report
2. Filter by a specific tag → verify only tagged invoices appear
3. Export CSV → open file → verify Tags column is present
4. Verify total amounts match filtered dataset

### TS-4: Analytics
1. Go to Intel → Reports → Tag Analytics
2. Switch between Revenue / Expense / Combined modes
3. Verify monthly trend chart renders
4. Click tag drill-down link → verify lands on filtered invoice list
5. Click KPI card "View Tagged Invoices" → verify lands on tagged-only list

### TS-5: Governance
1. Go to Settings → Tag Management
2. Verify usage counts display correctly
3. Rename a tag → verify name updates everywhere
4. Archive a heavily-used tag → verify impact warning appears
5. Archive → verify tag no longer appears in picker suggestions
6. Unarchive → verify tag reappears

### Non-Regression Checks
- [ ] Existing invoices/vouchers still load and edit correctly
- [ ] Existing reports/exports still work without tags
- [ ] Customer/vendor detail pages still render
- [ ] No tag leakage on PDF preview or public pages
