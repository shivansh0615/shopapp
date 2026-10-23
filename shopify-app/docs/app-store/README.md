# UpsellTrix — App Store submission pack

Canonical launch documentation for Shopify App Store preparation.

**Product name:** UpsellTrix  
**Status:** Repository listing copy is ready to paste. Hosted legal pages, support email, screenshots, and screencast are still operator-owned.

## Operator must supply today

Do not invent these values in the repository. Classify before publishing:

| Input | Classification | Where it is used |
|------|----------------|------------------|
| Production HTTPS app hostname | SUBMISSION_FORM_INPUT (also deploy input) | Partner app URLs; `SHOPIFY_APP_URL` for `generate:production-toml` |
| Support email | SUBMISSION_FORM_INPUT | Partner listing + hosted support page |
| Legal entity name, address, effective date | EXTERNAL_HOSTED_DOCUMENT_INPUT | Privacy policy + terms (legal review required) |
| Privacy / support / terms public HTTPS URLs | SUBMISSION_FORM_INPUT | Partner listing form |
| App icon, screenshots, feature image, demo screencast | SUBMISSION_FORM_INPUT | Capture from the production candidate; do not fabricate UI |
| Reviewer store / collaborator access | SUBMISSION_FORM_INPUT | `reviewer-instructions.md` |

`[SUPPORT_EMAIL]`, `[LEGAL_ENTITY_NAME]`, `[PRIVACY_EMAIL]`, `[EFFECTIVE_DATE]`, and `[LEGAL_ADDRESS]` in the drafts below are **SAFE_TEMPLATE_PLACEHOLDER** values. They are **CODE_BLOCKER** only if pasted live into the App Store or hosted as if they were real.

## Documents

| File | Purpose |
|------|---------|
| [requirements-matrix.md](./requirements-matrix.md) | Official requirement → status → evidence → action |
| [feature-inventory.md](./feature-inventory.md) | Definitive AVAILABLE / BETA / COMING_SOON / NOT_MARKETED matrix |
| [listing-copy.md](./listing-copy.md) | Name, subtitle, descriptions, feature bullets |
| [limitations.md](./limitations.md) | Merchant-friendly limitation disclosures |
| [privacy-policy-draft.md](./privacy-policy-draft.md) | Privacy policy draft (legal review required) |
| [terms-draft.md](./terms-draft.md) | Terms of Service draft (legal review required) |
| [support.md](./support.md) | Support / contact copy and paths |
| [screenshots.md](./screenshots.md) | Screenshot capture plan (real UI only) |
| [feature-image-icon.md](./feature-image-icon.md) | Icon + feature imagery specs |
| [demo-screencast.md](./demo-screencast.md) | Reviewer-focused screencast script |
| [reviewer-instructions.md](./reviewer-instructions.md) | Clean-store reviewer walkthrough |
| [pre-submission-checklist.md](./pre-submission-checklist.md) | Partner Dashboard / automated check prep |
| [clean-install-uninstall.md](./clean-install-uninstall.md) | Install / uninstall / reinstall expectations |

## Product truth (code-verified)

**AVAILABLE NOW (market these):**

1. Spend X → Free Gift  
2. Tiered Free Gifts (Tiered Rewards in marketing language)

**COMING SOON (do not market as live):**

- Mystery Gift — UI stub only; not creatable; no runtime evaluator

**NOT MARKETED as new:**

- Percentage / Fixed spend discounts (legacy runtime, hidden from create)
- Buy X Get Y, Bundles, Free Shipping+, Volume Discounts (placeholders / absent)

## Related merchant docs

- `docs/merchant/accelerated-checkout-limitation.md`
- `docs/merchant/compatibility-diagnostics.md`
