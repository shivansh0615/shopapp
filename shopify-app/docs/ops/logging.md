# Logging and Production Error Boundaries

## Principles

- Prefer structured `console` JSON/objects with stable scope keys (`[FGPB …]`).
- Severity via stdout vs stderr; no merchant-facing stacks.
- Shop domain may appear in operational logs in minimal form (`shop` field).
- Correlation: use request IDs when the platform provides them (not implemented as a vendor).

## Never log

- Access tokens, cookies, authorization headers
- Raw webhook bodies / GraphQL variables or response bodies
- Merchant/customer emails
- `DATABASE_URL` / connection strings
- Stack traces in HTTP responses to merchants

## Surfaces

| Surface | Behavior |
|---|---|
| Startup | `assertProductionEnv` throws message without secret values |
| Health | no config dump |
| Auth / webhooks / proxy | existing redaction helpers |
| Discount sync / worker | `logOperationalError` + safe codes |
| Migration | Prisma CLI output — keep DB URLs out of custom wrappers |
| Shutdown | worker stops claims; no secret flush |

## Retention (operator)

- Retain app logs ≥ 14 days for private beta; restrict access; no public buckets.
- External logging vendor is **out of scope** for this phase.
