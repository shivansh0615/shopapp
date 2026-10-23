# UpsellTrix — Clean Install / Uninstall / Reinstall

## Clean install status: READY (code-audited)

Fresh merchants do **not** require:

- Pre-seeded campaigns  
- Pre-created AppSettings (auto-created on first `getSettings`)  
- Pre-enabled theme embed (guided in Overview / Theme setup)  
- Pre-provisioned discount (created/synced when campaigns activate)  
- Dev-only session state  

Evidence:

- `getSettings(shop)` creates defaults when missing — `app/services/settings.server.ts`  
- Overview first-run empty states — `app/routes/app._index.tsx`
- Campaigns empty state with CTA — `CampaignTable`  
- Discount ensure/sync runs after campaign writes — merchant discount sync path  

**Merchant must still:** enable theme embed on the theme under test (cannot be silent).

### Residual clean-install notes

- Currency defaults may be INR until settings/campaign currency aligns with shop — display helpers use settings/campaign currency; operators should verify shop currency on first campaign.  
- Automatic embed verification is intentionally best-effort (“unable to verify automatically”).  

No architecture redesign performed in Phase 3.

---

## Uninstall status: READY (code-audited; not live-destructively tested here)

`app/uninstalled` handler (`handleAppUninstalled`):

1. Best-effort deactivate managed automatic discount while Admin session exists  
2. Record terminal sync note if deactivate fails (cannot retry after credential wipe)  
3. Delete sessions + shop discount operational records  
4. **Preserve** campaigns + AppSettings until `shop/redact` (reinstall-friendly)

Evidence: `app/services/webhooks.server.ts`, uninstall deactivation tests in discount-sync suite.

### Merchant expectation wording

Uninstall removes app access immediately. Promotion configuration may remain retained briefly for reinstall until Shopify’s shop redaction webhook. After `shop/redact`, shop data is wiped.

---

## Reinstall status: READY (expected)

1. OAuth creates new session  
2. Prior campaigns/settings appear if not redacted  
3. Theme embed must be re-checked (theme state is independent)  
4. Discount provisioning/sync resumes on next campaign activate/save  

---

## Compliance webhooks

| Topic | Behavior |
|---|---|
| `customers/data_request` | Acknowledge; no buyer CRM records found |
| `customers/redact` | Acknowledge; no buyer CRM records found |
| `shop/redact` | Delete shop campaigns, settings, analytics, sessions, related rows |

---

## Live destructive testing

Phase 3 did **not** perform live uninstall against production shops.
