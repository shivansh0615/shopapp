# Staging environment (no Docker required)

This project validates PostgreSQL via a **reachable `DATABASE_URL`**. Docker Compose is optional and **not required**.

## What you must provide (operator)

| Input | Purpose |
|---|---|
| Staging PostgreSQL URL | `DATABASE_URL=postgresql://…` (Neon, RDS, Supabase, managed PG, etc.) |
| Staging HTTPS app hostname | `STAGING_SHOPIFY_APP_URL=https://…` |
| Staging Shopify API key/secret | Partner staging app |
| Dedicated development/test store | Isolated from production merchants |
| Process host + scheduler | Web + `discount-sync:once` every 1–2 minutes |

Do **not** reuse production credentials or databases.

## Minimum local validation path (remote Postgres)

```bash
# 1) Point at staging/ephemeral Postgres (never print the URL in tickets)
set DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB?schema=public

npm run db:check
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status

npm run staging:fixtures:seed
npm run money:backfill:dry-run
npm run money:backfill
npm run money:verify

# optional negative verification
npm run staging:fixtures:seed -- --with-invalid
npm run money:verify   # expect non-zero
npm run staging:fixtures:cleanup -- --confirm
```

## Staging Shopify config (no deploy until authorized)

```bash
set STAGING_SHOPIFY_APP_URL=https://your-staging-host.example
npm run config:staging:generate
npm run config:staging:validate
# Only when explicitly authorized:
# npm run deploy:staging -- --i-authorize-staging-shopify-deploy
```

## API version skew

```bash
npm run check:api-version-skew
# Temporary documented override only:
# set ALLOW_SHOPIFY_API_VERSION_SKEW=1
```

## CI

GitHub Actions `release-gates.yml` uses an **ephemeral Postgres service** (no local Docker on your machine). Push/PR runs migrate + gates there.
