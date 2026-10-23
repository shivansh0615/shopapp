# Production readiness — Phase 1

**Status:** Phase 1 implemented in-repo. **Not** App Store ready.
**Date:** 2026-07-30
**App:** Free Gift Progress Bar (`0.1.0-private-beta`)

This document describes Phase 1 SaaS / compliance foundations. Completing Phase 1 does **not** mean the app is ready for public App Store submission.

---

## Local development recovery (PostgreSQL)

After the SQLite → PostgreSQL baseline switch, local `shopify app dev` needs Postgres first. Existing `prisma/dev.sqlite` is **not** deleted and is **not** used.

```bash
# 1) Start local Postgres
docker compose -f docker-compose.postgres.yml up -d

# 2) Point .env at it (see .env.example)
# DATABASE_URL="postgresql://fgpb:fgpb@localhost:5432/fgpb?schema=public"

# 3) Apply the Postgres baseline (does NOT copy SQLite data)
npx prisma migrate deploy
npx prisma generate

# 4) Run the app against your dev store
shopify app dev --store YOUR-DEV-STORE.myshopify.com
```

If migrate/deploy fails, confirm Docker is running and `DATABASE_URL` is set before retrying.

---

## Current architecture

- Embedded Shopify app (React Router + `@shopify/shopify-app-react-router`)
- Prisma session storage + campaign / settings / analytics models
- Theme app extension (body embed + Liquid-loaded assets)
- App proxy (`/apps/free-gift/*`) for widget-state / evaluate-cart / track-event
- Shopify Function discount extension (`fgpb-discount`)
- Promotion Engine evaluators for FREE_GIFT, TIERED_FREE_GIFTS, percentage / fixed discounts

---

## Phase 1 changes

1. Production env fail-fast (`app/env.server.ts`) — no silent `example.com` fallback in production
2. Expanded `.env.example` (including `DATABASE_URL`)
3. PostgreSQL Prisma baseline (new migration history; SQLite history archived)
4. Mandatory compliance webhooks via `compliance_topics` + `authenticate.webhook`
5. Merchant onboarding: theme embed deep link (extension UUID + block handle) + storefront activity status
6. Bundle-size audit (no storefront refactor)
7. This document

Promotion / Reward Sync / Discount Function behavior was intentionally not changed.

---

## Required environment variables

| Variable | Required in production | Notes |
|----------|------------------------|-------|
| `SHOPIFY_API_KEY` | Yes | Client ID |
| `SHOPIFY_API_SECRET` | Yes | Secret — never commit |
| `SCOPES` | Yes | Align with `shopify.app.toml` |
| `SHOPIFY_APP_URL` | Yes | HTTPS origin; placeholders rejected |
| `DATABASE_URL` | Yes | PostgreSQL URL (not `file:`) |
| `SHOP_CUSTOM_DOMAIN` | No | Optional custom shop domains |
| `NODE_ENV` | `production` on host | Triggers fail-fast checks |

Local development: Shopify CLI continues to manage tunnel URLs when `automatically_update_urls_on_dev = true`.

### `shopify.app.toml` production URLs

Runtime uses env vars (`SHOPIFY_APP_URL`, etc.). Partner Dashboard / deploy still needs public URLs in toml.

**Keep** `example.com` placeholders in the default `shopify.app.toml` for local CLI
(`automatically_update_urls_on_dev = true` overwrites them with the tunnel during `shopify app dev`).

**Before a real production deploy**, change these three values to your hosted HTTPS origin (not secrets):

1. `application_url` — e.g. `https://your-app-host.example`
2. `auth.redirect_urls` — e.g. `https://your-app-host.example/auth/callback` (must match runtime `authPathPrefix: "/auth"`, **not** `/api/auth`)
3. `app_proxy.url` — e.g. `https://your-app-host.example/apps/proxy`

Then validate and deploy:

```bash
npm run validate:production-toml   # fails if example.com / localhost remain in those fields
npm run deploy:production          # validate + shopify app deploy
```

`npm run deploy` (plain) stays available for non-production CLI workflows and does **not** enforce the toml gate.
CI workflow `.github/workflows/release-gates.yml` runs `validate:production-toml` as a mandatory gate — it will fail until real HTTPS production URLs replace placeholders.

