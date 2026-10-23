import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { Campaign } from "@prisma/client";
import {
  buildAutoAddGiftProperties,
  FGPB_CAMPAIGN_ID_PROPERTY,
  FGPB_FREE_GIFT_PROPERTY,
} from "../tagged-gift-cart.server";
import {
  buildDiscountConfig,
  buildInactiveDiscountConfig,
} from "./discount-config.builder";
import {
  parseDiscountConfig,
  serializeDiscountConfig,
  type DiscountConfig,
} from "./discount-config.schema";
import {
  evaluateFixedDiscounts,
  evaluatePercentageDiscounts,
  evaluateTaggedGiftDiscounts,
  toDiscountCartLineFromProperties,
} from "./discount-line-evaluator.server";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "discount-config.v1.json"), "utf8"),
) as DiscountConfig;

const GIFT_VARIANT = "54277124161902";
const CAMPAIGN_ID = "8";

function activeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 8,
    shop: "example.myshopify.com",
    name: "Spend threshold gift",
    campaignType: "Spend X -> Free Gift",
    threshold: 999,
    thresholdMinor: null,
    currencyCode: "INR",
    giftProductId: "123",
    giftProductTitle: "The Minimal Snowboard",
    giftProductImage: null,
    giftVariantId: `gid://shopify/ProductVariant/${GIFT_VARIANT}`,
    giftQuantity: 1,
    discountPercentage: null,
    fixedDiscountAmount: null,
    fixedDiscountAmountMinor: null,
    placements: [],
    widgetSettings: null,
    status: "ACTIVE",
    ruleType: "SPEND_THRESHOLD",
    triggerQuantity: 1,
    triggerProductIds: [],
    triggerCollectionIds: [],
    startDate: null,
    endDate: null,
    priority: 0,
    allowCustomerChoice: false,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function taggedLine(id: string, quantity = 1) {
  return toDiscountCartLineFromProperties({
    id,
    quantity,
    merchandiseVariantId: GIFT_VARIANT,
    properties: buildAutoAddGiftProperties(CAMPAIGN_ID),
  });
}

function paidLine(id: string, quantity = 1) {
  return toDiscountCartLineFromProperties({
    lineSubtotal: 1200,
    id,
    quantity,
    merchandiseVariantId: GIFT_VARIANT,
    properties: null,
  });
}

describe("discount config schema", () => {
  it("caps legacy multi-unit classic campaigns to the browser's one-unit contract", () => {
    const config = buildDiscountConfig({ shopDomain: "example.myshopify.com", campaign: activeCampaign({ giftQuantity: 3 }), currencyCode: "INR" });
    assert.equal(config.activeCampaigns[0].rewardType, "FREE_GIFT");
    assert.equal((config.activeCampaigns[0] as { maxGiftQuantity: number }).maxGiftQuantity, 1);
  });
  it("parses the v1 fixture config", () => {
    const parsed = parseDiscountConfig(FIXTURE_CONFIG);
    assert.ok(parsed);
    assert.equal(parsed?.shopDomain, "example.myshopify.com");
    assert.equal(parsed?.activeCampaigns.length, 1);
    assert.equal(parsed?.activeCampaigns[0].campaignId, CAMPAIGN_ID);
  });

  it("rejects unsupported schema versions", () => {
    assert.equal(parseDiscountConfig({ ...FIXTURE_CONFIG, schemaVersion: 99 }), null);
  });

  it("round-trips through serializeDiscountConfig", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign(),
      currencyCode: "INR",
    });
    const parsed = parseDiscountConfig(JSON.parse(serializeDiscountConfig(built)));
    assert.deepEqual(parsed, built);
  });

  it("builds an inactive config with no active campaigns", () => {
    const inactive = buildInactiveDiscountConfig("example.myshopify.com");
    assert.deepEqual(inactive.activeCampaigns, []);
  });

  it("skips non-ACTIVE campaigns when building config", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({ status: "PAUSED" }),
    });
    assert.deepEqual(built.activeCampaigns, []);
  });

  it("null campaign → inactive empty config", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: null,
    });
    assert.deepEqual(built.activeCampaigns, []);
  });
});

