# Build & generated asset pipelines

## Storefront → theme assets

```
storefront-extension/src/index.js
  (+ core/, utils/)
        │  npm run build:core  (esbuild + terser)
        ▼
extensions/free-gift-progress-bar/assets/free-gift-progress-bar.js

storefront-extension/src/cart-drawer-compat.entry.js
  (+ compat/, contract)
        │  npm run build:compat  (esbuild)
        ▼
extensions/free-gift-progress-bar/assets/cart-drawer-compat.js
```

**Never edit the two generated JS files by hand.** Change source under `storefront-extension/src/`, then rebuild.

Workspace command: `npm run build:storefront` (root) or `npm run build` inside `storefront-extension/`.

## Runtime scripts and generated metadata

Author runtime scripts under `storefront-extension/src/runtime/`. The storefront build copies these existing IIFEs byte-for-byte into extension assets, preserving cart behavior, then generates `app/lib/storefront-asset-manifest.ts` from actual final bytes and a content hash. Do not edit generated runtime copies.

- `cart-page-progress.js` — Dawn/OS2 drawer + cart chrome (owns tiered gift row UI)
- `tiered-gift-sync.js` — production IIFE Reward Sync runner (mirrors pure planner in `src/utils/tiered-gift-sync.js`)
- `fgpb-runtime.js`, `bar-height.js`, `unlock-celebrate.js`

`product-page-progress.js` and `cart-recommendations.js` were no-op scripts and are no longer loaded. Actual product app blocks and the cart renderer remain.

CSS remains authored in extension assets (`cart-recommendations.css`, `free-gift-progress-bar.css`).

`npm run check:storefront-assets` rejects stale runtime copies, stale metadata and a core asset above 10,000 bytes. CI and production/staging deploy wrappers explicitly build and check storefront output. The moved runtime IIFEs retain their prior scoping and unused helper behavior; three legacy lint rules are scoped off for this folder during the mechanical move. Modular sources retain the normal rules.

Liquid references asset **filenames**; renaming requires coordinated Liquid/schema updates.

## Discount function

```
extensions/fgpb-discount/src/*.ts
  + schema / GraphQL input
        │  Shopify function build + graphql-codegen
        ▼
extensions/fgpb-discount/dist/function.wasm
extensions/fgpb-discount/generated/api.ts   ← do not hand-edit
```

## Admin app

```
app/ + prisma/
        │  react-router build / shopify app deploy
        ▼
build/   (generated; not source of truth)
```

## UpsellTrix release (2026-10-15)

Use Node 22.18 or newer. `npm run deploy` builds and checks storefront assets, validates the app identity and production URLs, and explicitly deploys `shopify.app.release.toml`. This tracked file targets UpsellTrix, not the legacy local-development app. It disables automatic tunnel URL replacement. The app server must be deployed separately.

Both GitLab and GitHub install development dependencies explicitly for build/test jobs. GitLab and Docker now build and verify storefront assets before application packaging. Docker-in-Docker requires privileged mode in the GitLab runner configuration; it is not a job YAML keyword. This runner configuration must be verified by the runner administrator.

A successful local build does not verify Shopify theme-editor preview loading or a released extension. Test the new extension on the named development store after release, with an active campaign.
