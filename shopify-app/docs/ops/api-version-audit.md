# Shopify API Version Audit

**Status:** Aligned (Admin / webhooks / codegen) — 2026-07-31.

## Selected Admin target

**`2025-10`** (`ApiVersion.October25`)

Reasons:

- Declared and used by runtime `app/shopify.server.ts` already.
- Present in installed `@shopify/shopify-api@13.1.0` (`ApiVersion` enum).
- Compatible with existing Admin GraphQL operations (products, publications, discounts, metafields, shop currency).
- Not an unreleased/RC version. Installed SDK latest named version is `2026-07`; **`2026-10` is not in the SDK enum**.

## Declarations

| Location | Version | Component | Decision |
|---|---|---|---|
| `shopify.app.toml` `[webhooks] api_version` | **2025-10** | Webhook registration | Aligned to Admin |
| `shopify.app.production.toml` / `shopify.app.staging.toml` | **2025-10** | Generated deploy TOMLs | Aligned |
| `app/shopify.server.ts` | **2025-10** | Admin GraphQL / OAuth client | Keep (target) |
| `.graphqlrc.ts` | **2025-10** | Admin GraphQL codegen | Keep (target) |
| `extensions/fgpb-discount/shopify.extension.toml` | **2026-01** | Discount Function schema | **Intentional difference** |
| `extensions/fgpb-discount/schema.graphql` | **2026-01** | Function input schema | Tracks Function TOML |
| `_enable_embed_admin.mjs` | **2025-10** | Ad-hoc Admin helper | Aligned |

## Intentional Function difference

Shopify Functions use a **separate** `api_version` in `shopify.extension.toml` that selects the Function GraphQL schema. Changing it requires `shopify app function schema` + `typegen` and is not an Admin API bump.

Current Function API **`2026-01`** is kept because:

- It matches the checked-in `schema.graphql` / generated types.
- Shopify documents Function versions independently of Admin API.
- Upgrading Function version without schema regen would break the extension build.

## Rejected alternatives

| Version | Why not |
|---|---|
| `2026-10` | Not in `@shopify/shopify-api` `ApiVersion` enum; treated as unsupported for this package set |
| `2026-01` Admin upgrade | Valid in SDK, but larger Admin surface change than needed to fix invalid webhook TOML |
| `2026-07` | Newer Admin pin with no tested GraphQL regression in this repo |

## Gate

```bash
npm run check:api-version-skew
```

Fails if Admin/webhook/codegen disagree, or if webhook version is outside the known SDK set. Function ≠ Admin is reported as intentional and does not fail the gate.
