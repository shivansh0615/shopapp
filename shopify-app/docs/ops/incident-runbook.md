# Incident and Rollback Runbook

| Incident | Detection | Containment | Diagnostics | Recovery | Data risk | Merchant comms |
|---|---|---|---|---|---|---|
| DB unavailable | `/health/ready` not_ready; errors | Scale down writes; disable worker | Platform DB status; `migrate status` | Restore service; do not reset DB | High if prolonged | If checkout/gifts broken >15m |
| Shopify API outage | 5xx/429 in logs; sync pending | Rely on durable retries; avoid thundering herd | `discount-sync:inspect` | Wait + worker drain | Medium divergence | If discounts wrong >30m |
| Worker backlog | inspect `due` rising | Add schedule frequency or watch process; check disable flag | inspect counts | Clear disable; fix permanent failures | Medium | Rare |
| Failed jobs rising | inspect `permanentlyFailed` | Disable worker if destructive; freeze campaign edits | error codes only | Fix config/scopes; reopen jobs | High if wrong discounts | If money-affecting |
| Ready failing | probe | Stop deploy; keep prior revision | ready JSON (no secrets) | Fix config/DB | — | — |
| Bad migration | migrate exit ≠0 | Stop roll; keep old app | migrate status | Forward fix or restore | Critical | Immediate if outage |
| OAuth callback fail | install errors | Check TOML redirect ↔ `SHOPIFY_APP_URL` | validate production toml | Regenerate TOML; redeploy config | Low | Install blocked |
| App Proxy fail | storefront widget down | Check proxy URL path `/apps/proxy` | proxy logs (redacted) | Fix TOML/proxy routes | Medium | Widget down |
| Webhook auth fail | uninstall/compliance miss | Verify secret; HMAC | webhook logs without payloads | Rotate/fix secret carefully | Compliance risk | Partner/compliance |
| Discount divergence | merchant report / inspect | Disable worker; pause campaign edits | compare DB plan vs Shopify | Forced SYNC after fix | High | Case-by-case |
| Secret exposure | scan/alert | Rotate immediately; revoke sessions | scan:secrets (no values) | Replace platform secrets | Critical | If customer data risk |
| Uninstall cleanup fail | terminal DEACTIVATE job | Manual Partner discount review | inspect terminal jobs | Best-effort; cannot retry without creds | Medium orphan discount | If discount lingers |

Safe diagnostic commands (no secrets printed):

```bash
npm run discount-sync:inspect
curl -sS "$SHOPIFY_APP_URL/health/live"
curl -sS "$SHOPIFY_APP_URL/health/ready"
npx prisma migrate status
```
