# Repository map

## Top-level

| Path | Responsibility |
|------|----------------|
| `app/` | Shopify admin app (React Router): routes, services, repositories, UI |
| `storefront-extension/` | **Source** for classic widget + optional cart-drawer compat |
| `extensions/free-gift-progress-bar/` | Theme App Extension (Liquid, assets, locales) |
| `extensions/fgpb-discount/` | Shopify Discount Function |
| `prisma/` | Database schema + migrations |
| `docs/` | Architecture, development, merchant, ops, release |
| `scripts/` | Ops CLIs and validation harnesses |
| `public/` | Static public assets for the admin app |
| `shared/` | Portable campaign policy shared by server and Discount Function; no React, Prisma or browser dependencies |
| `.local-preview/` | Local admin UI preview with sample data; excluded from Docker |
| Historical marketing materials | Removed from app on 22 October; recovery details in `docs/development/cleanup-2026-10-22.md` |

## `app/` ownership

| Folder | Purpose | May depend on | Must not depend on |
|--------|---------|---------------|--------------------|
| `routes/` | HTTP entry (`flatRoutes`) | services, lib, shopify.server | storefront-extension, extension assets |
| `services/` | Domain orchestration | repositories, lib, prisma | React UI, storefront |
| `repositories/` | Persistence | prisma, lib/money | UI |
| `lib/` | Shared helpers | types | UI components (prefer) |
| `components/` | Admin Polaris UI | hooks, display lib | cart/discount mutators |
| `hooks/` | Admin hooks (scaffold) | types | repositories |
| `types/` | Admin GraphQL codegen | — | services |
| `utils/` | Pure helpers (scaffold) | — | services |
| `styles/` | Design tokens / CSS | — | backend |

## Storefront source (`storefront-extension/src/`)

| Folder | Purpose |
|--------|---------|
| `core/` | Cart client, gift sync, widget state/render, merge-evaluation |
| `compat/` | Optional third-party drawer contract, adapters, runtime |
| `utils/` | Shared pure helpers (`util.js`, gift-row highlight, tiered planner) |
| `runtime/` | Source for satellite runtime scripts copied into the theme extension by the build |
| `tests/` | Unit + architectural tests |
| `index.js` | **Stable** `build:core` entry |
| `cart-drawer-compat.entry.js` | **Stable** `build:compat` entry |

## Extensions

| Path | Notes |
|------|--------|
| `extensions/.../assets/free-gift-progress-bar.js` | **Generated** from storefront `build:core` |
| `extensions/.../assets/cart-drawer-compat.js` | **Generated** from storefront `build:compat` |
| Satellite JS under `assets/` | Generated/copied from `storefront-extension/src/runtime/`; edit source, then run `npm run build:storefront` |
| `extensions/fgpb-discount/generated/` | Codegen — do not hand-edit |
