# Sequencing Settings UX Redesign PRD

## 1. Overview

Slipwise’s sequencing platform is functionally strong, but the current settings and onboarding experience still exposes internal sequence-engine concepts directly to the user. The result is that a non-technical owner can technically configure numbering, but often has to think like a system admin to do it safely.

Current examples of this problem:

- users must understand raw token syntax like `{YYYY}` and `{NNNNN}`
- users must manually type a `formatString` correctly
- users must infer what “current counter” means
- users must guess whether continuity seeding expects the latest used number or the next number they want Slipwise to issue
- basic settings, advanced diagnostics, and sequence-history tooling are visually stacked together without clear priority

This PRD defines a product redesign for the sequencing configuration experience so that a normal business owner can confidently set up and change numbering without learning implementation syntax.

This redesign covers:

- sequencing setup during onboarding
- sequence settings in the app settings area

It does not attempt to redesign the entire sequencing subsystem. The sequence engine, validation rules, and audit model remain intact underneath.

---

## 2. Product Goal

Redesign sequence configuration so that a non-technical owner can:

- understand how invoice and voucher numbers work
- choose how numbers should look
- change reset behavior safely
- continue from existing numbers without confusion
- preview the effect of their changes immediately

The system should feel like:

- “help me choose my numbering style”

not:

- “edit a sequence engine configuration string”

---

## 3. Problem Statement

### 3.1 Current UX issues

The current settings page is essentially a raw admin form around:

- `formatString`
- `periodicity`
- continuity seeding
- sequence history

The page is understandable to engineering or operations users who already know how the sequence engine works, but it is not optimized for the actual product goal of helping any owner configure numbering easily.

### 3.2 Specific failure points

1. **Raw token editing is the default**
- Users must type values such as `INV/{YYYY}/{NNNNN}` themselves.
- This assumes they understand:
  - what `YYYY` means
  - what `NNNNN` means
  - how many `N`s they need
  - which separators are valid

2. **The settings use implementation language**
- “Format String”
- “Periodicity”
- “Current Counter”

These labels reflect internal modeling, not user intent.

3. **Continuity seeding is cognitively hard**
- A user trying to “make the next invoice 10” must understand whether to enter 9 or 10.
- The current wording does not make the behavior obvious enough.

4. **Basic configuration and advanced tooling compete visually**
- Format setup
- continuity seeding
- history
- diagnostics
- resequencing/admin support concepts

These are all part of the same long admin surface, even though they represent very different user intents and risk levels.

5. **Onboarding and settings are not conceptually unified enough**
- onboarding already has a default/custom decision
- settings remain closer to a raw engine editor
- the mental model is not consistent enough across the two experiences

---

## 4. Target User

Primary user:

- organization `owner`

This redesign should optimize for:

- a non-technical business owner
- not a finance systems expert
- not an engineer
- not a power admin by default

The owner should be able to change numbering behavior confidently without external explanation.

---

## 5. Product Principles

1. **Human intent first**
- The UI should ask users what they want their numbers to look like, not how they want to construct token strings.

2. **Safe by default**
- Common flows should be hard to misconfigure.

3. **Progressive disclosure**
- Basic users should not see advanced engine concepts first.
- Advanced controls can exist, but only as a secondary mode.

4. **Immediate clarity**
- Users should always understand:
  - latest issued number
  - next number
  - reset cycle
  - what changes after save

5. **One mental model across onboarding and settings**
- The product must use the same language and builder logic in both places.

---

## 6. Scope

### In scope

- redesign of sequence setup in onboarding
- redesign of sequence settings page in app settings
- format configuration builder
- continuity setup flow
- live preview behavior
- clearer IA between basic setup and advanced/admin tools
- advanced mode definition
- terminology rewrite

### Out of scope

- changing the sequencing engine data model
- changing assignment timing rules
- changing audit semantics
- redesigning the actual issue/approve flows
- redesigning the full resequencing workflow itself
- changing permissions model beyond better UX gating and presentation

---

## 7. Redesign Goals

The new experience must make it easy for an owner to complete these tasks:

1. choose invoice numbering style
2. choose voucher numbering style
3. choose whether the series resets monthly, yearly, financially, or never
4. set how long the running number should be
5. see a live preview of the next number
6. continue from an already-used external number without guessing
7. understand where advanced/admin tooling lives without being overwhelmed by it

Success criteria:

- a first-time owner can configure numbering without learning token syntax
- a first-time owner can explain what the next invoice or voucher number will be
- a user can continue from an existing number without confusion about whether to enter the latest used or next intended number
- advanced configuration remains possible without becoming the default path

