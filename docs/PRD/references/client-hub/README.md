# Client Hub Reference Pack

This folder is reserved for the visual and behavioral references for the Client Hub program.

## Purpose

The Client Hub PRD depends on the screenshot set provided during product definition. Those references should not remain trapped in chat history only. This folder is the canonical place to keep the working reference pack for design and engineering.

## Expected contents

Store the screenshot set here using stable names such as:

- `01-client-hub-home.png`
- `02-client-hub-contact.png`
- `03-client-list-operator.png`
- `04-client-detail-copy-portal-link.png`
- `05-client-hub-login.png`
- `06-client-detail-finance-tabs.png`
- `07-client-detail-tab-strip.png`
- `08-quote-item-selector.png`
- `09-quote-actions-toolbar.png`
- `10-quote-detail-panel.png`
- `11-client-hub-dashboard-actions.png`
- `12-quote-public-review.png`
- `13-invoice-public-detail.png`
- `14-payment-method-selector.png`
- `15-current-slipwise-customer-list.png`
- `16-client-portal-settings-customization.png`
- `17-client-hub-login-alt.png`
- `18-client-hub-home-alt.png`

## Mapping

Use the set as follows:

- `01, 11, 18` — client hub dashboard and home composition
- `02` — contact page layout and information density
- `03, 15` — operator client workspace benchmark and current-state comparison
- `04, 06, 07, 10` — internal client detail workspace, finance tabs, and portal action placement
- `05, 17` — email OTP entry/login experience
- `08` — quote/document creation product/service selection interaction
- `09, 12` — quote action bar and client response flow
- `13, 14` — invoice and payment experience
- `16` — org default customization and live preview model

## Usage rule

Each sprint PR that implements a major Client Hub surface should reference the matching screenshot(s) from this folder in its PR description so design intent remains explicit during review.

## Current limitation

This repo change creates the reference structure and naming contract, but it does not embed the binary screenshots automatically from chat attachments. The screenshot image files should be exported into this folder using the file names above before implementation begins.
