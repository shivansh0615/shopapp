# UpsellTrix — Screenshot Capture Plan

**Do not generate fake UI.** Capture from the **final production candidate** after the real HTTPS app is installed on a clean Dawn store. Do not capture localhost, tunnel, or CI hostnames.

No screenshots are produced in the repository. Listing images remain an operator capture task.

Shopify guidance (current): screenshots primarily show actual app UI; no browser chrome / desktop backgrounds; unique images; no pricing in images; no logo-only feature images; recommended **1600×900 (16:9)** desktop screenshots; include alt text; avoid PII and outcome guarantees.

Target: **4–6** screenshots (minimum 3).

---

## Global rules for every shot

**Must NOT appear**

- Browser chrome, OS desktop, DevTools  
- `localhost`, ngrok, or staging hostnames in visible UI  
- Fake revenue charts / invented metrics  
- Customer PII  
- “Notify me” paid CTAs or pricing badges  
- Mystery Gift presented as a creatable live type  
- Debug banners / `__FGPB` instrumentation  
- Testimonials  

**Crop:** App content area (embedded admin) or clean storefront cart UI. Square corners OK; Shopify rounds icons separately.

---

## Shot 1 — Overview / first-run

| | |
|---|---|
| **Screen** | `/app` Overview with first-run checklist (or light setup state) |
| **Story** | Merchant understands UpsellTrix and next steps |
| **State** | Prefer 0–1 campaigns; theme setup card visible; UpsellTrix branding |
| **Avoid** | Empty broken layout; PE / Promotion Engine product naming |
| **Caption** | Get started: enable embed, create a promotion, activate |

## Shot 2 — Campaigns list

| | |
|---|---|
| **Screen** | `/app/campaigns` |
| **Story** | Manage promotions |
| **State** | At least one Active Spend X → Free Gift and/or Tiered campaign with realistic names |
| **Avoid** | “test1”, lorem, empty-only if other shots already cover empty |
| **Caption** | Create and manage free-gift campaigns |

## Shot 3 — Spend X → Free Gift builder

| | |
|---|---|
| **Screen** | `/app/campaigns/new` or edit, type + reward steps |
| **Story** | Configure threshold + gift product |
| **State** | Real gift product selected; threshold set (e.g. shop currency 50/100) |
| **Avoid** | Mystery Gift selected; hardcoded wrong currency symbols if shop ≠ INR |
| **Caption** | Spend X → Free Gift campaign builder |

## Shot 4 — Tiered Free Gifts builder

| | |
|---|---|
| **Screen** | Tiered campaign with 2–3 tiers configured |
| **Story** | Multi-threshold rewards |
| **State** | Each tier has gift + threshold |
| **Avoid** | Incomplete tiers / errors |
| **Caption** | Tiered Free Gifts across spend levels |

## Shot 5 — Theme setup

| | |
|---|---|
| **Screen** | `/app/widgets` (Theme setup) |
| **Story** | Enable embed is clear |
| **State** | Embed CTA + numbered steps visible |
| **Avoid** | Dead-end with missing link and no manual steps |
| **Caption** | Enable the UpsellTrix theme app embed |

## Shot 6 — Storefront result (required customer-facing proof)

| | |
|---|---|
| **Screen** | Online Store product or cart with progress bar; optionally unlocked gift line |
| **Story** | Shoppers see the promotion |
| **State** | Active campaign; embed on; cart below/above threshold as intentional |
| **Avoid** | Password page, theme editor chrome if prohibited, unrelated apps cluttering |
| **Caption** | Progress bar on the storefront cart path |

## Optional Shot 7 — Store health check

| | |
|---|---|
| **Screen** | `/app/compatibility` |
| **Story** | Diagnostics exist for supportability |
| **State** | Overall READY or READY_WITH_LIMITATIONS preferred |
| **Avoid** | Raw stack traces; scary FAIL without actions |
| **Caption** | Compatibility and setup diagnostics |

## Explicitly excluded

- Mystery Gift builder as a “live feature” screenshot  
- Analytics fake trend chart (removed)  
- Billing paid-plan cards  

---

## Capture checklist

- [ ] Resolution 1600×900 (or export scaled cleanly)  
- [ ] PNG preferred  
- [ ] Unique scenes  
- [ ] Alt text written for each  
- [ ] No pricing overlays  
- [ ] Brand reads UpsellTrix  
