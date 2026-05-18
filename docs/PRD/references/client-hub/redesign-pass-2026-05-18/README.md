# Client Hub Redesign Reference Pack — 2026-05-18

This folder contains the primary visual references for the Sprint 1.4 corrective redesign of the Client Hub public shell and admin preview.

## Screenshots

| File | Route / View | Key Layout & Interaction Cues |
|------|-------------|-------------------------------|
| `dashboard-reference.png` | `/portal/[orgSlug]/client-hub` | Top nav with user chip, warm gradient hero, strong central headline, CTA row, left-side navigation rail, central "Take Actions" board (pay invoice + respond to quote), right-side support card, bottom pending invoices/quotes |
| `login-reference.png` | `/portal/[orgSlug]/client-hub/login` | Centered auth card, strong logo/title/intro hierarchy, premium email entry shell, strong CTA styling, passwordless trust messaging, refined card framing |
| `verify-reference.png` | `/portal/[orgSlug]/client-hub/verify` | Segmented OTP input treatment, same card geometry as login, resend/timing/help text placement |
| `invoices-list-reference.png` | `/portal/[orgSlug]/client-hub/invoices` | Integrated portal shell with left rail, stronger page chrome, better table framing, improved row hierarchy and status badges |
| `invoice-detail-reference.png` | `/portal/[orgSlug]/client-hub/invoices/[id]` | Strong hero band, centered invoice card floating over hero, grouped metadata, prominent pay-now CTA, items table and totals |
| `payment-step-reference.png` | `/portal/[orgSlug]/client-hub/invoices/[id]/payment` | Dedicated payment shell, breadcrumb/back path, amount-due hierarchy, payment method cards with selected state, instructions panel below |
| `quote-detail-reference.png` | `/portal/[orgSlug]/client-hub/quotes/[id]` | Hero + floating detail card, accept/reject controls with strong primary/negative button treatment, items/summary content |
| `contact-reference.png` | `/portal/[orgSlug]/client-hub/contact` | Same shell as dashboard, left rail retained, large main content card, clean contact grouping, emergency support block |

## Design Rules

- Layout and composition follow the references closely.
- Visual density and spacing follow the references.
- Page hierarchy and flow follow the references.
- Final identity is Slipwise/Acme-adapted (warm mint accent, not Heffl branding).
- All surfaces remain Phase 1 static-only.

## Usage

Engineering should treat this pack as the source of truth for visual composition during review. Any deviation from the reference layout should be explicitly justified.