---

## 8. Information Architecture Redesign

The settings surface should be reorganized around user intent.

### 8.1 Top-level settings structure

The sequence settings experience should be split into three layers:

#### A. Everyday setup
For normal owners doing regular configuration:

- invoice numbering
- voucher numbering
- pattern builder
- reset cycle
- live preview
- save

#### B. Continue from existing numbers
For continuity setup and migrations:

- latest used number
- next number preview
- plain-language explanation

#### C. History and troubleshooting
For advanced/admin support use:

- sequence history
- diagnostics
- support overview
- resequencing entry points

These sections must not visually compete equally. Everyday setup is primary. History and troubleshooting are secondary/advanced.

### 8.2 Onboarding structure

Onboarding should use the same conceptual structure:

- choose a simple numbering style
- optionally customize prefix/reset cycle/number length
- preview invoice and voucher numbering
- optionally continue from existing external numbers

Onboarding should not expose a “custom” mode that effectively dumps users into a raw token editor without guidance.

---

## 9. Primary Interaction Model

### 9.1 Guided numbering builder

The main interaction must be a builder, not a raw string input.

For each document type, the owner configures:

- **Prefix**
  - default invoice: `INV`
  - default voucher: `VCH`
- **Reset cycle**
  - Continuous
  - Monthly
  - Yearly
  - Financial year
- **Number length**
  - 3 digits
  - 4 digits
  - 5 digits
  - 6 digits
- **Date style**
  - include year
  - include month if relevant
  - use financial-year label if relevant

The UI should then generate the internal format representation automatically.

### 9.2 Output summary

Each builder should show:

- **Number pattern**
  - example: `INV/2026/00001`
- **Reset cycle**
  - example: `Resets every year`
- **Latest issued number**
  - if one exists
- **Next number Slipwise will issue**
  - always visible

### 9.3 Human-readable summary sentence

Each sequence card should include a sentence like:

- “Invoices will look like `INV/2026/00001` and reset every year.”
- “Vouchers will look like `VCH/2026/00001` and continue without resetting.”

This summary should update live as the user changes inputs.

---

## 10. Advanced Mode

### 10.1 Requirement

Raw token editing may still exist because the engine uses token-based formats, but it must become a secondary path.

### 10.2 Presentation

Advanced mode should be behind an explicit control such as:

- `Advanced format editor`

It should not be visible as the primary control by default.

### 10.3 Advanced mode behavior

If the user opens advanced mode:

- the raw token editor becomes available
- live validation remains visible
- live preview remains visible
- a warning should explain that this mode is intended for advanced users

### 10.4 Compatibility

The advanced mode must remain compatible with existing sequence validation rules and token support.

The builder remains the primary recommended configuration path.

---

## 11. Continuity Setup Redesign

### 11.1 Current problem

The current continuity seeding experience forces users to infer sequencing semantics:

- does the field want the latest number already used?
- or the next number desired?

This causes unnecessary confusion and risk.

### 11.2 New product wording

Replace “Continuity Seeding” with friendlier, task-based wording such as:

- `Continue from your last used number`

Replace “Latest Used Number” with:

- `Last number already used`

### 11.3 Required explanatory copy

The UI must clearly state:

- “If you already issued numbers outside Slipwise, enter the last number you used.”
- “Slipwise will continue from the next number.”

### 11.4 Immediate feedback

As the user types a value, the UI should show:

- `You entered: INV/2026/00010`
- `Slipwise will next issue: INV/2026/00011`

This should remove guesswork completely.

### 11.5 Validation

If the entered number does not match the selected numbering style, the product should show a human-readable message such as:

- “This number does not match your current invoice numbering style.”

Not:

- raw token or parser-style internal error messages

---

## 12. Terminology Redesign

The product should replace internal implementation labels in the primary UI.

### Replace:

- `Format String`
- `Periodicity`
- `Current Counter`
- `Continuity Seeding`

### With:

- `Number pattern`
- `Reset cycle`
- `Latest issued number`
- `Continue from your last used number`

### Advanced-only labels

If raw engine concepts remain, they should be visible only in advanced mode:

- `Advanced format editor`
- `Token format`

---

## 13. Settings Page Requirements

The redesigned settings page must:

1. show invoice and voucher setup in a clear, parallel structure
2. make current state readable without technical vocabulary
3. allow editing through the builder first
4. show live preview at all times
5. isolate advanced controls from everyday setup
6. move diagnostics/history/resequence into an advanced/admin area

