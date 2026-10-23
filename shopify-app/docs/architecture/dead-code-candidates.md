# Dead code & naming debt candidates

**Policy:** do not delete automatically unless unused with zero imports and no docs/Liquid references. This file is a report from the organization pass.

## Empty scaffolds removed on 22 October 2026

- Removed the unused `.gitkeep` placeholders from `app/hooks/` and `app/utils/`.
  No source files or imports were removed.

## Misleading / stale test filenames (safe rename later)

| File | Actually tests |
|------|----------------|
| `app/services/compliance-webhooks.server.test.ts` | `webhooks.server.ts` compliance paths |
| `app/services/uninstall-deactivation.server.test.ts` | uninstall paths in `webhooks.server.ts` |
| `app/lib/analytics-lock.tenant.test.ts` | `shop-lock` + analytics repository behavior |

App tests are now discovered by `scripts/test-app.mjs`. Renaming a compliance
test also requires updating its explicit suite assignment there.

## Layer / type debt (do not “merge” in org-only PRs)

- Duplicate `WidgetSettings` shapes (`lib/widget-settings.ts` vs promotion-engine facade)
- Parallel reward type constants (`REWARD_TYPES` vs `REGISTRY_TYPES`)
- Multiple cart line snapshot types (`CartLineSnapshot`, `ProxyCartLineSnapshot`, `CanonicalCartLine`)
- Circular imports: `proxy-evaluation.server` ↔ `widget.server` (+ `route-adapters`)

## Generated / temp (not source of truth)

- `build/`, `.react-router/`, `.shopify/`, `node_modules/`
- `_theme_test/`, `validation-output/`, `_store_cookies.txt` (gitignored)
- `extensions/fgpb-discount/generated/api.ts` — codegen only
- Built theme JS: `free-gift-progress-bar.js`, `cart-drawer-compat.js`

## Cleanup on 20 October 2026

- Removed `SecondaryButton.tsx` and `ThemeEmbedSetupCard.tsx` after checking the
  TypeScript import graph and repository references. Neither component had a
  runtime caller. Updated the stale install guide reference to the latter.
- Removed six `.gitkeep` files in folders that already contain tracked source.
  Empty hooks/utils scaffolds remain.
- Archived 43 non-application marketing files under `docs/archive/marketing/`.
- Kept the promotion-engine barrel: it documents the module's public API.
- Kept generated Shopify assets, migrations, operations scripts and local preview.
  A generated or infrequently invoked file is not necessarily unused.

## Cleanup on 22 October 2026

Historical marketing files were removed from the app repository after an external
checksum-verified backup. See [cleanup report](../development/cleanup-2026-10-22.md).
The earlier archive location and empty-scaffold decisions above are historical.
No additional runtime module has been proven unused by this documentation pass.
