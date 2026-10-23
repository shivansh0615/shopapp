# UpsellTrix

Shopify embedded app for spend-threshold free gifts and cumulative tiered rewards.
Only one campaign may be ACTIVE per shop. Tiered campaigns currently allow up to
five thresholds while billing is off.

## Start here

- [Engineering rules](rules.md): owner requirements and safety invariants.
- [Current handover](HANDOVER.md): current priorities and release boundaries.
- [Campaign policy](docs/campaign-policy-progress.md).
- [Dated testing log](docs/deployment-test-log-2026-10-21.md): includes 22 October entries; read the latest entry and its limitations.
- [Architecture](docs/architecture/README.md) and [theme compatibility](docs/architecture/theme-portability.md).
- [Local development](docs/development/local-dev.md), [storefront builds](docs/development/storefront-build.md), and [tests](docs/development/test-suites.md).
- [Cleanup report](docs/development/cleanup-2026-10-22.md).

## Project layout

- `app/`: React Router admin UI, authenticated routes, services and repositories.
- `shared/`: campaign policy shared with the Discount Function.
- `storefront-extension/src/`: storefront source and tests.
- `extensions/free-gift-progress-bar/`: Shopify Liquid blocks and generated/copied assets.
- `extensions/fgpb-discount/`: checkout Discount Function.
- `prisma/`: PostgreSQL schema and migration history.
- `scripts/`: build, verification, deployment and operator tools.

Use Node **>=22.18** and npm workspaces. See `.env.example` for variable names;
never copy credentials into documentation or Git. This application uses PostgreSQL,
not the original template's SQLite production setup.

## Development and verification

Install locked dependencies with `npm ci`, then generate Prisma with
`npx prisma generate`. Inspect scripts and environment before running migrations,
fixtures, workers or Shopify CLI development commands: these can modify external
configuration or data. Follow the local development guide.

`npm test` runs the five main suites. `npm run typecheck`, `npm run lint` and
`npm run build` check the admin application. After storefront edits, use
`npm run build:storefront` and `npm run check:storefront-assets`.
Automated tests do not prove live theme or checkout compatibility.

## Releases are separate

- Git commit/push saves code; it does not itself publish Shopify extensions.
- `npm run deploy` selects **shopify.app.release.toml** and publishes Shopify
  extensions/configuration after predeploy checks.
- ApiCloud web deployment rebuilds the Node application separately.
- The discount-sync worker is a separate process; a web restart does not prove it runs.

Deploy only with explicit authorization. Inspect the current working tree and
deployed versions rather than assuming a historical log describes today's build.
Do not point the live app at placeholder or temporary development URLs.

## Current verification boundary

Savor cart behavior has reported failures involving gift eligibility, repeated
celebrations and item targeting. Treat code fixes and recorded passes as scoped
evidence; do not advertise universal theme compatibility. Keep the app's gift
safety checks and paid-product protection intact.
