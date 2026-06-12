# Contextual Global Top Bar Redesign

Redesign `AppTopbar` to render contextual tabs and action buttons per route, matching the reference image's style (tabs on left, actions on right).

## Steps

1. **Restore messaging directory** from git if needed — the user deleted all messaging files after the last push.
2. **Create `getTopBarConfig(pathname)`** helper that returns tabs + actions per route:
   - Messaging: tabs `[Channels, DMs, Groups, Tasks, Meetings, Files, Admin]`, actions `[+ New, Search]`
   - Other routes: keep existing title/breadcrumbs or add minimal config later
3. **Refactor `AppTopbar`** to render the new contextual layout:
   - Left: `Slipwise` wordmark + horizontal tab row for the current suite
   - Right: action buttons (New dropdown, search input) + org name
   - Remove duplicate page title, breadcrumbs, and notification bell from messaging routes
4. **Wire messaging section switching** through the global top bar tabs (lift state or use URL)
5. **Verify build + tests pass**, commit, push, update PR #337.

## Open Questions
- Should this contextual pattern also apply to non-messaging routes (Docs, Data, Pay, etc.) or stay messaging-only for now?
- Should the tabs sync with the left-rail section switching or replace it?
