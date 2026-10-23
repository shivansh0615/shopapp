# Secrets Management

## Categories

| Secret | Source | Notes |
|---|---|---|
| `SHOPIFY_API_SECRET` | Platform secret store | Rotate in Partner Dashboard if exposed |
| `SHOPIFY_API_KEY` | Platform config | Public client id; still not hard-code in images |
| `DATABASE_URL` | Platform secret store | Least-privilege DB user; separate staging/prod |
| `SHOPIFY_APP_URL` | Platform config | Not a secret but environment-specific |
| Future logging/monitoring tokens | Platform secret store | Not used in this phase |

## Rules

- Never bake secrets into Docker images or build args.
- Never commit `.env` (gitignored).
- `.env.example` contains placeholders only.
- Validators must not print secret values.
- Separate staging and production credentials.
- Rotate after suspected exposure; revoke offline sessions if Shopify secret rotates.

## Scan

```bash
npm run scan:secrets
```

Prints file path + pattern name only (no matched values). CI should run this gate.

## Shopify secret rotation implications

1. Update platform secret.
2. Restart web + worker.
3. Merchants may need to re-open/reinstall if sessions invalidate.
4. Re-register webhooks if required by the Shopify app package after secret change.
