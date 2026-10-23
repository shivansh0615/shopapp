# UpsellTrix — Pre-submission Checklist

Do **not** mark Shopify automated checks as passed unless run in Partner Dashboard.

## Configuration

- [ ] Production `application_url` is real HTTPS (not `example.com`)  
- [ ] Auth redirect URLs match production  
- [ ] App proxy URL/subpath configured  
- [ ] Embedded app enabled  
- [ ] App icon 1200×1200 uploaded  
- [ ] Compliance webhooks subscribed on production app  
- [ ] `app/uninstalled` + scopes update webhooks live  
- [ ] Theme app extension deployed with display name UpsellTrix  

## Listing

- [ ] Name: UpsellTrix  
- [ ] Subtitle chosen from `listing-copy.md`  
- [ ] Short + full description pasted (no Mystery Gift as live)  
- [ ] Feature bullets match AVAILABLE inventory  
- [ ] Online Store required selected  
- [ ] Pricing: Free (private beta) — no false paid plans  
- [ ] Privacy policy URL live  
- [ ] Support URL / email live  
- [ ] Screenshots uploaded (unique, 1600×900, real UI)  
- [ ] Feature media not logo-only  
- [ ] Demo screencast linked  
- [ ] Reviewer instructions pasted into submission form  

## Protected customer data

- [ ] Confirm PCD declaration / opt-out matches actual scopes and storage  
- [ ] Re-audit if scopes expand  

## Functional smoke (clean store)

- [ ] Install → Overview loads  
- [ ] Enable embed → save  
- [ ] Create Spend X → Free Gift → activate  
- [ ] Storefront progress + gift on cart path  
- [ ] Tiered campaign smoke  
- [ ] Mystery Gift not creatable  
- [ ] Uninstall does not error  

## Automated / CI (repo)

Run before asking for review:

```bash
npm run lint
npm run typecheck
npm run test:backend
npm run test:compliance
npm run test:promotion
npm run test:discount-function
npm run test:storefront
npm run build
npm run check:release
```

Partner Dashboard automated checks:

- [ ] Session token / embedded navigation checks executed  
- [ ] App URL / redirect checks executed  
- [ ] Any failing check triaged  

## Brand

- [ ] No public “Free Gift Progress Bar” product naming in listing  
- [ ] Theme embed merchant-facing name UpsellTrix  
- [ ] Do not use “Promotion Engine” as a public product name  