### 13.1 Card structure

Each sequence card should have:

- card title
- active/inactive state
- latest issued number
- next number
- number pattern summary
- reset cycle
- `Edit numbering` action

The edit experience can be inline or drawer/modal-based, but it must feel guided.

### 13.2 Save flow

Before saving material changes, the UI should clearly show:

- current pattern
- new pattern
- current next number preview
- new next number preview

The user should understand what future documents will look like after save.

---

## 14. Onboarding Requirements

The onboarding sequence setup should mirror the same model as settings.

### 14.1 Default-first path

The default onboarding path should offer:

- “Use recommended defaults”

with clear examples:

- Invoice: `INV/2026/00001`
- Voucher: `VCH/2026/00001`

### 14.2 Customize path

If the owner chooses to customize:

- show the same builder used in settings
- not a raw token-first experience

### 14.3 Continuity during onboarding

If a user is migrating from another system:

- let them provide their last used invoice number
- let them provide their last used voucher number
- show the next number Slipwise will issue

### 14.4 Re-entry

If onboarding is resumed later:

- the same builder and previews should be restored
- the same terminology should be used

---

## 15. Validation and Guardrails

The redesigned UX should prevent errors before save.

### 15.1 Builder guardrails

- invalid combinations should be prevented where possible
- monthly reset should automatically show a month-aware preview
- financial-year mode should explain what financial-year labeling means
- number length options should always generate valid running-number output

### 15.2 Save-time clarity

If a change materially affects future numbering:

- show an explicit explanatory summary before save

Example:

- “Future invoices will switch from yearly numbering to monthly numbering.”
- “Already-issued invoices will not be changed.”

### 15.3 Continuity guardrails

- the user should see whether the entered number matches the current pattern
- the user should see the next number immediately
- the product should avoid forcing users to mentally compute the next number

---

## 16. Diagnostics and Admin Tool Positioning

Diagnostics, support tooling, history, and resequencing remain important, but they should not be part of the default setup surface.

### 16.1 UX requirement

These tools should appear under a clear secondary/admin section such as:

- `History and troubleshooting`
- `Advanced admin tools`

### 16.2 Product intent

The page should communicate:

- basic numbering setup is normal
- resequencing and diagnostics are specialized/admin actions

This separation reduces intimidation for non-technical owners and lowers the chance of accidental misuse.

---

## 17. Accessibility and Clarity Requirements

The redesigned flow should:

- use plain language
- avoid jargon in the primary path
- provide persistent preview
- avoid long unexplained forms
- ensure labels and helper text are screen-readable
- keep action hierarchy clear
- avoid making important explanations look like low-contrast footnotes

---

## 18. Acceptance Criteria

The redesign is successful when:

1. an owner can configure invoice numbering without editing raw token syntax
2. an owner can configure voucher numbering without editing raw token syntax
3. a user can understand the difference between latest issued number and next number
4. a user can continue from an external numbering series without guessing whether to enter the latest used or next desired number
5. onboarding and settings share the same sequencing mental model
6. advanced token editing remains available but is not the default path
7. diagnostics/history/resequence tools remain accessible without visually overwhelming the core setup flow
8. non-owner permissions remain correctly enforced

---

## 19. UX Validation Scenarios

The eventual implementation should be tested against these scenarios:

- first-time owner completes setup using recommended defaults
- owner customizes invoice prefix and reset cycle without touching raw tokens
- owner customizes voucher number length and sees live preview update
- owner enters external last used number and understands what next number Slipwise will issue
- owner opens advanced mode and edits raw format deliberately
- non-owner cannot mutate sequence configuration
- owner can distinguish basic setup from advanced/admin tools

---

## 20. Implementation Notes

This redesign should be implemented on top of the existing sequencing subsystem.

Repo-grounded anchors:

- current settings page: `src/app/app/settings/sequences/page.tsx`
- current onboarding sequence setup: `src/app/onboarding/onboarding-page-client.tsx`
- current onboarding actions: `src/app/onboarding/actions.ts`
- existing sequence engine and token model remain valid

The builder can compile down to the existing token-based format representation under the hood.

This PRD is therefore a:

- UI/UX redesign
- information architecture redesign
- terminology redesign
- task-flow redesign

not a replacement of the sequencing engine itself.

---

## 21. Final Product Direction

Slipwise should present document numbering as a guided business configuration experience.

The owner should feel:

- “I can choose how my invoice and voucher numbers work.”

not:

- “I need to understand sequence syntax before I can safely use this.”

That is the standard this redesign must meet.
