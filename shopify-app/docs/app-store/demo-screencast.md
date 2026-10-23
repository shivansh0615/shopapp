# UpsellTrix — Demo Screencast Script (reviewer-focused)

**Goal:** A Shopify reviewer can install, configure, and verify core value without guessing.  
**Language:** English (or English subtitles).  
**Tone:** Practical. No cinematic marketing fluff.  
**Do not demo Mystery Gift as available.**  
**Record from the production candidate** (real install, Dawn storefront). Do not fabricate UI or record localhost.

The video file itself is an operator listing input — this file is the capture script only.

Target length: **3–6 minutes**.

---

## Test data requirements

- Clean Shopify development store with Online Store  
- Theme: **Dawn** (or another OS2 theme)  
- 2–3 purchasable products priced so cart can cross thresholds (example: $25 / $40 items)  
- One free gift product with available Online Store variant (price can be >0; discount zeros it)  
- For Tiered demo: second gift product optional  

Exact amounts should match shop currency.

---

## Script

### 1. Fresh install (0:00–0:20)

**VO:** “Installing UpsellTrix from the Partner test install.”  
**Show:** OAuth grant → embedded app opens Overview.  
**Expect:** UpsellTrix first-run guidance visible.

### 2. Dashboard (0:20–0:40)

**VO:** “Overview explains the path: enable the theme embed, create a promotion, activate, then preview the store.”  
**Show:** Checklist / Theme setup card.

### 3. Enable theme app embed (0:40–1:20)

**VO:** “Open Theme setup, then Enable theme app embed. In App embeds, turn on UpsellTrix and save.”  
**Show:** Deep link → theme editor App embeds → toggle on → Save.  
**Expect:** Embed enabled on current theme.

### 4. Create Spend X → Free Gift (1:20–2:20)

**VO:** “Create a Spend X → Free Gift campaign. Set a threshold, choose a gift variant, and activate.”  
**Show:** Create flow → gift picker → Activate.  
**Expect:** Success notice; campaign Active.

### 5. Storefront verify (2:20–3:20)

**VO:** “On the storefront, add products until the progress bar approaches the goal. When the threshold is met, the free gift is added automatically on the cart path.”  
**Show:** Product add → cart drawer/page progress → gift line present.  
**Expect:** Progress UI + gift line (tagged).

### 6. Checkout discount check (3:20–3:50)

**VO:** “At checkout, the automatic discount applies so the gift is free on supported cart checkout.”  
**Show:** Checkout line with $0 gift treatment / discount.  
**Expect:** Gift not charged as a normal paid line.

### 7. Tiered Free Gifts (3:50–4:50)

**VO:** “Back in admin, here’s a Tiered Free Gifts campaign with multiple spend tiers.”  
**Show:** Open/create tiered campaign with 2 tiers → activate briefly or show existing.  
**Expect:** Tiers configured; storefront can show multi-tier progress if time allows (optional shorten).

### 8. Pause / cleanup (4:50–5:20)

**VO:** “Merchants can pause or delete campaigns anytime. Mystery Gift appears as coming soon and is not creatable.”  
**Show:** Pause campaign; briefly show Mystery Gift disabled card.  
**Expect:** No Mystery creation.

### 9. End (5:20–5:30)

**VO:** “That’s the core UpsellTrix path: embed, campaign, activate, storefront gift.”  

---

## Out of scope for screencast

- Paid billing purchase flow (none)  
- Claiming universal theme support  
- Fabricated analytics charts  