describe("PR-3 — Discount Builder supported-type alignment", () => {
  it("1. one supported Free Gift campaign → included", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({ id: 8, campaignType: "Spend X -> Free Gift" }),
    });
    assert.equal(built.activeCampaigns.length, 1);
    assert.equal(built.activeCampaigns[0]?.campaignId, "8");
    assert.equal(built.activeCampaigns[0]?.rewardType, "FREE_GIFT");
  });

  it("2. unsupported campaign only → excluded", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({ id: 9, campaignType: "Mystery Gift" }),
    });
    assert.deepEqual(built.activeCampaigns, []);
  });

  it("3. builder does not select winners — only emits the given campaign", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 2,
        campaignType: "Spend X -> Free Gift",
        giftVariantId: `gid://shopify/ProductVariant/${GIFT_VARIANT}`,
      }),
    });
    assert.equal(built.activeCampaigns.length, 1);
    assert.equal(built.activeCampaigns[0]?.campaignId, "2");
  });

  it("4. inactive campaign → excluded", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({ status: "PAUSED", campaignType: "Spend X -> Free Gift" }),
    });
    assert.deepEqual(built.activeCampaigns, []);
  });

  it("6. gift property keys remain _fgpb_free_gift + _fgpb_campaign_id", () => {
    const props = buildAutoAddGiftProperties(CAMPAIGN_ID);
    assert.equal(props[FGPB_FREE_GIFT_PROPERTY], "true");
    assert.equal(props[FGPB_CAMPAIGN_ID_PROPERTY], CAMPAIGN_ID);
    assert.deepEqual(Object.keys(props).sort(), [
      FGPB_CAMPAIGN_ID_PROPERTY,
      FGPB_FREE_GIFT_PROPERTY,
    ].sort());
  });
});

describe("discount line evaluator fixtures", () => {
  it("A. discounts only a tagged gift line", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [paidLine("qualifying-paid"), taggedLine("line-tagged")],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, [
      { cartLineId: "line-tagged", quantity: 1, campaignId: CAMPAIGN_ID },
    ]);
  });

  it("B. does not discount an untagged paid line", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [paidLine("line-paid")],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, []);
  });

  it("C. discounts only the tagged line when paid and tagged share a variant", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [paidLine("line-paid"), taggedLine("line-tagged")],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, [
      { cartLineId: "line-tagged", quantity: 1, campaignId: CAMPAIGN_ID },
    ]);
  });

  it("D. ignores tagged lines with unknown campaign ids", () => {
    const forged = toDiscountCartLineFromProperties({
      id: "line-forged",
      quantity: 1,
      merchandiseVariantId: GIFT_VARIANT,
      properties: {
        [FGPB_FREE_GIFT_PROPERTY]: "true",
        [FGPB_CAMPAIGN_ID_PROPERTY]: "999",
      },
    });

    const result = evaluateTaggedGiftDiscounts({
      lines: [forged],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, []);
  });

  it("E. caps discounted quantity to maxGiftQuantity", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [paidLine("qualifying-paid"), taggedLine("line-tagged", 3)],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, [
      { cartLineId: "line-tagged", quantity: 1, campaignId: CAMPAIGN_ID },
    ]);
  });

  it("F. returns no targets when config has no active campaigns", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [paidLine("qualifying-paid"), taggedLine("line-tagged")],
      config: buildInactiveDiscountConfig("example.myshopify.com"),
    });

    assert.deepEqual(result.targets, []);
  });
});

describe("Phase 3A — percentage discount builder + evaluator", () => {
  it("builds PERCENTAGE_DISCOUNT config from supported campaign", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 20,
        campaignType: "Spend X -> Percentage Discount",
        threshold: 1000,
        discountPercentage: 10,
        giftVariantId: null,
      }),
    });
    assert.equal(built.activeCampaigns.length, 1);
    assert.equal(built.activeCampaigns[0]?.rewardType, "PERCENTAGE_DISCOUNT");
    if (built.activeCampaigns[0]?.rewardType === "PERCENTAGE_DISCOUNT") {
      assert.equal(built.activeCampaigns[0].percentage, 10);
      assert.equal(built.activeCampaigns[0].threshold.amount, "1000.00");
    }
  });

  it("parses percentage campaign configs", () => {
    const raw = {
      schemaVersion: 1,
      shopDomain: "example.myshopify.com",
      activeCampaigns: [
        {
          campaignId: "20",
          rewardType: "PERCENTAGE_DISCOUNT",
          threshold: { amount: "1000.00", currencyCode: "INR" },
          percentage: 10,
        },
      ],
    };
    const parsed = parseDiscountConfig(raw);
    assert.ok(parsed);
    assert.equal(parsed?.activeCampaigns[0]?.rewardType, "PERCENTAGE_DISCOUNT");
  });

  it("applies percentage to paid lines when threshold met; skips gifts", () => {
    const config = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 20,
        campaignType: "Spend X -> Percentage Discount",
        threshold: 1000,
        discountPercentage: 10,
        giftVariantId: null,
      }),
    });

    const result = evaluatePercentageDiscounts({
      lines: [
        toDiscountCartLineFromProperties({
          id: "paid",
          quantity: 2,
          merchandiseVariantId: "111",
          lineSubtotal: 1200,
          properties: null,
        }),
        taggedLine("gift"),
      ],
      config,
      cartSubtotal: 1200,
    });

    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0]?.cartLineId, "paid");
    assert.equal(result.targets[0]?.percentage, 10);
  });

  it("does not apply percentage below threshold", () => {
    const config = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 20,
        campaignType: "Spend X -> Percentage Discount",
        threshold: 1000,
        discountPercentage: 10,
        giftVariantId: null,
      }),
    });
    const result = evaluatePercentageDiscounts({
      lines: [
        toDiscountCartLineFromProperties({
          id: "paid",
          quantity: 1,
          merchandiseVariantId: "111",
          lineSubtotal: 999,
          properties: null,
        }),
      ],
      config,
      cartSubtotal: 999,
    });
    assert.deepEqual(result.targets, []);
  });

  it("Policy A: builder emits at most one campaign when given the winner", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 2,
        campaignType: "Spend X -> Percentage Discount",
        discountPercentage: 15,
        giftVariantId: null,
      }),
    });
    assert.equal(built.activeCampaigns.length, 1);
    assert.equal(built.activeCampaigns[0]?.rewardType, "PERCENTAGE_DISCOUNT");
  });
});

