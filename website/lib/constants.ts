export const SITE = {
  name: "UpsellTrix",
  tagline: "Gift with purchase for Shopify",
  description:
    "Run spend-to-gift, tiered rewards, and mystery gifts on Shopify — unlock offers in the cart from one app.",
  url: "https://upselltrix.com",
  primaryCta: "Install",
  requestAccessCta: "Install",
  contactEmail: "support@upselltrix.algorithmtrix.com",
  legalName: "Algorithmtrix Pvt. Ltd.",
  jurisdiction: "Delhi, India",
  supportEmail: "support@upselltrix.algorithmtrix.com",
  legalEffectiveDate: "August 31, 2026",
} as const;

export const NAV_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Promotions", href: "/#promotions" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Contact", href: "/contact" },
] as const;

export const FEATURES = [
  {
    title: "One Platform",
    description:
      "Replace fragmented discount apps with a single promotion engine built for Shopify.",
    detail: "Rules, stacking, and cart UX live in one place — fewer conflicts, faster launches.",
  },
  {
    title: "Unlimited Promotions",
    description:
      "Run gift, spend, bundle, and volume campaigns together — without stacking conflicts.",
    detail: "Coordinate thresholds and eligibility so shoppers always see the right offer.",
  },
  {
    title: "Enterprise Ready",
    description:
      "Scalable logic, clean UX, and operational control for high-growth and Plus stores.",
    detail: "Built for teams that need reliability when promotions hit peak traffic.",
  },
] as const;

export const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Set a threshold",
    description:
      "Choose the cart value that unlocks your gift — $75, $100, or a custom target.",
  },
  {
    step: "02",
    title: "Pick the reward",
    description:
      "Attach a free product, mystery gift, or tiered reward that fits your catalog.",
  },
  {
    step: "03",
    title: "Show progress in cart",
    description:
      "Shoppers see how close they are — and unlock the gift at the moment of decision.",
  },
  {
    step: "04",
    title: "Measure the lift",
    description:
      "Track redemptions, AOV change, and campaign performance from one dashboard.",
  },
] as const;

export const RESULTS = [
  {
    value: "1 app",
    label: "Promotion engine",
    note: "Gifts, upsells, and cart offers together",
  },
  {
    value: "Cart",
    label: "Unlock in checkout",
    note: "Shoppers see the gift at the moment of decision",
  },
  {
    value: "Free",
    label: "Private beta",
    note: "No monthly fee while we onboard early merchants",
  },
] as const;

export const PROMOTION_TYPES = [
  {
    title: "Free Gift",
    description: "Unlock free products when shoppers hit your rules.",
    example: "Spend $100 → free sample kit",
  },
  {
    title: "Spend Discount",
    description: "Reward higher carts with threshold-based savings.",
    example: "Spend $150 → 15% off",
  },
  {
    title: "Bundles",
    description: "Package complementary products into converting offers.",
    example: "Shirt + belt as a set",
  },
  {
    title: "Free Shipping",
    description: "Motivate checkout completion with shipping incentives.",
    example: "Free ship over $80",
  },
  {
    title: "Buy X Get Y",
    description: "Configure classic and advanced BXGY promotions.",
    example: "Buy 2, get 1 free",
  },
  {
    title: "Volume Discounts",
    description: "Scale pricing by quantity to lift units per order.",
    example: "3+ units → 10% off",
  },
  {
    title: "Mystery Gifts",
    description: "Delight customers with surprise rewards that drive AOV.",
    example: "Random gift at $120",
  },
  {
    title: "Analytics",
    description: "Measure redemptions, lift, and campaign performance clearly.",
    example: "AOV, attach rate, ROI",
  },
] as const;

export const COMPARISON_ROWS = [
  {
    label: "Scope",
    traditional: "One feature",
    upselltrix: "Full platform",
  },
  {
    label: "Stack",
    traditional: "Multiple apps",
    upselltrix: "One engine",
  },
  {
    label: "Growth",
    traditional: "Limited",
    upselltrix: "Scalable",
  },
  {
    label: "Logic",
    traditional: "Static",
    upselltrix: "Dynamic",
  },
  {
    label: "Cart UX",
    traditional: "Hidden codes",
    upselltrix: "Live unlock",
  },
] as const;

export const INTEGRATIONS = [
  "Shopify",
  "Flow",
  "Checkout",
  "Markets",
  "POS",
] as const;

export const PRICING = {
  badge: "Private Beta",
  price: "FREE",
  description:
    "Join the private beta and build every promotion from one engine — no monthly fee while we refine UpsellTrix with early merchants.",
  perks: [
    "Unlimited gift campaigns",
    "Cart progress unlock UX",
    "Priority onboarding",
    "Shape the roadmap",
  ],
} as const;

export const FAQ_ITEMS = [
  {
    question: "What is UpsellTrix?",
    answer:
      "UpsellTrix is a Shopify promotion platform for creating, automating, and optimizing gift, discount, bundle, and volume campaigns from one engine.",
  },
  {
    question: "Does it replace multiple discount apps?",
    answer:
      "Yes. Instead of stacking single-purpose apps, you manage promotions in one place with consistent logic and cleaner operations.",
  },
  {
    question: "Will it work with my theme?",
    answer:
      "UpsellTrix is verified on Dawn and Savor. Other themes may not be supported.",
  },
  {
    question: "Is there a cost during private beta?",
    answer:
      "Private beta is free. Install to get started while we onboard early merchants.",
  },
  {
    question: "Can I run multiple promotions at once?",
    answer:
      "Yes. The engine is built to run coordinated campaigns — free gifts, spend discounts, bundles, BXGY, and more — without the usual tool sprawl.",
  },
  {
    question: "How do shoppers see the gift?",
    answer:
      "When a cart hits your threshold, UpsellTrix unlocks the free gift in the cart experience — so the offer is visible at the moment of decision.",
  },
] as const;

export const FOOTER_LINKS = [
  { label: "How it works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Contact", href: "/contact" },
  { label: "Support", href: "/support" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
] as const;
