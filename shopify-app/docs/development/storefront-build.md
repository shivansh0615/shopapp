# Storefront build

Commands (from repo root):

```bash
npm run build:storefront
```

Or:

```bash
npm run build --workspace free-gift-progress-bar-extension
```

| Script | Entry | Output |
|--------|-------|--------|
| `build:core` | `storefront-extension/src/index.js` | `extensions/.../assets/free-gift-progress-bar.js` |
| `build:compat` | `storefront-extension/src/cart-drawer-compat.entry.js` | `extensions/.../assets/cart-drawer-compat.js` |

Source layout: `core/`, `compat/`, `utils/`, `tests/` — see [repository map](../architecture/repository-map.md).

After rebuild, refresh [`app/lib/storefront-asset-manifest.ts`](../../app/lib/storefront-asset-manifest.ts) byte counts if diagnostics should stay accurate.
