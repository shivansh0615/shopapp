# Local development

## Prerequisites

- Node.js >=22.18 + npm (workspace root)
- Shopify CLI
- Partner app + development store

## Day-to-day

```bash
cd shopify-app
npm ci
npx prisma generate
```

Preview uses App Ext. Host / theme embed. Optional third-party cart compat is **off** by default in the theme editor.

Before starting Shopify CLI development, inspect the selected app configuration
and URL-update behavior. Use a deliberate development setup; do not rewrite the
live app's proxy/OAuth URLs to placeholders or temporary tunnels. The normal
release command selects `shopify.app.release.toml`; it is not a local preview.

## Storefront source rebuild

After changing `storefront-extension/src/`:

```bash
npm run build:storefront
```

This rebuilds bundled assets and copies owned runtime sources:

- `extensions/.../assets/free-gift-progress-bar.js`
- `extensions/.../assets/cart-drawer-compat.js`

Edit satellite scripts such as `cart-page-progress.js` in
`storefront-extension/src/runtime/`, not independently in extension assets.
Run `npm run check:storefront-assets` afterward. See the storefront build guide
for the complete ownership map.

## Useful docs

- [Repository map](../architecture/repository-map.md)
- [Dependency rules](../architecture/dependency-rules.md)
- [Build pipelines](../architecture/build-pipelines.md)
- [Test suites and conventions](./test-suites.md)
- [Cart drawer adapters](../architecture/cart-drawer-adapters.md)
