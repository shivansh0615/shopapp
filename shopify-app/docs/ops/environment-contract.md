# Environment Configuration Contract

Authoritative source: `app/env.server.ts` + `app/lib/discount-sync-config.server.ts`.
Do not duplicate validation elsewhere.

## Required — web (production)

| Variable | Rules |
|---|---|
| `NODE_ENV` | Must be `production` for fail-fast validation |
| `PORT` | Optional; default `3000`; if set must be integer 1–65535 |
| `DATABASE_URL` | Required; `postgres://` or `postgresql://`; not `file:` |
| `SHOPIFY_API_KEY` | Required; non-empty |
| `SHOPIFY_API_SECRET` | Required; non-empty; never logged |
| `SHOPIFY_APP_URL` | Required; HTTPS; no localhost/loopback; no `example.com` / `*.example.com`; hosts containing the substring `example` (e.g. `myexample.com`) remain valid; trailing slash normalized |
| `SCOPES` | Required; non-empty; align with TOML access scopes |

Empty strings are rejected (`isBlank`).

## Required — worker

Worker needs the **same** Shopify + database variables as web (uses `unauthenticated.admin` + Prisma).

| Variable | Default | Bounds |
|---|---|---|
| `DISCOUNT_SYNC_BATCH` | `10` | 1–50 |
| `DISCOUNT_SYNC_BASE_DELAY_MS` | `1000` | 100–60000 |
| `DISCOUNT_SYNC_MAX_DELAY_MS` | `1800000` | 1000–3600000 |
| `DISCOUNT_SYNC_MAX_ATTEMPTS` | `8` | 1–20 |
| `DISCOUNT_SYNC_LEASE_MS` | `60000` | 5000–900000 |
| `DISCOUNT_SYNC_POLL_MS` | `5000` | 1000–300000 |
| `DISCOUNT_SYNC_SHUTDOWN_GRACE_MS` | `25000` | 1000–300000 |
| `DISCOUNT_SYNC_LOCK_TIMEOUT_MS` | `30000` | 1000–120000 |
| `DISCOUNT_SYNC_WORKER_DISABLED` | unset | `true` / `1` disables claiming |

Invalid numeric env values fall back to safe defaults via `loadDiscountSyncConfig`. Production boot still loads/bounds worker config through `assertProductionEnv`.

## Optional

| Variable | Notes |
|---|---|
| `SHOP_CUSTOM_DOMAIN` | Rare custom shop domain allow-list |
| `SHOPIFY_TOML_PATH` | TOML file for validation/deploy |
| `SHOPIFY_TOML_OUT` | Output path for generated production TOML |

## Validation commands

```bash
# Local / non-production: no-op success
npm run validate:env

# Production-like:
NODE_ENV=production \
SHOPIFY_API_KEY=... SHOPIFY_API_SECRET=... \
SHOPIFY_APP_URL=https://valid-non-placeholder.example-real.tld \
SCOPES=... DATABASE_URL=postgresql://... \
  npm run validate:env
```

Secret values are never printed by validators.
