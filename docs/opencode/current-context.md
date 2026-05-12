# Current Project Context — Payslip Generator / Slipwise

> **Generated:** 2026-05-08  
> **Branch:** `feature/platform-rebrand-redesign-tagging-studio-redesign`  
> **PR:** #314 (open, force-pushed multiple times)  
> **Parent Branch:** `feature/platform-rebrand-redesign-tagging`

---

## 1. What We Are Building

A **studio redesign** for the Invoice and Voucher document editors ("studios"):
- Minimal, clean left-right layout
- No second sticky bar — workspace actions live in the main **AppTopbar**
- Zoomable A4 document preview (fit / + / −)
- Collapsible form sections with icons
- Tag picker with inline creation in the workspace header
- Clean outlined input fields (not bottom-border-only)

---

## 2. Latest Commit

```
20093f4a feat: redesign invoice and voucher studios with minimal clean layout
```

**Files changed (13):**

| File | What Changed |
|------|-------------|
| `docs/PRD/MAILBOX_PLATFORM_PRD.md` | Large PRD updates (+855 lines) |
| `docs/opencode/2026-05-08_10-22-35.md` | Session log (+53 lines) |
| `src/components/document/document-preview-surface.tsx` | Zoom controls, A4 scaling, no cut-off (+255, −153) |
| `src/components/forms/form-section.tsx` | Collapsible accordion, icon prop, no eyebrow (+79, −38) |
| `src/components/forms/input-primitives.tsx` | Restored outlined borders (+6, −2) |
| `src/components/foundation/document-workspace-layout.tsx` | Left-right split layout, no sticky header (+664, −472) |
| `src/components/layout/app-shell.tsx` | Wraps app in `WorkspaceTopBarProvider` (+29, −4) |
| `src/components/layout/app-topbar.tsx` | Reads workspace actions/tags from context (+91, −27) |
| `src/components/layout/workspace-topbar-context.tsx` | **New** — React context for topbar action bridge (+75) |
| `src/features/docs/invoice/components/invoice-save-bar.tsx` | Minor updates (+18, −2) |
| `src/features/docs/invoice/components/invoice-workspace.tsx` | Tag picker, icons on sections (+50, −26) |
| `src/features/docs/voucher/components/voucher-workspace.tsx` | Tag picker, icons on sections (+65, −25) |
| `src/features/tags/components/tag-picker.tsx` | Inline creation support (+159, −36) |

---

## 3. Key Architecture Decisions

### 3.1 Topbar Action Bridge
- **Problem:** Workspace actions (Save, Export, View toggle, Tag picker) need to appear in `AppTopbar`, but `AppTopbar` is rendered high in the tree, outside the workspace.
- **Solution:** `WorkspaceTopBarContext` (React Context) in `src/components/layout/workspace-topbar-context.tsx`
  - `WorkspaceTopBarProvider` wraps the app in `AppShell`
  - `DocumentWorkspaceLayout` registers its actions/tags into the context
  - `AppTopbar` reads from context and renders them next to the notification bell

### 3.2 Preview Scaling
- `DocumentPreviewSurface` uses `ResizeObserver` on the viewport
- Calculates `fitZoom = min(1, viewportWidth / PREVIEW_DOCUMENT_FRAME_WIDTH)`
- Renders an outer wrapper with explicit `width/height` in scaled pixels
- Inner content uses `transform: scale(currentZoom)` with `transformOrigin: top left`
- This prevents right-side cut-off that plagued earlier transform-only approaches

### 3.3 Form Section Design
- `FormSection` is now a collapsible accordion (Radix `Collapsible`)
- Props: `icon`, `title`, `description` — **no `eyebrow` label**
- Icon is rendered as a plain Lucide icon in brand red (`text-[var(--brand-cta)]`)
- No container/border/shadow around the icon — top-aligned with text
- Chevron rotates on open/close
- All `eyebrow` props removed from Invoice and Voucher workspace usage

### 3.4 Input Field Styling
- Restored proper outlined borders: `border border-[var(--border-default)]`
- Focus ring uses brand color
- No more bottom-border-only inputs in the workspace forms

---

## 4. File Inventory — New & Modified

### New Files
- `src/components/layout/workspace-topbar-context.tsx` — React context for workspace → topbar communication

### Heavily Modified
- `src/components/foundation/document-workspace-layout.tsx` — Complete rewrite of workspace chrome
- `src/components/document/document-preview-surface.tsx` — Zoomable preview with controls
- `src/components/forms/form-section.tsx` — Collapsible sections with icons
- `src/features/tags/components/tag-picker.tsx` — Inline tag creation

### Moderately Modified
- `src/components/layout/app-topbar.tsx` — Renders workspace actions from context
- `src/components/layout/app-shell.tsx` — Provides `WorkspaceTopBarProvider`
- `src/components/forms/input-primitives.tsx` — Border styles
- `src/features/docs/invoice/components/invoice-workspace.tsx` — Tag picker, icons
- `src/features/docs/voucher/components/voucher-workspace.tsx` — Tag picker, icons

---

## 5. CSS Variable Chain (Critical)