---

## PostgreSQL deployment

### What changed

- `prisma/schema.prisma` provider is `postgresql` with `url = env("DATABASE_URL")`.
- Previous SQLite migrations moved to `prisma/migrations_sqlite_archive/` (reference only).
- New baseline: `prisma/migrations/20260730120000_postgres_baseline` generated with `prisma migrate diff --from-empty`.
- `prisma/dev.sqlite` was **not** deleted.
- No `prisma migrate reset`, no database drops, and no production DB was modified during Phase 1.

### Local Postgres

```bash
docker compose -f docker-compose.postgres.yml up -d
# set DATABASE_URL in .env (see .env.example)
npx prisma migrate deploy
npx prisma generate
shopify app dev --store YOUR-DEV-STORE.myshopify.com
```

### Production / Docker release

Migrations are **not** run during `docker build` or container `CMD`. Run them as a separate release step before or beside traffic cutover:

```bash
# Release step (one-shot job or pre-start):
npm run migrate:deploy
# or: docker run --rm -e DATABASE_URL=... <image> npm run migrate:deploy

# App process only:
npm run start
# or: docker run ... <image>   # CMD = npm run start
```

Health probes (no secrets in responses):

- `GET /health/live` — process up (no DB / Shopify)
- `GET /health/ready` — required config + Prisma `SELECT 1` with 2s timeout

### Data migration precautions

- `prisma migrate deploy` creates the Postgres schema. It does **not** copy rows from `dev.sqlite`.
- Existing local SQLite data must be recreated via normal app use, or transferred with a **separately reviewed** data-migration script (not provided in Phase 1).
- Non-local environments: Phase 1 inspection found no evidence of a non-local Postgres already applying the old SQLite migration chain (local `.env` had no production `DATABASE_URL`; only `dev.sqlite` present). If a hosted environment already used SQLite migrations, treat the baseline as a **new** history and plan carefully before first Postgres deploy.

### Backup / rollback

- Before first production migrate: snapshot the empty/new Postgres instance or hosting backup.
- Rollback of schema: restore DB snapshot; revert app release to prior artifact if needed.
- Do not re-apply archived SQLite SQL against Postgres.

---

## GDPR / privacy webhooks

Configured in `shopify.app.toml`:

```toml
[[webhooks.subscriptions]]
uri = "/webhooks/compliance"
compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
```

`shop/redact` deletes shop-scoped rows inside a single Prisma `$transaction` (sessions, campaigns + cascades, settings, analytics, integration status, shop discount). Duplicate deliveries remain safe (`deleteMany` with zero matches).

### Data inventory (verified for Phase 1 claims)

| Store | Buyer identity? | Notes |
|-------|-----------------|-------|
| `Session` | No (merchant/staff) | May store staff `email`, `firstName`, `lastName`, tokens — personal data for staff |
| `Campaign` / tiers / gifts | No | Merchant catalog/config |
| `AppSettings` | No | Merchant preferences |
| `ShopDiscount` | No | Discount GID |
| `AnalyticsEvent` | No buyer profile | Shop + campaign metrics; payload may include cart subtotal / gift product id / order id |
| App proxy | No durable buyer PII | Requests authenticated; widget-state may update `ShopIntegrationStatus` timestamp |

**Claim:** this app does not persist buyer/customer profiles (customer id, customer email, phone, address).
**Still:** merchant/staff session fields are personal data and are deleted on `shop/redact`.

### Lifecycle

1. `app/uninstalled` — delete sessions + shop discount record; **retain** campaigns/settings for reinstall.
2. `shop/redact` (Shopify sends after required post-uninstall delay) — **immediately** shop-scoped wipe of Session, Campaign (cascades tiers/options), AppSettings, AnalyticsEvent, ShopDiscount, ShopIntegrationStatus.
3. `customers/data_request` / `customers/redact` — acknowledge; no buyer records to export/delete.

Idempotency: shop-scoped `deleteMany` (zero rows = success). No compliance receipt table.

---

## Theme onboarding / health check

Deep link format used:

```text
https://{shop}.myshopify.com/admin/themes/current/editor?context=apps&activateAppId={extension_uuid}/{block_handle}
```

