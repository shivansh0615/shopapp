# Integer-money migration runbook

## Currency semantics

- Campaign money is **shop currency only** (no multi-currency campaigns).
- Historical discount metafield builder defaulted to **INR** when shop currency was unavailable; new `Campaign.currencyCode` / `AppSettings.currencyCode` default to `INR`.
- Discount Sync continues to fetch shop `currencyCode` for metafield payloads and overrides threshold currency codes at emit time.
- Unknown currency codes fail closed (`UnsupportedCurrencyError`). Special cases `CLF` / `UYW` rejected.

## Canonical representation

- `amountMinor: bigint` + `currencyCode` + `minorUnit`
- Prisma: `BigInt?` columns (`thresholdMinor`, `fixedDiscountAmountMinor`, `defaultThresholdMinor`)
- Never serialize raw `bigint` through Remix loaders — convert via `formatMoneyDecimal` / `moneyToMajorNumber` at boundaries

## Rounding policy

| Case | Mode |
|---|---|
| Merchant decimal strings | Exact parse; reject excess precision |
| Legacy Float → minor | Decimal-string expansion + **HALF_UP** to currency exponent (not `Math.round(f*100)`) |
| Percentage estimates (app-side) | **HALF_UP** on minor units |
| Shopify Function percentage discounts | Applied by Shopify’s engine — **not reimplemented**; unresolved exact Shopify midpoint parity documented as Medium risk |

Negative zero is normalized to `0`. Values below one minor unit are rejected on strict parse (or rounded only through the legacy Float policy).

## Expand → backfill → dual-write → cutover → contract

1. **Expand** — migration `20260731090000_integer_money_expand` (Float columns retained).
2. **Deploy expand-compatible code** (dual-write + prefer-minor reads).
3. **Dry-run backfill** — `npm run money:backfill:dry-run`
4. **Execute backfill** — `npm run money:backfill`
5. **Verify** — `npm run money:verify`
6. **Monitor**; application rollback remains possible while Float columns exist.
7. **Contract** (later phase) — drop Float columns only after confidence.

## Commands

```bash
npx prisma migrate deploy
npm run money:backfill:dry-run
npm run money:backfill
npm run money:verify
npm run test:money
npm run typecheck
npm run lint
npm run test:backend
npm run test:promotion
npm run test:discount-function
npm run test:storefront
npm run build
```

## Rollback

- Roll back application code while dual columns exist.
- Do **not** drop minor columns or reverse migration destructively.
- Re-run backfill after fixing invalid rows (idempotent).

## Ambiguous legacy Float values

Binary floats already stored may not equal the merchant’s intended decimal. Conversion uses a deterministic HALF_UP digit-string policy; verification compares converted minor units to that policy, not an unknowable original intent.
