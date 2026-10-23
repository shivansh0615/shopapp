# Deployment Engineer Handoff Sequence

Authoritative release sequence for staging/production. Commands are real `package.json` scripts.

## Current UpsellTrix release entry point — 22 October 2026

`npm run deploy` explicitly selects `shopify.app.release.toml` and runs predeploy
checks. This publishes Shopify extensions/configuration, not the ApiCloud Node
host or worker. The generated production/staging workflow below is an alternative
operator workflow; it is not the default config selected by `npm run deploy`.
Inspect configuration before using it and never deploy placeholder URLs.
Commit, push, deployment and publication require explicit owner authorization.

> **Do not guess hostnames.** Operator must supply real HTTPS `SHOPIFY_APP_URL` and Postgres.
> **Do not run `staging:fixtures:*` against production merchant databases.**
> **Migrations are an explicit release step** — web containers do not migrate on boot.

## External inputs required before start

| Input | Used by |
|---|---|
| HTTPS production origin | `SHOPIFY_APP_URL`, TOML generate/deploy |
| PostgreSQL URL (dedicated) | `DATABASE_URL` — web, worker, migrate |
| Shopify API key/secret | Partner app credentials |
| Scopes | Must match TOML `access_scopes` |
| Secrets store | Platform env injection (never bake into image) |
| Scheduler | `discount-sync:once` every 1–2 minutes (release-blocking) |
| Privileged GitLab runner tag `docker` | Optional local/CI Docker image build |

## UpsellTrix vs legacy template

| Template | When |
|---|---|
| `shopify.app.upselltrix.toml` | **Preferred** for UpsellTrix Partner app (`client_id` b335…) |
| `shopify.app.toml` | Legacy Free Gift Progress Bar template |

Generate production TOML from the correct template:

```bash
export SHOPIFY_APP_URL=https://YOUR_REAL_HOST
export SHOPIFY_TOML_TEMPLATE=shopify.app.upselltrix.toml
export SHOPIFY_TOML_OUT=shopify.app.production.toml
npm run generate:production-toml
SHOPIFY_TOML_PATH=shopify.app.production.toml npm run validate:production-toml
```

## Preflight (no production mutation beyond read checks)

```bash
NODE_ENV=production \
SHOPIFY_API_KEY=... SHOPIFY_API_SECRET=... \
SHOPIFY_APP_URL=https://YOUR_REAL_HOST \
SCOPES=... DATABASE_URL=postgresql://... \
  npm run validate:env

npm run check:deployment-readiness
npm run scan:secrets
npm run db:check                    # requires reachable DATABASE_URL
npx prisma migrate status           # read-only status
npm run money:backfill:dry-run      # report only — safe
npm run money:verify                # report only — safe
```

## Release sequence

1. Provision host + TLS certificate.
2. Provision **dedicated** production Postgres (+ backups). Never reuse staging DB.
3. Configure secrets in the platform secret store (not image layers).
4. `npm run validate:env` with production values.
5. Build image: `npm run build:docker` (or platform build using `Dockerfile`).
6. Deploy image with traffic held if platform supports canaries.
7. One-shot migrate (not on every web boot):
   ```bash
   docker run --rm -e DATABASE_URL=... <image> npm run migrate:deploy
   # or: npm run migrate:deploy
   npx prisma migrate status
   ```
8. Money preflight on production DB (dry-run / verify only unless expand backfill is required):
   ```bash
   npm run money:backfill:dry-run
   npm run money:verify
   # Execute backfill only when dry-run shows work and change window is approved:
   # npm run money:backfill
   ```
9. Start web (`npm run start` / platform). Confirm:
   - `GET /health/live` → `200` `{ "status": "ok" }`
   - `GET /health/ready` → `200` `{ "status": "ready" }`
10. Schedule worker (release-blocking):
    ```bash
    # every 1–2 minutes
    npm run discount-sync:once
    ```
    Alternate: long-running `npm run discount-sync:watch`.
11. `npm run discount-sync:inspect` — queue healthy / empty OK.
12. Generate + validate production Shopify TOML (UpsellTrix template).
13. `SHOPIFY_TOML_PATH=shopify.app.production.toml npm run deploy:production`  
    (**Operator action** — this script invokes Shopify CLI deploy; not run by CI.)
14. Install on a controlled production test store.
15. Smoke: OAuth, compliance webhook registration, app proxy `/apps/free-gift/*`, campaign activate, discount-sync, checkout.
16. Enable monitoring / alerts on `/health/ready` and worker inspect.

## Staging separation

Staging must use **separate**: hostname, Postgres, Shopify app credentials, TOML, env vars.  
Never point staging at production `DATABASE_URL`.  
Never use tunnel/example.com URLs in production TOML (`validate:production-toml` rejects them).

## Rollback

| Layer | Action |
|---|---|
| Web | Redeploy previous image/release; do not `prisma migrate reset` |
| Shopify config | Redeploy previous app config/extension version via Partner/CLI |
| DB | **Forward-fix** migration (corrective migration) unless platform PITR restore is approved |
| Worker | `DISCOUNT_SYNC_WORKER_DISABLED=true` then inspect; clear flag to resume |
| Storefront | Merchant disables theme app embed; keep optional third-party cart compat OFF |

## Emergency worker commands

```bash
DISCOUNT_SYNC_WORKER_DISABLED=true npm run discount-sync:once   # no-op claim
npm run discount-sync:inspect
npm run discount-sync:inspect example.myshopify.com
```

See also: [deployment.md](./deployment.md), [worker-scheduling.md](./worker-scheduling.md), [incident-runbook.md](./incident-runbook.md), [staging-checklist.md](./staging-checklist.md).
