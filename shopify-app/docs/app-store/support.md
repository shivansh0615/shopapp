# UpsellTrix — Support Experience

## Operator must supply today

| Input | Classification |
|-------|----------------|
| Monitored support email | SUBMISSION_FORM_INPUT |
| Hosted HTTPS support page URL | SUBMISSION_FORM_INPUT |

`[SUPPORT_EMAIL]` below is a **SAFE_TEMPLATE_PLACEHOLDER**. Do not paste it into the Partner listing. This repository will not invent an inbox.

## Support email

`[SUPPORT_EMAIL]`  
Replace with the inbox you monitor before hosting or submitting (example pattern only: `support@your-domain.com` — do not publish unowned domains).

**Expected response guidance (internal):** reply within 2 business days during private beta; acknowledge same day when possible.

---

## App Store “Get support” / contact page copy

**Headline:** Contact UpsellTrix support

**Body:**

Need help with UpsellTrix? Email `[SUPPORT_EMAIL]` with:

- Your myshopify.com domain  
- What you expected vs what happened  
- Theme name (for example Dawn)  
- Screenshots of the admin campaign and storefront cart if relevant  

Before writing, try these in-app guides:

1. **Theme setup** — enable the UpsellTrix app embed  
2. **Store health check** — install / storefront contact diagnostics  
3. **Accelerated Checkout notes** — Buy it now limitations  

---

## In-app support entry points (live)

| Path | Purpose |
|------|---------|
| `/app/help` | Help hub (theme setup, health, accelerated checkout, billing) |
| `/app/widgets` | Theme setup / embed deep link |
| `/app/compatibility` | Store health check |
| `/app/help/accelerated-checkout` | Buy it now limitation |
| `/app/settings` | Links to the above |
| `/app/billing` | Free beta status (not a paid support gate) |

---

## Hosted support page (recommended external URL)

Publish a simple page (not a cloud doc) containing:

- The contact copy above  
- Link to privacy policy  
- Link to terms  
- FAQ: embed required, Dawn focus, accelerated checkout limitation, Mystery Gift coming soon  

App Store listing “Support” / website links must not 404.

---

## Troubleshooting short FAQ

**Progress bar missing**  
Enable UpsellTrix under Theme → App embeds → Save. Draft and live themes differ. Open Theme setup → Check connection.

**Gift not added**  
Confirm campaign is Active, gift variant is available, cart spend meets threshold, and shopper used Add to cart (not Buy it now).

**Discount looks wrong at checkout**  
Wait briefly after activation for discount sync; refresh checkout; contact support with shop domain if it persists.

**Mystery Gift**  
Not available yet — shown as Coming soon in the campaign builder.
