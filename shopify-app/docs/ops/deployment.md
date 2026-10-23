# Production Deployment Configuration

Provider-neutral operational contract for Free Gift Progress Bar.

> **No production hostname is guessed in this repository. Do not insert guessed values.**
> **The production environment must schedule the discount-sync worker.** Creating the worker code alone does not execute retries.

## Process model

| Process | Command | Responsibility |
|---|---|---|
| Web | `npm run start` | Admin, App Proxy, webhooks, `/health/*`. Does **not** poll the queue. |
| Migration | `npm run migrate:deploy` | `prisma migrate deploy` once before new replicas serve traffic. Not during image build. |
| Worker (recommended) | `npm run discount-sync:once` | Bounded batch; schedule every 1–2 minutes. |
| Worker (alternate) | `npm run discount-sync:watch` | Dedicated long-running poller. |
| Inspect | `npm run discount-sync:inspect [shop]` | Read-only queue summary. |

Web and worker must run as **independent** processes on the same code version and secrets. Do not embed the worker in every web replica.

`PORT` is respected (`ENV PORT` / platform injects). Default `3000`. PostgreSQL is the only persistent application datastore. Sessions use Prisma session storage (survive restarts). No required local disk state beyond the container filesystem for the built app.

Startup does **not** run destructive migrations. `CMD` starts the web server only.

## Environment

See [environment-contract.md](./environment-contract.md). Validate:

```bash
NODE_ENV=production npm run validate:env
```

## Shopify TOML strategy

1. Keep `shopify.app.toml` with `example.com` placeholders for local CLI (`automatically_update_urls_on_dev`).
2. Generate a deploy TOML from an explicit `SHOPIFY_APP_URL` (never invent a host):

```bash
SHOPIFY_APP_URL=https://YOUR_REAL_HOST \
  npm run generate:production-toml
# default template is shopify.app.upselltrix.toml
# writes shopify.app.production.toml by default (does not overwrite shopify.app.toml)
```

3. Validate (also checks TOML ↔ `SHOPIFY_APP_URL` alignment when set):

```bash
SHOPIFY_APP_URL=https://YOUR_REAL_HOST \
SHOPIFY_TOML_PATH=shopify.app.production.toml \
  npm run validate:production-toml
```

4. Deploy app config/extensions only after validation:

```bash
SHOPIFY_TOML_PATH=shopify.app.production.toml npm run deploy:production
```

`deploy:production` fails when validation fails.

## Deployment order

1. Backup PostgreSQL (external requirement — see [backup-restore.md](./backup-restore.md)).
2. Review pending migrations (`npx prisma migrate status`).
3. Optionally disable worker: `DISCOUNT_SYNC_WORKER_DISABLED=true`.
4. Run `npm run migrate:deploy`.
5. Deploy web replicas (`npm run start` / platform equivalent).
6. Verify `/health/live` and `/health/ready`.
7. Enable/schedule `discount-sync:once` (release-blocking).
8. `npm run discount-sync:inspect` — confirm queue healthy.
9. Staging/production smoke tests ([smoke-tests.md](./smoke-tests.md)).

## Rollback

- Prefer rolling back **application code** when the schema remains backward-compatible.
- Schema rollback uses a **forward corrective migration** — never `prisma migrate reset` in production.
- Re-disable worker during incident response if sync divergence is suspected.

## Release-blocking checklist

- [ ] Real HTTPS `SHOPIFY_APP_URL` provided by operator (not guessed)
- [ ] Production/staging TOML generated and validated
- [ ] Secrets in platform secret store (not images)
- [ ] PostgreSQL provisioned + backups configured
- [ ] `prisma migrate deploy` succeeded
- [ ] Web health live+ready
- [ ] **Discount-sync worker scheduled**
- [ ] Staging smoke passed before production approval

See also: [deployment-engineer-handoff.md](./deployment-engineer-handoff.md), [release-pipeline.md](./release-pipeline.md), [worker-scheduling.md](./worker-scheduling.md), [incident-runbook.md](./incident-runbook.md).