```
--voucher-ink  = "#1d1710"   (set inline on document frames)
--voucher-accent = document.branding.accentColor || "var(--accent)"
--accent = var(--brand-cta)   (in globals.css legacy aliases)
--brand-cta = #B91C1C         (actual brand red)
```

**How it flows:**
1. `InvoiceDocumentFrame` / `VoucherDocumentFrame` sets `--voucher-accent` inline
2. If `branding.accentColor` is missing, falls back to `var(--accent)`
3. Templates use `text-[var(--voucher-ink)]` for dark text and `text-white` on dark accent backgrounds

---

## 6. Known Issue: Black Text on Dark Backgrounds

**Status:** Investigated, not yet reproduced.

**Report:** User mentioned seeing black text where white is expected on dark accent-colored elements in invoice templates.

**Investigation findings:**
- All invoice templates (`minimal`, `classic-bordered`, `bold-brand`, `professional`, `modern-edge`) explicitly set `text-white` on every element inside a dark `var(--voucher-accent)` background
- Voucher templates (`modern-card`, `compact-receipt`, `traditional-ledger`, `minimal-office`) also explicitly set `text-white`
- `tailwind-merge` correctly removes `text-[var(--voucher-ink)]` when `text-white` is passed as an override
- Inline edit fields inside dark backgrounds (e.g., `bold-brand` editor) pass `text-white` explicitly

**Possible causes not ruled out:**
1. Specific template + mode combination not yet inspected
2. Runtime CSS variable resolution failure (e.g., `var(--voucher-accent)` resolves to an invalid/unexpected color)
3. Print/PDF export pipeline issue (different rendering path)
4. Browser-specific rendering quirk with `color-mix()` or `rgba()` in gradient backgrounds

**Needs clarification:**
- Which template? Which mode (preview/edit/print/pdf)?
- Which element? (balance due card, header gradient, invoice badge, etc.)
- Screenshot or exact color value observed

---

## 7. Template List — Invoice

| Template | ID | Has Dark Accent BG? |
|----------|-----|---------------------|
| Minimal | `minimal` | Yes — balance due card |
| Classic Bordered | `classic-bordered` | Yes — balance due row |
| Bold Brand | `bold-brand` | Yes — entire header gradient |
| Professional | `professional` | Yes — grand total card |
| Modern Edge | `modern-edge` | Yes — badge, due callout, sidebar |

All 5 invoice templates have `text-[var(--voucher-ink)]` on the root wrapper and override with `text-white` on dark accent sections.

---

## 8. Template List — Voucher

| Template | ID | Has Dark Accent BG? |
|----------|-----|---------------------|
| Minimal Office | `minimal-office` | Yes — balance due sidebar |
| Modern Card | `modern-card` | Yes — type badge, amount hero gradient |
| Compact Receipt | `compact-receipt` | Yes — amount circle |
| Traditional Ledger | `traditional-ledger` | Yes — header bar |
| Formal Bordered | `formal-bordered` | No — only borders, no fill |

---

## 9. Development Notes

- **Dev server port:** 3001
- **Kill port conflict:** `lsof -ti:3001 | xargs kill -9`
- **Build warnings:** `src/lib/analytics.ts` shows "Critical dependency" warnings in dev — do not block compilation, ignore for now
- **Do not touch:** `src/lib/money.ts` has unrelated local modifications
- **Test command:** `npm run test` (run before finalizing)
- **Lint command:** `npm run lint` (run before finalizing)

---

## 10. Next Steps (from previous session)

1. **Verify zoom preview** at various levels to confirm no right-side cut-off
2. **Reproduce text color issue** — need user clarification on template/mode/element
3. **Run tests** and fix any failures
4. **Run lint** and fix any issues
5. **Merge PR #314** after approval

---

## 11. Quick Reference: Key Code Patterns

### WorkspaceTopBarContext usage
```tsx
// In DocumentWorkspaceLayout:
const { setActions, setTags } = useWorkspaceTopBar();
useEffect(() => {
  setActions(workspaceActions);
  setTags(tagSection);
  return () => { setActions([]); setTags(null); };
}, [workspaceActions, tagSection]);

// In AppTopbar:
const { actions, tags } = useWorkspaceTopBar();
// Render actions and tags next to notification bell
```

### DocumentPreviewSurface zoom
```tsx
const fitZoom = Math.min(1, viewportWidth / PREVIEW_DOCUMENT_FRAME_WIDTH);
const currentZoom = zoom === "fit" ? fitZoom : zoom / 100;
// Outer wrapper: width = A4_WIDTH * currentZoom
// Inner content: transform: scale(currentZoom)
```

### FormSection with icon
```tsx
<FormSection
  icon={<Palette className="h-5 w-5" />}
  title="Branding"
  description="Customize colors and logo"
  defaultOpen
>
  {/* fields */}
</FormSection>
```

---

## 12. Git Status

- Current branch: `feature/platform-rebrand-redesign-tagging-studio-redesign`
- Parent: `feature/platform-rebrand-redesign-tagging`
- PR #314: Open, latest commit `20093f4a`
- No uncommitted changes at time of writing (context doc only)

---

*End of context document.*
