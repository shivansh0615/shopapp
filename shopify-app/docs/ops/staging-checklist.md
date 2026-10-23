# Staging Requirements

Staging is **not** local CLI and **not** production.
Newish (or any live merchant store) may be used for controlled validation but is **not** a substitute for staging architecture.

## Staging must have

- Dedicated Shopify app config (or clearly isolated staging app)
- Dedicated Shopify development/test store
- Dedicated PostgreSQL database
- Dedicated secrets (never reuse production tokens)
- Real HTTPS hostname (operator-provided; not guessed)
- Same migration path as production (`prisma migrate deploy`)
- Same worker scheduling pattern (`discount-sync:once`)
- No production merchant data
- Health checks (`/health/live`, `/health/ready`)
- Release-gate CI green before promote

## Staging validation checklist

1. `NODE_ENV=production` env validation with staging values
2. Generate + validate staging TOML from staging `SHOPIFY_APP_URL`
3. `shopify app deploy` with `SHOPIFY_TOML_PATH=...` (staging)
4. Migrate staging DB
5. Web deploy + health
6. Schedule worker
7. Install on staging test store
8. Create/activate campaign → discount sync
9. App Proxy evaluate/widget-state smoke
10. Uninstall/reinstall smoke
11. `discount-sync:inspect` healthy
12. Logs show no secrets

Only then: manual production approval.
