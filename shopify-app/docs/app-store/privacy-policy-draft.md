# UpsellTrix — Privacy Policy Draft

**Status:** Draft for hosting. **Requires legal counsel review.**  
**Do not publish placeholders as final facts.** This repository does not invent legal entity, email, or address values.

### Operator must supply before hosting

| Placeholder | Classification | Why |
|-------------|----------------|-----|
| `[LEGAL_ENTITY_NAME]` | EXTERNAL_HOSTED_DOCUMENT_INPUT | Legal controller / operator name |
| `[LEGAL_ADDRESS]` | EXTERNAL_HOSTED_DOCUMENT_INPUT | Postal contact if you include one |
| `[EFFECTIVE_DATE]` | EXTERNAL_HOSTED_DOCUMENT_INPUT | Policy effective date |
| `[PRIVACY_EMAIL]` | EXTERNAL_HOSTED_DOCUMENT_INPUT | Privacy contact inbox you monitor |
| `[SUPPORT_EMAIL]` | SUBMISSION_FORM_INPUT | Same inbox may be used for App Store support |
| Hosted HTTPS URL of the final policy | SUBMISSION_FORM_INPUT | Partner listing “Privacy policy” field |

These tokens are **SAFE_TEMPLATE_PLACEHOLDER** in this draft. They become a **CODE_BLOCKER** only if published live as if they were real.

Effective date: `[EFFECTIVE_DATE]`  
Operator / controller: `[LEGAL_ENTITY_NAME]`  
Contact: `[PRIVACY_EMAIL]` · `[SUPPORT_EMAIL]`  
Postal address: `[LEGAL_ADDRESS — do not invent]`

---

## 1. Who we are

UpsellTrix (“the App”) is a Shopify application that helps merchants run spend-threshold free-gift promotions on their Online Store.

This policy explains what information the App processes when a merchant installs and uses UpsellTrix.

---

## 2. Scope

This policy covers data processed by UpsellTrix in connection with:

- App installation and authentication  
- Campaign configuration  
- Storefront promotion evaluation via Shopify App Proxy  
- Operational logs and diagnostics  
- Support requests  

It does **not** replace Shopify’s own privacy policy for data Shopify processes as a platform.

---

## 3. Data we process (code-based inventory)

### 3.1 Merchant / shop data

- Shopify shop domain  
- OAuth / offline session tokens and granted scopes (stored for API access while installed)  
- App settings (default threshold, widget colors, automation flags, currency code)

### 3.2 Campaign configuration

- Campaign names, types, statuses  
- Spend thresholds and reward configuration  
- Gift product / variant identifiers and titles/images used for display  
- Widget settings and placements  
- Discount sync state identifiers managed for the shop  

### 3.3 Product catalog access

The App reads product/variant information needed to select gifts and validate availability (via Shopify Admin APIs within granted scopes).

### 3.4 Analytics events (shop-scoped)

The App may store aggregate/event records such as:

- Widget impressions  
- Gift unlocked / gift added events  
- Influenced-order markers with order id and revenue amounts provided by storefront/proxy flows  

These events are associated with **shop** and **campaign**, not with a customer profile UI in the App.

### 3.5 Storefront / App Proxy requests

Storefront scripts request widget state and may send cart context needed to evaluate promotions (for example cart subtotal / currency / line signals). Requests are authenticated via Shopify App Proxy mechanisms.

### 3.6 Logs

Operational logs may include shop domain, error codes, and technical diagnostics. Secret scanning/redaction practices are used for sensitive strings in logging helpers.

### 3.7 Support data

If you contact support, we process the content you send (email body, screenshots you attach).

### 3.8 Cookies

The embedded admin relies on Shopify session-token flows. The App does not intentionally set marketing cookies on the merchant’s storefront customers for UpsellTrix advertising.

---

## 4. Customer / buyer personal data

**Current application behavior:** UpsellTrix does **not** maintain a buyer CRM and does **not** store customer email, phone, or address as first-class records for marketing.

Compliance handlers for `customers/data_request` and `customers/redact` acknowledge requests and report that buyer personal records are not found in App storage (`buyerRecordsFound: false` path).

**Legal note:** Shopify may still expose APIs or payloads that touch protected customer data depending on future scopes or features. If scopes change, this section must be re-audited. **[LEGAL REVIEW REQUIRED]**

---

## 5. Why we process data

- Provide and secure the App (authentication, webhooks)  
- Configure and evaluate promotions  
- Sync automatic discounts for qualifying gifts  
- Show merchant analytics summaries  
- Diagnose setup/compatibility issues  
- Respond to support and legal requests  

---

## 6. Legal bases (where GDPR/UK GDPR applies)

Depending on jurisdiction: performance of a contract with the merchant, legitimate interests in securing/operating the service, and legal obligations. **[LEGAL REVIEW REQUIRED]**

---

## 7. Subprocessors / infrastructure

Hosting, database, and logging providers used to run UpsellTrix. Current production hosts may include:

- `[CLOUD_HOST / REGION]`  
- `[DATABASE_PROVIDER]`  
- Shopify (platform APIs)

**Update this list before publish.** **[LEGAL REVIEW REQUIRED]**

---

## 8. Retention

- While the App is installed: sessions, settings, campaigns, and analytics needed to operate the App  
- On `app/uninstalled`: sessions and operational discount records are cleaned; campaigns/settings may be retained for reinstall until Shopify shop redaction  
- On `shop/redact`: shop data including campaigns, settings, analytics, and related records are deleted per handler design  

Exact retention windows for backups: `[BACKUP_RETENTION — ops to confirm]`.

---

## 9. Deletion and privacy requests

Merchants can uninstall the App. Shopify GDPR/compliance webhooks are implemented for:

- `customers/data_request`  
- `customers/redact`  
- `shop/redact`  

For privacy inquiries, contact `[PRIVACY_EMAIL]`.

---

## 10. Security

Access tokens are stored server-side. Transport should be HTTPS/TLS in production. Access to production systems should be limited to authorized operators. No security measure is perfect.

---

## 11. International transfers

If data is processed outside your country, appropriate transfer mechanisms may apply. **[LEGAL REVIEW REQUIRED]**

---

## 12. Children

The App is intended for merchant business use, not for children.

---

## 13. Changes

We may update this policy. Material changes should be reflected by updating the effective date and, where required, notifying merchants.

---

## 14. Contact

`[LEGAL_ENTITY_NAME]`  
`[PRIVACY_EMAIL]`  
`[SUPPORT_EMAIL]`  
`[LEGAL_ADDRESS]`

---

## Implementation notes (not for public policy text)

Code evidence:

- Sessions + scopes: Shopify app session storage  
- Settings/campaigns: Prisma models via repositories  
- Analytics: `analytics.server.ts` event types  
- Compliance: `webhooks.server.ts` + `/webhooks/compliance`  
- Uninstall preserves campaigns until shop/redact  
