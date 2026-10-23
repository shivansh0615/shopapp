# Production / Staging Smoke Test Plan

Run only against **dedicated test shops**. Do not run against real merchants during implementation.

| # | Check | Pass criteria |
|---|---|---|
| 1 | `GET /health/live` | 200, no secrets |
| 2 | `GET /health/ready` | 200 when DB up; not-ready when DB down |
| 3 | OAuth install | Completes; session row for shop |
| 4 | Embedded app load | Admin iframe loads app home |
| 5 | Session persistence | Restart web; session still valid or clean re-auth |
| 6 | Compliance webhooks | Topics registered (Partner/CLI) |
| 7 | App Proxy | widget-state / evaluate-cart JSON for test shop |
| 8 | Campaign read | List loads for authenticated shop |
| 9 | Campaign create/update | DB write succeeds on test shop |
| 10 | Discount sync | `ShopDiscount` updates; or `retry_scheduled` + job row |
| 11 | Worker | `discount-sync:once` processes due job |
| 12 | Dedupe | Second failure does not create unlimited jobs |
| 13 | Uninstall | Local cleanup; open jobs cancelled |
| 14 | Reinstall | App works again |
| 15 | Tenant isolation | Shop A cannot see Shop B campaigns |
| 16 | Logs | No tokens/cookies/DB URLs/emails |

Record results in the release ticket. Fail closed on any secret leakage or cross-tenant read.
