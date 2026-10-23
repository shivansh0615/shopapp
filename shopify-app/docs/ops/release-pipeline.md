# Release Pipeline

Provider-neutral stages (no host-specific deploy actions until a platform is selected).

1. **Pull-request validation** — CI release-gates
2. **Main-branch validation** — CI release-gates
3. **Staging deploy** — migrate → web → schedule worker
4. **Staging smoke test** — [smoke-tests.md](./smoke-tests.md)
5. **Manual production approval**
6. **Production migration** — backup → `migrate:deploy`
7. **Production deploy** — web replicas
8. **Worker scheduling verification** — release-blocking
9. **Post-deploy smoke test**
10. **Rollback decision window** — monitor health, queue, Shopify errors

## CI must block on

- `validate:env` (with CI dummy production values)
- production TOML validator tests / generation tests
- Prisma format/validate/generate/migrate deploy (CI DB)
- typecheck, lint
- `test:backend`, `test:compliance`, `test:promotion`, `test:discount-sync`
- `test:discount-function`, `test:storefront`
- production build
- Docker build in CI when the runner supports Docker
- `scan:secrets`
- `check:deployment-readiness`

Local Docker Desktop failure remains environment-related / NOT RUN.

## Package helpers

```bash
npm run check:release
npm run check:deployment-readiness
npm run scan:secrets
```