describe("Phase 3B — fixed discount builder + evaluator", () => {
  it("builds FIXED_DISCOUNT config from supported campaign", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 30,
        campaignType: "Spend X -> Fixed Discount",
        threshold: 1000,
        fixedDiscountAmount: 100,
        giftVariantId: null,
      }),
    });
    assert.equal(built.activeCampaigns.length, 1);
    assert.equal(built.activeCampaigns[0]?.rewardType, "FIXED_DISCOUNT");
    if (built.activeCampaigns[0]?.rewardType === "FIXED_DISCOUNT") {
      assert.equal(built.activeCampaigns[0].amount, 100);
      assert.equal(built.activeCampaigns[0].threshold.amount, "1000.00");
    }
  });

  it("parses fixed campaign configs", () => {
    const raw = {
      schemaVersion: 1,
      shopDomain: "example.myshopify.com",
      activeCampaigns: [
        {
          campaignId: "30",
          rewardType: "FIXED_DISCOUNT",
          threshold: { amount: "1000.00", currencyCode: "INR" },
          amount: 100,
        },
      ],
    };
    const parsed = parseDiscountConfig(raw);
    assert.ok(parsed);
    assert.equal(parsed?.activeCampaigns[0]?.rewardType, "FIXED_DISCOUNT");
  });

  it("applies fixed amount to paid lines when threshold met; skips gifts", () => {
    const config = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 30,
        campaignType: "Spend X -> Fixed Discount",
        threshold: 1000,
        fixedDiscountAmount: 100,
        giftVariantId: null,
      }),
    });

    const result = evaluateFixedDiscounts({
      lines: [
        toDiscountCartLineFromProperties({
          id: "paid",
          quantity: 2,
          merchandiseVariantId: "111",
          lineSubtotal: 1200,
          properties: null,
        }),
        taggedLine("gift"),
      ],
      config,
      cartSubtotal: 1200,
    });

    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0]?.cartLineId, "paid");
    assert.equal(result.targets[0]?.amount, 100);
    assert.equal(result.amount, 100);
  });

  it("does not apply fixed discount below threshold", () => {
    const config = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        id: 30,
        campaignType: "Spend X -> Fixed Discount",
        threshold: 1000,
        fixedDiscountAmount: 100,
        giftVariantId: null,
      }),
    });
    const result = evaluateFixedDiscounts({
      lines: [
        toDiscountCartLineFromProperties({
          id: "paid",
          quantity: 1,
          merchandiseVariantId: "111",
          lineSubtotal: 999,
          properties: null,
        }),
      ],
      config,
      cartSubtotal: 999,
    });
    assert.deepEqual(result.targets, []);
    assert.equal(result.amount, 0);
  });

  it("rejects zero/negative fixed amount in builder", () => {
    const zero = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        campaignType: "Spend X -> Fixed Discount",
        fixedDiscountAmount: 0,
        giftVariantId: null,
      }),
    });
    assert.equal(zero.activeCampaigns.length, 0);

    const negative = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        campaignType: "Spend X -> Fixed Discount",
        fixedDiscountAmount: -5,
        giftVariantId: null,
      }),
    });
    assert.equal(negative.activeCampaigns.length, 0);
  });

  it("Free Gift builder path unchanged", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign(),
    });
    assert.equal(built.activeCampaigns[0]?.rewardType, "FREE_GIFT");
  });

  it("Percentage builder path unchanged", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: activeCampaign({
        campaignType: "Spend X -> Percentage Discount",
        discountPercentage: 10,
        giftVariantId: null,
      }),
    });
    assert.equal(built.activeCampaigns[0]?.rewardType, "PERCENTAGE_DISCOUNT");
  });
});

