# Shopify App Store — Requirements Matrix

Sources (checked for Phase 3):

- [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements) (fetched 2026-08-12)
- [App listing best practices](https://shopify.dev/docs/apps/launch/shopify-app-store/best-practices)
- [Submit app for review](https://shopify.dev/docs/apps/launch/app-store-review/submit-app-for-review)
- Image standards changelog (2026-03): unique screenshots; UI-focused images; no logo-only feature images

| Requirement | Current status | Evidence | Action required |
|---|---|---|---|
| Truthful listing / no misleading claims | PARTIAL | Listing copy drafted in `listing-copy.md`; Mystery Gift excluded from “available” | Operator paste into Partner Dashboard; keep Mystery Gift as roadmap only |
| App name | READY | `shopify.app.upselltrix.toml` `name = "UpsellTrix"`; admin Overview uses UpsellTrix | Confirm Partner listing name matches |
| App card subtitle | DRAFTED | Candidates in `listing-copy.md` | Choose 1; no keyword spam / no stats |
| Short + full description | DRAFTED | `listing-copy.md` | Paste into listing; Online Store required |
| Feature list | DRAFTED | Matches AVAILABLE inventory only | Do not list Mystery Gift as live |
| Online Store sales channel required | REQUIRED | Theme app embed + App Proxy storefront widgets | Select “Merchant must have online store” in listing form |
| Pricing honesty | READY (free) | In-app Billing: free private beta; no Billing API charges | List as Free; do not imply paid plans |
| Shopify Billing API if charging | N/A | No paid charges implemented | When paid plans launch, implement Billing API first |
| Public application URL has no starter-template copy | READY (repo) | `app/routes/_index` is an UpsellTrix install page; `?shop=` still redirects to `/app` | Host the production HTTPS origin so reviewers hit this page |
| Privacy policy URL | BLOCKED (external) | Draft in `privacy-policy-draft.md`; no public URL yet | Host final policy; add listing URL |
| Support contact / URL | BLOCKED (external) | Copy in `support.md`; email placeholder | Provide real support email + hosted support page |
| App icon 1200×1200 PNG/JPEG | BLOCKED | Spec in `feature-image-icon.md`; asset not produced | Design/export icon (no tiny text, no Shopify marks) |
| Screenshots 1600×900, UI-focused, unique | BLOCKED | Plan in `screenshots.md`; assets not captured | Capture from real admin + storefront |
| Feature media / banner | BLOCKED | Spec in `feature-image-icon.md` | Produce non-logo-only feature imagery |
| Demo screencast | BLOCKED | Script in `demo-screencast.md`; video not recorded | Record English (or EN subtitles) walkthrough |
| Reviewer test instructions | DRAFTED | `reviewer-instructions.md` | Fill credential placeholders before submit |
| Test credentials | BLOCKED | Placeholders only | Operator supplies reviewer store / logins if needed |
| Embedded app + session tokens | IMPLEMENTED | `AppProvider embedded`; session auth via `@shopify/shopify-app-react-router` | Run Partner automated checks before submit |
| Compliance webhooks | IMPLEMENTED | `customers/data_request`, `customers/redact`, `shop/redact` in TOML + `/webhooks/compliance` | Confirm production URL subscribed |
| `app/uninstalled` webhook | IMPLEMENTED | TOML + handler deactivates discount, clears sessions | Covered by tests |
| Protected customer data | LIKELY OPT-OUT | App does not store buyer PII; analytics are shop/campaign events | Confirm PCD form / opt-out in Partner Dashboard |
| TLS / HTTPS app URL | EXTERNAL | Production hostname pending Phase 1 infra | Deploy HTTPS URL before listing |
| Theme app extension present | READY | `extensions/free-gift-progress-bar` (display name UpsellTrix) | Deploy extension with app |
| No pricing in images | READY (policy) | Screenshot plan forbids pricing overlays | Enforce at capture time |
| No Shopify trademarks in icon/screenshots | READY (policy) | Spec forbids Shopify logos | Enforce at asset creation |
| Clean install works | READY | `getSettings` auto-creates; dashboard first-run; no seed campaigns required | Manual reviewer verification on clean store |
| Accelerated checkout limitation disclosed | READY | In-app help + listing limitations | Keep consistent wording |
| Deprecated API health | MONITOR | Admin API `2025-10` aligned in UpsellTrix TOML | Re-check before submit |
| Polaris-native admin | DEBT | Custom admin shell (Phase 2 debt) | Not a hard block for all apps; reduces Built for Shopify readiness |

## Explicit non-claims for listing

Do **not** claim:

- Works on every theme / universal theme compatibility  
- Guaranteed revenue / AOV increase  
- AI-powered  
- Unlimited campaigns (unless verified)  
- Mystery Gift is available now  
- Accelerated Checkout / Buy it now gift insertion  
