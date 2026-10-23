# Backup and Restore (PostgreSQL)

> **Backups do not exist merely because this document exists.**
> Configuring automated backups is an **external production requirement** on the database platform.

## Requirements (operator)

| Item | Recommendation |
|---|---|
| Automated backups | Daily minimum |
| Retention | ≥ 14 days (30 days preferred for private beta) |
| PITR | Enable if platform supports (RPO minutes) |
| Encryption at rest | Required |
| Access control | Least-privilege; audited |
| Verification | Monthly restore test to a scratch database |
| RTO | Target < 4 hours for private beta |
| RPO | Target ≤ 24 hours (≤ 1 hour with PITR) |

## Before migrations

Always take a fresh backup (or snapshot) before `prisma migrate deploy`.

## Restore procedure

1. Restore into a **separate** database first — never overwrite production blindly.
2. Point a staging app at the restored DB.
3. Run `npx prisma migrate status` — reconcile if restore predates migrations.
4. Expect:
   - Sessions may be stale/expired → merchants re-auth.
   - `DiscountSyncJob` rows may re-run or be stale → cancel open jobs or let reconcile-to-current-state handle.
   - Shopify discount GIDs may diverge from restored `ShopDiscount` → run controlled sync on test shops.
5. Only promote after smoke checks.

## Queue after restore

- Inspect with `discount-sync:once` / `inspect`.
- Prefer reconciliation (`SYNC`) over replaying obsolete `DEACTIVATE` (worker already supersedes).