describe("Tiered Free Gifts — discount builder + evaluator", () => {
  const tiers = [
    {
      id: "tier-a",
      campaignId: 8,
      threshold: 50,
      thresholdMinor: null,
      giftProductId: "p1",
      giftProductTitle: "A",
      giftProductImage: null,
      giftVariantId: "111",
      position: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "tier-b",
      campaignId: 8,
      threshold: 100,
      thresholdMinor: null,
      giftProductId: "p2",
      giftProductTitle: "B",
      giftProductImage: null,
      giftVariantId: "222",
      position: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("builds TIERED_FREE_GIFTS config with ordered tiers (Policy A length 1)", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: {
        ...activeCampaign({
          campaignType: "Tiered Free Gifts",
          threshold: 50,
          giftVariantId: null,
        }),
        rewardTiers: tiers,
      },
      currencyCode: "INR",
    });
    assert.equal(built.activeCampaigns.length, 1);
    assert.equal(built.activeCampaigns[0]?.rewardType, "TIERED_FREE_GIFTS");
    if (built.activeCampaigns[0]?.rewardType === "TIERED_FREE_GIFTS") {
      assert.equal(built.activeCampaigns[0].tiers.length, 2);
      assert.equal(built.activeCampaigns[0].tiers[0]?.tierId, "tier-a");
      assert.equal(built.activeCampaigns[0].tiers[1]?.threshold.amount, "100.00");
    }
  });

  it("discounts unlocked tagged tier gifts; skips locked / wrong tier / paid same SKU", () => {
    const config = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: {
        ...activeCampaign({ campaignType: "Tiered Free Gifts", threshold: 50 }),
        rewardTiers: tiers,
      },
    });

    const lines = [
      toDiscountCartLineFromProperties({
        id: "paid",
        quantity: 1,
        merchandiseVariantId: "111",
        lineSubtotal: 80,
        properties: null,
      }),
      toDiscountCartLineFromProperties({
        id: "gift-a",
        quantity: 2,
        merchandiseVariantId: "111",
        properties: {
          _fgpb_free_gift: "true",
          _fgpb_campaign_id: CAMPAIGN_ID,
          _fgpb_tier_id: "tier-a",
        },
      }),
      toDiscountCartLineFromProperties({
        id: "gift-b-locked",
        quantity: 1,
        merchandiseVariantId: "222",
        properties: {
          _fgpb_free_gift: "true",
          _fgpb_campaign_id: CAMPAIGN_ID,
          _fgpb_tier_id: "tier-b",
        },
      }),
    ];

    const result = evaluateTaggedGiftDiscounts({ lines, config, cartSubtotal: 80 });
    assert.equal(result.targets.length, 1);
    assert.equal(result.targets[0]?.cartLineId, "gift-a");
    assert.equal(result.targets[0]?.quantity, 1);
  });

  it("rejects incomplete tier configs in builder", () => {
    const built = buildDiscountConfig({
      shopDomain: "example.myshopify.com",
      campaign: {
        ...activeCampaign({ campaignType: "Tiered Free Gifts" }),
        rewardTiers: [],
      },
    });
    assert.equal(built.activeCampaigns.length, 0);
  });
});

 describe("classic gift spend validation", () => {
  it("rejects gift-only carts even when the cart subtotal includes the gift price", () => {
    assert.deepEqual(evaluateTaggedGiftDiscounts({ config: FIXTURE_CONFIG, lines: [taggedLine("gift")], cartSubtotal: 5000 }).targets, []);
  });
  it("requires paid spend at the threshold and caps duplicate tagged lines", () => {
    const threshold = Number((FIXTURE_CONFIG.activeCampaigns[0] as {threshold:{amount:string}}).threshold.amount);
    for (const [spend, count] of [[threshold - 0.01, 0], [threshold, 1]]) {
      const result = evaluateTaggedGiftDiscounts({ config: FIXTURE_CONFIG, lines: [{ ...paidLine("paid"), lineSubtotal: spend }, taggedLine("gift1"), taggedLine("gift2")] });
      assert.equal(result.targets.reduce((sum, target) => sum + target.quantity, 0), count);
    }
  });
});
