# Dependency rules

Strict boundaries. Violations should fail review / architecture tests.

## Layers

```
Admin UI (components/hooks)
    ↓
Routes
    ↓
Services
    ↓
Repositories → Prisma

Storefront core → Storefront utils
Storefront compat → Storefront utils
(Discount Function and server may share portable policy under shared/)
```

## Forbidden

1. **Core storefront** (`src/core/`, `src/index.js`) must never import `src/compat/` or adapter ids meant only for optional compat.
2. **Compat** must never import Reward Sync / gift planner modules (`core/gift-sync.js`, production mutation paths) or the discount function package.
3. **Admin UI** must never import `storefront-extension/` or theme extension asset files as libraries.
4. **Discount function** must never import admin UI or storefront-extension.
5. **Unit tests** import source modules. Dedicated runtime integration tests may
   execute built IIFEs in an isolated VM to verify the shipped bundle; application
   code must not import minified assets as libraries.
6. **Generated assets** must never import TypeScript app source (they are build outputs only).

## Allowed

- Routes → services / lib / `shopify.server`
- Services → repositories / lib / prisma
- Compat → `compat-contract`, adapters, browser DOM APIs, `/cart.js` reads for highlight only
- Storefront tests → core / compat / utils
- Server / Discount Function → `shared/` pure policy (no database, UI or browser dependencies)

## Known debt (document only — do not “fix” in org passes)

- `proxy-evaluation.server` ↔ `widget.server` (+ `route-adapters`) cycle
- Some `lib/*` modules import `services/*` (layer inversion)
- Repositories import some schedule helpers from services

Track these under architecture deviations; resolve in dedicated refactors.
