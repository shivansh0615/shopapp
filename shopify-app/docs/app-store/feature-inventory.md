# UpsellTrix — Feature Inventory (code-verified)

Classification keys:

- **AVAILABLE** — Merchants can create/use it in production paths today  
- **BETA** — Works in limited/legacy form; do not primary-market  
- **COMING_SOON** — Intentionally stubbed / documented as future  
- **NOT_MARKETED** — Absent, placeholder-only, or explicitly unsupported  

## Promotion types

| Feature | Status | Evidence | Marketing rule |
|---|---|---|---|
| Spend X → Free Gift | AVAILABLE | Creatable (`MERCHANT_CREATABLE`); FREE_GIFT evaluator; gift sync; discount config | Primary listing feature |
| Tiered Free Gifts (“Tiered Rewards”) | AVAILABLE | Creatable; TIERED_FREE_GIFTS evaluator; tiered gift sync; discount config | Primary listing feature |
| Mystery Gift | COMING_SOON | Visible `available: false`; create rejected; no registry evaluator; discount sync skips | Do **not** list as available |
| Spend % / Fixed discounts | BETA | Runtime evaluators exist; hidden from create; legacy edit preserved | Do not advertise as new product |
| Buy X Get Y | NOT_MARKETED | Placeholder type only | Roadmap only |
| Bundles | NOT_MARKETED | No implementation | Roadmap only |
| Free Shipping (+ Gift) | NOT_MARKETED | Placeholder only | Roadmap only |
| Volume Discounts | NOT_MARKETED | No implementation | Roadmap only |
| Customer-choice rewards | NOT_MARKETED | Flag/field legacy; not productized | Roadmap only |

### Mystery Gift discrepancy

Product intent sometimes lists Mystery Gift as “Available Now.”  
**Code truth:** COMING_SOON. Listing and reviewer instructions must follow code.

## Storefront & rewards behavior

| Feature | Status | Notes |
|---|---|---|
| Theme app embed (required) | AVAILABLE | Display name UpsellTrix; block handle `free-gift-embed` |
| Progress bar — product page | AVAILABLE | Placement + storefront assets |
| Progress bar — cart drawer | AVAILABLE | Core path; Dawn/OS2 focused |
| Progress bar — cart page | AVAILABLE | Satellite cart-page script |
| Announcement placement | BETA | UI option; weaker runtime filtering — soft-market |
| Automatic gift add / sync | AVAILABLE | Tagged gift lines + sync satellites |
| Same-SKU / quantity enforcement | AVAILABLE | Gift engine / cart mapping paths (see tests) |
| Discount Function zero-price gifts | AVAILABLE | Automatic app discount provisioning |
| Design customization (colors, copy, templates) | AVAILABLE | Campaign builder widget settings |
| Campaign scheduling (start/end) | BETA | DB + selection aware; no full merchant schedule UI |
| Campaign analytics (unlocks / adds / revenue) | AVAILABLE | Summary metrics |
| Analytics trend charts | COMING_SOON | Explicit empty “coming soon” UI |
| Compatibility diagnostics | AVAILABLE | `/app/compatibility` |
| Accelerated Checkout gift insertion | NOT_MARKETED | Explicitly unsupported |
| Third-party drawer universal support | NOT_MARKETED | Adapter-oriented; not claimed universal |
| Multi-theme support | AVAILABLE (manual) | Embed must be enabled per theme; draft ≠ live |

## Billing

| Feature | Status | Notes |
|---|---|---|
| Free during private beta | AVAILABLE | In-app Billing page honest |
| Paid plans / Shopify Billing API | NOT_MARKETED | Not implemented |

## Admin experience

| Feature | Status | Notes |
|---|---|---|
| First-run checklist | AVAILABLE | Overview |
| Theme setup deep link + manual steps | AVAILABLE | Widgets / Theme setup |
| UpsellTrix branding in admin | AVAILABLE | Sidebar, Overview, TOML |
| Full Polaris shell | NOT_MARKETED | Custom UI debt |
