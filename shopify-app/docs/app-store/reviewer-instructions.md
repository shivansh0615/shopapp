# UpsellTrix — Reviewer Test Instructions

Assume a **clean** eligible Shopify store. Do not assume pre-seeded campaigns, pre-enabled embeds, or developer DB state.

**App:** UpsellTrix  

Operator fills these before submit. Tokens are **SAFE_TEMPLATE_PLACEHOLDER** / **SUBMISSION_FORM_INPUT** — do not invent them in git:

**Support:** `[SUPPORT_EMAIL]`  
**Demo store (optional):** `[DEMO_STORE_URL]`  
**Reviewer credentials (if any non-Shopify login):** `[NOT REQUIRED for core embedded app — Shopify admin is enough]`  
**Test store access:** `[OPERATOR_PROVIDES_STORE_OR_COLLABORATOR_ACCESS]`

---

## Prerequisites

1. Shopify store with **Online Store** channel  
2. Theme: **Dawn** recommended (Online Store 2.0)  
3. At least two regular products and one gift product with an available variant published to Online Store  
4. Note shop currency for thresholds  

---

## A. Installation

1. Install UpsellTrix  
2. Approve requested scopes  
3. Confirm embedded admin loads Overview titled UpsellTrix  

**Expect:** First-run guidance and Theme setup entry points. No crash. No requirement for existing campaigns.

---

## B. Enable theme app embed

1. Open **Theme setup** (`Widgets` nav / Theme setup)  
2. Click **Enable theme app embed** (or follow manual steps: Online Store → Themes → Customize → App embeds)  
3. Enable **UpsellTrix**  
4. **Save** the theme  
5. Return to app → **Check connection** after a storefront preview (optional)

**Expect:** Steps are understandable even if automatic verification is “unable to prove.”

---

## C. Spend X → Free Gift test

### Setup

1. Create campaign → choose **Spend X → Free Gift**  
2. Set threshold to a reachable amount (example: `50` in shop currency)  
3. Select gift product + available variant  
4. Keep product/cart placements enabled  
5. **Activate**

### Storefront

1. Open the storefront (theme you embedded)  
2. Add non-gift products until cart subtotal approaches/exceeds threshold  
3. Open cart drawer or cart page  

**Expect:**

- Progress bar visible  
- When threshold met, gift line appears automatically on cart path  
- Proceed toward checkout: gift should be free via automatic discount on supported path  

### Negative check (limitation)

1. From a product page, use **Buy it now** / accelerated checkout if present  

**Expect:** Automatic gift insertion is **not** claimed on this path (documented limitation).

---

## D. Tiered Free Gifts test

1. Create **Tiered Free Gifts** campaign  
2. Configure at least two tiers with increasing thresholds and gift variants  
3. Activate  
4. On storefront, increase cart across tiers  

**Expect:** Multi-tier progress behavior; gifts sync for unlocked tiers on supported cart path.

---

## E. Mystery Gift

1. Open create campaign type selector  

**Expect:** Mystery Gift is visible as **Coming soon** and **not selectable/creatable**.  
Do not fail the app for Mystery Gift absence — it is not a live feature.

---

## F. Admin lifecycle

1. Pause campaign → storefront promotion stops for that campaign  
2. Re-activate  
3. Delete a draft/test campaign  

**Expect:** Clear success/error notices; no raw stack traces.

---

## G. Uninstall test

1. Uninstall UpsellTrix from the store  

**Expect:** App removed; automatic discount best-effort deactivation while session remains.  
Campaigns may be retained server-side until Shopify shop redaction (reinstall-safe), which is intentional.

---

## H. Reinstall test

1. Reinstall UpsellTrix  
2. Confirm Overview loads  
3. Confirm prior campaigns (if not redacted) are visible **or** clean empty state if shop was redacted  

**Expect:** OAuth succeeds; settings auto-create if missing; merchant can enable embed again.

---

## Known limitations (do not treat as defects)

- Dawn / OS2 cart focus — not universal themes  
- Theme embed required per theme  
- Accelerated Checkout / Buy it now unsupported for automatic gifts  
- Free during private beta — no paid plan purchase flow  

---

## Credentials placeholders for operator

| Field | Value |
|---|---|
| Collaborator access to test store | `[TBD]` |
| Theme password (if password-protected) | `[TBD]` |
| Support email listed in Partner Dashboard | `[TBD]` |
| Screencast URL | `[TBD]` |
| Privacy policy URL | `[TBD]` |
