# Database Migration Strategy

## Active migrations (PostgreSQL)

Forward-only under `prisma/migrations/`:

1. `20260730120000_postgres_baseline`
2. `20260730160000_session_shop_index`
3. `20260730170000_discount_sync_jobs`
4. `20260730180000_discount_sync_lease_index`

SQLite archives must not execute. Never edit applied migration files.

## Commands

```bash
npx prisma migrate status
npm run migrate:deploy   # prisma migrate deploy
```

## Before deployment

1. Take a PostgreSQL backup (external — see backup-restore.md).
2. Review `migrate status` against staging/production.
3. Confirm app version is compatible with pending schema (expand/contract).
4. Optional: restore backup to a scratch DB and run `migrate deploy` as a dry-run.

## During deployment

1. Optionally set `DISCOUNT_SYNC_WORKER_DISABLED=true`.
2. Run **one** migration job: `npm run migrate:deploy` (not in image build; not on every web replica concurrently without coordination — prefer a single release job).
3. Verify status clean.
4. Start/roll web replicas.
5. Re-enable / schedule worker.
6. Check `/health/ready` and `discount-sync:inspect`.

## Rollback

- Prisma does **not** auto-reverse migrations.
- Roll back app code only if schema remains backward-compatible.
- Otherwise ship a **forward corrective** migration.
- Never `prisma migrate reset` / destructive drop in production.

## Partial failure

If migrate fails mid-release: leave worker disabled, keep previous web revision if health fails, restore from backup only after operator approval, then reconcile `_prisma_migrations` carefully.