- Extension UUID: `bc15044b-b3a9-2e32-3958-16367990e1601cfb4558` (`shopify.extension.toml` `uid`)
- Block handle: `free-gift-embed`
- Does **not** use API key / client_id
- Does **not** hard-code theme IDs

UI: home “Storefront setup” + Widgets “Storefront setup” with Check connection.

### What can / cannot be verified

| Signal | Meaning |
|--------|---------|
| Active campaign count | Campaign configured |
| `ShopIntegrationStatus.lastWidgetStateAt` | Storefront recently called widget-state |
| Embed enabled | **Unable to verify automatically** (no `read_themes`) |

Draft vs live themes are separate — merchants must enable the embed on the theme they preview.

---

## Bundle-size report (Phase 1 measurement)

Measured on disk under `extensions/free-gift-progress-bar/assets/` (raw + gzip):

| Asset | Raw bytes | Gzip bytes | Load path |
|-------|-----------|------------|-----------|
| `free-gift-progress-bar.js` | 18604 | 6220 | Liquid schema `"javascript"` on embed block |
| `free-gift-progress-bar.css` | 16061 | 3535 | Liquid schema `"stylesheet"` |
| `cart-page-progress.js` | 85232 | 20071 | Liquid `asset_url` via embed |
| `tiered-gift-sync.js` | 26999 | 6924 | Liquid `asset_url` |
| `unlock-celebrate.js` | 30984 | 6732 | Liquid `asset_url` |
| `bar-height.js` | 9567 | 3039 | Liquid `asset_url` |
| `product-page-progress.js` | 2090 | 900 | Liquid `asset_url` (product) |
| `cart-recommendations.js` | 326 | 241 | Liquid `asset_url` (cart) |
| `cart-recommendations.css` | 4679 | 1408 | Liquid stylesheet_tag |

**Theme Check (this repository):** `shopify theme check --path extensions/free-gift-progress-bar` reports **`[error] AssetSizeAppBlockJavaScript`** for schema `"javascript": "free-gift-progress-bar.js"` (18604 B > configured 10000 B threshold) on both embed/block liquid files, exit code 1. This is Theme Check’s configured severity in-repo; it is **not** treated as a universal Shopify hard deployment limit. `shopify app config validate --json` returned `valid: true`. Phase 1 did **not** refactor storefront bundles because app config validation and production build succeeded; size reduction remains a Phase 2 concern if App Store / deploy tooling blocks.

No source maps in the assets directory. Main bundle is already esbuild+terser minified.

---

## Known limitations (still)

- Theme/cart-drawer DOM heuristics are not universal
- Accelerated checkout may bypass Ajax gift sync
- No Shopify Billing yet
- No Cart Transform
- No definitive embed detection without Theme scopes
- SQLite local data not auto-migrated to Postgres

---

## Deployment checklist

1. Provision Postgres; set `DATABASE_URL`
2. Set production `SHOPIFY_*` / `SCOPES` / `SHOPIFY_APP_URL`
3. Update `shopify.app.toml` public URLs for the host
4. `npx prisma migrate deploy && npx prisma generate`
5. `npm run build && npm run start` (or Docker)
6. `shopify app deploy` (extensions + webhook subscriptions including compliance)
7. Install / open app → enable theme embed via deep link → create ACTIVE campaign → preview correct theme

## Rollback checklist

1. Restore previous app hosting release
2. Restore Postgres snapshot taken before migrate (if schema changed)
3. Re-deploy prior app version / extensions if needed
4. Do not run destructive Prisma reset against production

---

## Remaining blockers — private beta

- Hosted production URL + Postgres in a real environment
- Deploy compliance webhook subscriptions (`shopify app deploy`)
- Merchant smoke test on target themes after Postgres cutover
- Confirm CLI `shopify app dev` against local Postgres

## Remaining blockers — public App Store

- Billing / pricing (if paid) via Shopify Billing or Managed Pricing
- Broader theme compatibility / support playbook
- Privacy policy + support contacts + listing assets
- App Store review checklist (full)
- Possibly address Theme Check JS size warning for schema javascript
- Stronger observability / runbooks
- Confirm GDPR operational process with legal

Phase 1 alone does **not** make this app App Store ready.
