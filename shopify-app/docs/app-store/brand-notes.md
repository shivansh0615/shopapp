# UpsellTrix — Brand Consistency Notes

## Public brand

- **Product name:** UpsellTrix  
- **Merchant-facing category line:** Free-gift promotions (do not use “Promotion Engine” as a product name)  
- **Theme embed display name:** UpsellTrix  

## Intentionally unchanged (engineering risk)

| Identifier | Why kept |
|---|---|
| `_fgpb_*` line properties / event names | Storefront + discount contracts |
| App proxy subpath `free-gift` | Existing storefront URLs |
| Extension folder `free-gift-progress-bar` | Deploy/uid stability |
| Block handles `free-gift-embed` | Deep link `activateAppId` |
| `DISCOUNT_FUNCTION_TITLE` = `Free Gift Progress Bar — Campaign Rewards` | Discount lookup by title; renaming would orphan existing automatic discounts |
| Internal package/event technical names | No merchant value |

## Merchant-facing updates in Phase 3

- Theme extension `name` + locale + Liquid schema names → UpsellTrix  
- Admin Theme setup / Overview / Compatibility copy → UpsellTrix  
- In-app Help hub at `/app/help`  
- Listing docs use UpsellTrix only  

## Remaining public debt

- Legacy README / older ops docs may still say Free Gift Progress Bar (internal)  
- Shopify Admin Discounts list may still show the historical automatic discount title until a controlled migration exists  
