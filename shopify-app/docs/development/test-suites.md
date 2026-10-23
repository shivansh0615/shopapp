# Test suite ownership

`npm test` runs backend, compliance, promotion, Discount Function and storefront
tests. The first three use `scripts/test-app.mjs`, which recursively discovers
`*.test.ts`, `*.test.tsx`, `*.test.js` and `*.test.mjs` under `app/`.

Each discovered app test belongs to exactly one suite:

- Tests inside `app/services/promotion-engine/` belong to promotion.
- Webhook authentication and compliance webhook tests belong to compliance
  (explicit filenames in the runner).
- All remaining app tests belong to backend.

This preserves the previous suite membership. New app tests no longer need a package.json entry.
The runner forwards Node's exit status, fails on an empty suite, and invokes Node
without shell expansion so paths work on Windows as well as Linux.

Inspect membership without running tests:

```shell
node scripts/test-app.mjs backend --list
node scripts/test-app.mjs compliance --list
node scripts/test-app.mjs promotion --list
```

`test:money` and `test:discount-sync` intentionally remain focused subsets.
Config and storefront integration harness tests remain in their existing commands.
Local tests do not establish that a deployed store or checkout works.

## Commands and conventions

- `npm run test:backend`, `test:compliance`, `test:promotion`: app suites above.
- `npm run test:discount-function`: Shopify Function workspace.
- `npm run test:storefront`: storefront tests under `storefront-extension/src/tests/`.
- `npm run check:release`: broader release gate; inspect its environment and
  generation/build steps before running. It is not a read-only command.

Co-locate app tests with modules. Test pure source utilities directly and use
executable runtime tests against shipped assets where integration behavior matters.
Do not replace behavioral coverage with function-name assertions or weaken
checks to disguise blocked live validation. Record browser checks separately.

This guide incorporates the former `testing-structure.md` content.
