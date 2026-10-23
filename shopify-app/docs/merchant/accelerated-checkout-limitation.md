# Accelerated Checkout — Merchant Communication

**Status:** Production-ready disclosure for UpsellTrix  
**Product claim:** Automatic free gifts via Add to cart / cart checkout (Spend X → Free Gift and Tiered Free Gifts)

---

## Admin warning

**Accelerated Checkout compatibility:** Not currently supported.

Automatic free gifts are applied when customers use **Add to cart** and continue through the cart to checkout. They are **not** applied when customers use **Buy it now** or other Accelerated Checkout buttons on the product page.

---

## Campaign editor notice

**Accelerated Checkout compatibility:** Not currently supported.

This campaign adds free gifts automatically from the cart. Customers who skip the cart with **Buy it now** / Accelerated Checkout will not receive automatic gifts for that order path. Recommend Add to cart for gift eligibility.

In Admin, this notice appears when configuring FREE_GIFT or Tiered Free Gifts campaigns, with a Learn more link to `/app/help/accelerated-checkout`.

---

## Merchant documentation

### Do free gifts work with Buy it now?

**Accelerated Checkout compatibility:** Not currently supported.

Free gifts unlock when the customer builds a qualifying cart (Add to cart, cart drawer, or cart page) and then checks out. If a customer uses **Buy it now** or another Accelerated Checkout button on the product page, they go straight to checkout and automatic gifts are not added for that path.

**Supported:** Add to cart → cart / cart drawer → checkout  
**Not currently supported:** Buy it now / Shop Pay express / other Accelerated Checkout buttons on the product page

---

## App Store limitation

**Accelerated Checkout compatibility:** Not currently supported.

Automatic free gifts require Add to cart and cart checkout. Buy it now and other Accelerated Checkout buttons on product pages are not currently supported for automatic gift insertion.
