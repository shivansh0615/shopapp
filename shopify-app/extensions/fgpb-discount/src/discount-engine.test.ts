import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DiscountClass, ProductDiscountSelectionStrategy } from "../generated/api";
import { cartLinesDiscountsGenerateRun } from "./cart_lines_discounts_generate_run";
import {
  canonicalizeDiscountConfig,
  evaluateTaggedGiftDiscounts,
  mapCartLineFromInput,
  parseDiscountConfig,
  type DiscountConfig,
} from "../src/discount-engine";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_CONFIG = JSON.parse(
  readFileSync(join(__dirname, "..", "tests", "fixtures", "discount-config.v1.json"), "utf8"),
) as DiscountConfig;

const GIFT_VARIANT_GID = "gid://shopify/ProductVariant/54277124161902";
const OTHER_VARIANT_GID = "gid://shopify/ProductVariant/11111111111";
const CAMPAIGN_ID = "8";

function baseInput() {
  return {
    cart: { lines: [] as ReturnType<typeof line> extends infer T ? T[] : never },
    discount: {
      discountClasses: [DiscountClass.Product],
      metafield: {
        jsonValue: FIXTURE_CONFIG,
      },
    },
  };
}

function line(input: {
  id: string;
  quantity?: number;
  tagged?: boolean;
  campaignId?: string;
  variantId?: string;
}) {
  return {
    id: input.id,
    quantity: input.quantity ?? 1,
    cost: { subtotalAmount: { amount: input.tagged ? "50" : "1200" } },
    freeGift: input.tagged ? { value: "true" } : null,
    campaignId: input.tagged ? { value: input.campaignId ?? CAMPAIGN_ID } : null,
    merchandise: {
      __typename: "ProductVariant",
      id: input.variantId ?? GIFT_VARIANT_GID,
    },
  };
}

function runFunction(lines: ReturnType<typeof line>[]) {
  return cartLinesDiscountsGenerateRun({
    ...baseInput(),
    cart: { lines: [line({ id: "qualifying-paid", tagged: false }), ...lines] },
  });
}

describe("fgpb-discount evaluator", () => {
  it("discounts only a tagged gift line", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [mapCartLineFromInput(line({ id: "qualifying-paid" })), mapCartLineFromInput(line({ id: "line-tagged", tagged: true }))],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, [
      { cartLineId: "line-tagged", quantity: 1, campaignId: CAMPAIGN_ID },
    ]);
  });

  it("does not discount an untagged paid copy", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [mapCartLineFromInput(line({ id: "line-paid", tagged: false }))],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, []);
  });

  it("discounts only the tagged line when paid and tagged share a variant", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        mapCartLineFromInput(line({ id: "line-paid", tagged: false })),
        mapCartLineFromInput(line({ id: "line-tagged", tagged: true })),
      ],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, [
      { cartLineId: "line-tagged", quantity: 1, campaignId: CAMPAIGN_ID },
    ]);
  });

  it("ignores tagged lines with wrong campaign IDs", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        mapCartLineFromInput(
          line({ id: "line-wrong-campaign", tagged: true, campaignId: "999" }),
        ),
      ],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, []);
  });

  it("ignores tagged lines with wrong variant IDs", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        mapCartLineFromInput(
          line({ id: "line-wrong-variant", tagged: true, variantId: OTHER_VARIANT_GID }),
        ),
      ],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, []);
  });

  it("caps discounted quantity to maxGiftQuantity", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [mapCartLineFromInput(line({ id: "qualifying-paid" })), mapCartLineFromInput(line({ id: "line-tagged", tagged: true, quantity: 3 }))],
      config: FIXTURE_CONFIG,
    });

    assert.deepEqual(result.targets, [
      { cartLineId: "line-tagged", quantity: 1, campaignId: CAMPAIGN_ID },
    ]);
  });

  it("returns no targets for inactive config", () => {
    const inactive = parseDiscountConfig({
      ...FIXTURE_CONFIG,
      activeCampaigns: [],
    });

    assert.ok(inactive);
    const result = evaluateTaggedGiftDiscounts({
      lines: [mapCartLineFromInput(line({ id: "line-tagged", tagged: true }))],
      config: inactive!,
    });

    assert.deepEqual(result.targets, []);
  });
});

describe("fgpb-discount function output", () => {
  it("returns 100% product discount for a tagged gift line", () => {
    const result = runFunction([line({ id: "gid://shopify/CartLine/1", tagged: true })]);

    assert.equal(result.operations.length, 1);
    const operation = result.operations[0]?.productDiscountsAdd;
    assert.ok(operation);
    assert.equal(operation?.candidates[0]?.value.percentage?.value, "100");
    assert.deepEqual(operation?.candidates[0]?.targets, [
      { cartLine: { id: "gid://shopify/CartLine/1", quantity: 1 } },
    ]);
  });

  it("returns no operations for an untagged paid copy", () => {
    const result = runFunction([line({ id: "gid://shopify/CartLine/2", tagged: false })]);
    assert.deepEqual(result.operations, []);
  });

  it("returns one operation when paid and tagged copies share a variant", () => {
    const result = runFunction([
      line({ id: "gid://shopify/CartLine/paid", tagged: false }),
      line({ id: "gid://shopify/CartLine/tagged", tagged: true }),
    ]);

    assert.equal(result.operations.length, 1);
    const targets = result.operations[0]?.productDiscountsAdd?.candidates[0]?.targets ?? [];
    assert.deepEqual(targets, [{ cartLine: { id: "gid://shopify/CartLine/tagged", quantity: 1 } }]);
  });
});

describe("fgpb-discount percentage discount", () => {
  const percentageConfig = {
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

  function runPercentage(lines: ReturnType<typeof line>[], cartSubtotal = "1200.00") {
    return cartLinesDiscountsGenerateRun({
      cart: {
        cost: { subtotalAmount: { amount: cartSubtotal } },
        lines: lines.map((l) => ({
          ...l,
          cost: { subtotalAmount: { amount: cartSubtotal } },
        })),
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        metafield: { jsonValue: percentageConfig },
      },
    });
  }

  it("applies percentage to paid lines when threshold met", () => {
    const result = runPercentage([line({ id: "gid://shopify/CartLine/paid", tagged: false })]);
    assert.equal(result.operations.length, 1);
    const candidate = result.operations[0]?.productDiscountsAdd?.candidates[0];
    assert.equal(candidate?.value.percentage?.value, "10");
    assert.equal(candidate?.message, "10% OFF");
  });

  it("does not apply percentage below threshold", () => {
    const result = runPercentage(
      [line({ id: "gid://shopify/CartLine/paid", tagged: false })],
      "500.00",
    );
    assert.deepEqual(result.operations, []);
  });

  it("skips tagged gift lines for percentage", () => {
    const result = runPercentage([
      line({ id: "gid://shopify/CartLine/gift", tagged: true }),
    ]);
    assert.deepEqual(result.operations, []);
  });
});

describe("fgpb-discount fixed discount", () => {
  const fixedConfig = {
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

  function runFixed(lines: ReturnType<typeof line>[], cartSubtotal = "1200.00") {
    return cartLinesDiscountsGenerateRun({
      cart: {
        cost: { subtotalAmount: { amount: cartSubtotal } },
        lines: lines.map((l) => ({
          ...l,
          cost: { subtotalAmount: { amount: cartSubtotal } },
        })),
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        metafield: { jsonValue: fixedConfig },
      },
    });
  }

  it("applies fixed discount to paid lines when threshold met", () => {
    const result = runFixed([line({ id: "gid://shopify/CartLine/paid", tagged: false })]);
    assert.equal(result.operations.length, 1);
    const candidate = result.operations[0]?.productDiscountsAdd?.candidates[0];
    assert.equal(candidate?.value.fixedAmount?.amount, "100.00");
    assert.equal(candidate?.value.fixedAmount?.appliesToEachItem, false);
    assert.equal(candidate?.message, "100 OFF");
    assert.equal(
      result.operations[0]?.productDiscountsAdd?.selectionStrategy,
      ProductDiscountSelectionStrategy.First,
    );
  });

  it("does not apply fixed discount below threshold", () => {
    const result = runFixed(
      [line({ id: "gid://shopify/CartLine/paid", tagged: false })],
      "500.00",
    );
    assert.deepEqual(result.operations, []);
  });

  it("skips tagged gift lines for fixed discount", () => {
    const result = runFixed([
      line({ id: "gid://shopify/CartLine/gift", tagged: true }),
    ]);
    assert.deepEqual(result.operations, []);
  });

  it("excludes tagged gift when paid + gift share cart", () => {
    const result = cartLinesDiscountsGenerateRun({
      cart: {
        cost: { subtotalAmount: { amount: "1200.00" } },
        lines: [
          {
            ...line({ id: "gid://shopify/CartLine/paid", tagged: false }),
            cost: { subtotalAmount: { amount: "1200.00" } },
          },
          line({ id: "gid://shopify/CartLine/gift", tagged: true }),
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        metafield: { jsonValue: fixedConfig },
      },
    });
    const targets = result.operations[0]?.productDiscountsAdd?.candidates[0]?.targets ?? [];
    assert.deepEqual(
      targets.map((t) => t.cartLine.id),
      ["gid://shopify/CartLine/paid"],
    );
  });
});

describe("fgpb-discount Policy A — single campaign / legacy metafield", () => {
  it("Free Gift-only config uses First strategy (never All)", () => {
    const result = runFunction([line({ id: "gid://shopify/CartLine/1", tagged: true })]);
    const strategy = result.operations[0]?.productDiscountsAdd?.selectionStrategy;
    assert.equal(strategy, ProductDiscountSelectionStrategy.First);
    assert.notEqual(strategy, ProductDiscountSelectionStrategy.All);
  });

  it("Percentage-only config uses First strategy", () => {
    const result = cartLinesDiscountsGenerateRun({
      cart: {
        cost: { subtotalAmount: { amount: "1200.00" } },
        lines: [
          {
            ...line({ id: "gid://shopify/CartLine/paid", tagged: false }),
            cost: { subtotalAmount: { amount: "1200.00" } },
          },
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        metafield: {
          jsonValue: {
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
          },
        },
      },
    });
    assert.equal(
      result.operations[0]?.productDiscountsAdd?.selectionStrategy,
      ProductDiscountSelectionStrategy.First,
    );
  });

  it("legacy multi-campaign metafield keeps only the first campaign (deterministic)", () => {
    const legacy = {
      schemaVersion: 1,
      shopDomain: "example.myshopify.com",
      activeCampaigns: [
        {
          campaignId: "8",
          rewardType: "FREE_GIFT",
          threshold: { amount: "999.00", currencyCode: "INR" },
          giftVariantIds: ["54277124161902"],
          maxGiftQuantity: 1,
        },
        {
          campaignId: "20",
          rewardType: "PERCENTAGE_DISCOUNT",
          threshold: { amount: "1000.00", currencyCode: "INR" },
          percentage: 10,
        },
      ],
    };
    const parsed = parseDiscountConfig(legacy);
    assert.ok(parsed);
    assert.equal(parsed!.activeCampaigns.length, 2);
    const canonical = canonicalizeDiscountConfig(parsed!);
    assert.equal(canonical.activeCampaigns.length, 1);
    assert.equal(canonical.activeCampaigns[0]?.campaignId, "8");
    assert.equal(canonical.activeCampaigns[0]?.rewardType, "FREE_GIFT");

    // Paid line at high subtotal + tagged gift: only Free Gift applies (first), not % stack
    const result = cartLinesDiscountsGenerateRun({
      cart: {
        cost: { subtotalAmount: { amount: "2000.00" } },
        lines: [
          {
            ...line({ id: "gid://shopify/CartLine/paid", tagged: false }),
            cost: { subtotalAmount: { amount: "2000.00" } },
          },
          line({ id: "gid://shopify/CartLine/gift", tagged: true }),
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        metafield: { jsonValue: legacy },
      },
    });

    assert.equal(result.operations.length, 1);
    const candidates = result.operations[0]?.productDiscountsAdd?.candidates ?? [];
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.message, "FREE GIFT");
    assert.equal(candidates[0]?.value.percentage?.value, "100");
    assert.equal(
      result.operations[0]?.productDiscountsAdd?.selectionStrategy,
      ProductDiscountSelectionStrategy.First,
    );
  });

  it("legacy multi-campaign with Percentage first ignores later Free Gift", () => {
    const legacy = {
      schemaVersion: 1,
      shopDomain: "example.myshopify.com",
      activeCampaigns: [
        {
          campaignId: "20",
          rewardType: "PERCENTAGE_DISCOUNT",
          threshold: { amount: "1000.00", currencyCode: "INR" },
          percentage: 10,
        },
        {
          campaignId: "8",
          rewardType: "FREE_GIFT",
          threshold: { amount: "999.00", currencyCode: "INR" },
          giftVariantIds: ["54277124161902"],
          maxGiftQuantity: 1,
        },
      ],
    };

    const result = cartLinesDiscountsGenerateRun({
      cart: {
        cost: { subtotalAmount: { amount: "2000.00" } },
        lines: [
          {
            ...line({ id: "gid://shopify/CartLine/paid", tagged: false }),
            cost: { subtotalAmount: { amount: "2000.00" } },
          },
          line({ id: "gid://shopify/CartLine/gift", tagged: true }),
        ],
      },
      discount: {
        discountClasses: [DiscountClass.Product],
        metafield: { jsonValue: legacy },
      },
    });

    const candidates = result.operations[0]?.productDiscountsAdd?.candidates ?? [];
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.message, "10% OFF");
    // Tagged gift is not discounted when Free Gift is not the canonical first campaign
    const targetIds = (candidates[0]?.targets ?? []).map((t) => t.cartLine.id);
    assert.deepEqual(targetIds, ["gid://shopify/CartLine/paid"]);
  });
});

describe("fgpb-discount TIERED_FREE_GIFTS", () => {
  const TIER_CAMPAIGN_ID = "40";
  const TIER1 = "tier-1";
  const TIER2 = "tier-2";
  const TIER3 = "tier-3";
  const VARIANT1 = "11111111111";
  const VARIANT2 = "22222222222";
  const VARIANT3 = "33333333333";

  const tieredConfig: DiscountConfig = {
    schemaVersion: 1,
    shopDomain: "example.myshopify.com",
    activeCampaigns: [
      {
        campaignId: TIER_CAMPAIGN_ID,
        rewardType: "TIERED_FREE_GIFTS",
        tiers: [
          {
            tierId: TIER1,
            threshold: { amount: "500.00", currencyCode: "INR" },
            giftVariantId: VARIANT1,
          },
          {
            tierId: TIER2,
            threshold: { amount: "1000.00", currencyCode: "INR" },
            giftVariantId: VARIANT2,
          },
          {
            tierId: TIER3,
            threshold: { amount: "1500.00", currencyCode: "INR" },
            giftVariantId: VARIANT3,
          },
        ],
      },
    ],
  };

  function tierLine(input: {
    id: string;
    tierId?: string;
    variantId?: string;
    campaignId?: string;
    quantity?: number;
    tagged?: boolean;
    lineSubtotal?: number | null;
  }) {
    const tagged = input.tagged !== false;
    return {
      id: input.id,
      quantity: input.quantity ?? 1,
      merchandiseVariantId: input.variantId ?? VARIANT1,
      lineSubtotal: input.lineSubtotal ?? null,
      attributes: tagged
        ? [
            { key: "_fgpb_free_gift", value: "true" },
            { key: "_fgpb_campaign_id", value: input.campaignId ?? TIER_CAMPAIGN_ID },
            { key: "_fgpb_tier_id", value: input.tierId ?? TIER1 },
          ]
        : [],
    };
  }

  function paidLine(id: string, lineSubtotal: number, variantId = "999") {
    return {
      id,
      quantity: 1,
      merchandiseVariantId: variantId,
      lineSubtotal,
      attributes: [] as { key: string; value: string | null }[],
    };
  }

  it("parses TIERED_FREE_GIFTS config", () => {
    const parsed = parseDiscountConfig(tieredConfig);
    assert.ok(parsed);
    assert.equal(parsed!.activeCampaigns[0]?.rewardType, "TIERED_FREE_GIFTS");
  });

  it("discounts one unlocked tier gift", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [paidLine("paid", 600), tierLine({ id: "gift-1", tierId: TIER1, variantId: VARIANT1 })],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, [
      { cartLineId: "gift-1", quantity: 1, campaignId: TIER_CAMPAIGN_ID },
    ]);
  });

  it("discounts two unlocked tier gifts", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 1100),
        tierLine({ id: "gift-1", tierId: TIER1, variantId: VARIANT1 }),
        tierLine({ id: "gift-2", tierId: TIER2, variantId: VARIANT2 }),
      ],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, [
      { cartLineId: "gift-1", quantity: 1, campaignId: TIER_CAMPAIGN_ID },
      { cartLineId: "gift-2", quantity: 1, campaignId: TIER_CAMPAIGN_ID },
    ]);
  });

  it("discounts final tier when fully unlocked", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 1600),
        tierLine({ id: "gift-1", tierId: TIER1, variantId: VARIANT1 }),
        tierLine({ id: "gift-2", tierId: TIER2, variantId: VARIANT2 }),
        tierLine({ id: "gift-3", tierId: TIER3, variantId: VARIANT3 }),
      ],
      config: tieredConfig,
    });
    assert.equal(result.targets.length, 3);
    assert.ok(result.targets.some((t) => t.cartLineId === "gift-3"));
  });

  it("does not discount locked tagged gift below its tier threshold", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 600),
        tierLine({ id: "gift-2", tierId: TIER2, variantId: VARIANT2 }),
      ],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, []);
  });

  it("converts shop-currency tier thresholds into presentment currency", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 7),
        tierLine({ id: "gift-1", tierId: TIER1, variantId: VARIANT1 }),
      ],
      config: tieredConfig,
      presentmentCurrencyRate: 0.012,
    });
    assert.deepEqual(result.targets, [
      { cartLineId: "gift-1", quantity: 1, campaignId: TIER_CAMPAIGN_ID },
    ]);
  });

  it("ignores wrong tier id", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 1600),
        tierLine({ id: "gift-x", tierId: "unknown-tier", variantId: VARIANT1 }),
      ],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, []);
  });

  it("ignores wrong gift variant for tier", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 1600),
        tierLine({ id: "gift-wrong", tierId: TIER1, variantId: VARIANT2 }),
      ],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, []);
  });

  it("ignores wrong campaign id", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 1600),
        tierLine({ id: "gift-camp", tierId: TIER1, variantId: VARIANT1, campaignId: "999" }),
      ],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, []);
  });

  it("limits discounted quantity to 1", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 600),
        tierLine({ id: "gift-qty", tierId: TIER1, variantId: VARIANT1, quantity: 3 }),
      ],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, [
      { cartLineId: "gift-qty", quantity: 1, campaignId: TIER_CAMPAIGN_ID },
    ]);
  });

  it("same-SKU paid line remains paid (not discounted)", () => {
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid-same", 600, VARIANT1),
        tierLine({ id: "gift-1", tierId: TIER1, variantId: VARIANT1 }),
      ],
      config: tieredConfig,
    });
    assert.deepEqual(result.targets, [
      { cartLineId: "gift-1", quantity: 1, campaignId: TIER_CAMPAIGN_ID },
    ]);
  });

  it("excludes gift lines from qualifying subtotal", () => {
    // Paid only 400 (below tier-1 500). Gift line priced at 200 must not unlock.
    const result = evaluateTaggedGiftDiscounts({
      lines: [
        paidLine("paid", 400),
        {
          ...tierLine({ id: "gift-1", tierId: TIER1, variantId: VARIANT1 }),
          lineSubtotal: 200,
        },
      ],
      config: tieredConfig,
      cartSubtotal: 600,
    });
    assert.deepEqual(result.targets, []);
  });

  it("maps _fgpb_tier_id from function cart line input", () => {
    const mapped = mapCartLineFromInput({
      id: "line-1",
      quantity: 1,
      freeGift: { value: "true" },
      campaignId: { value: TIER_CAMPAIGN_ID },
      tierId: { value: TIER2 },
      merchandise: { __typename: "ProductVariant", id: `gid://shopify/ProductVariant/${VARIANT2}` },
    });
    assert.equal(
      mapped.attributes.find((a) => a.key === "_fgpb_tier_id")?.value,
      TIER2,
    );
  });
});


describe("eligibility-first checkout arbitration", () => {
  function run(subtotal: number, rate = 1, reverse = false, duplicate = false) {
    const campaigns = [
      { campaignId: "1", rewardType: "FREE_GIFT", priority: 0, threshold: { amount: "500", currencyCode: "INR" }, giftVariantIds: ["111"], maxGiftQuantity: 1 },
      { campaignId: "2", rewardType: "FREE_GIFT", priority: 0, threshold: { amount: "1000", currencyCode: "INR" }, giftVariantIds: ["222"], maxGiftQuantity: 1 },
      { campaignId: "3", rewardType: "FREE_GIFT", priority: 10, threshold: { amount: "2000", currencyCode: "INR" }, giftVariantIds: ["333"], maxGiftQuantity: 1 },
    ];
    const gifts = [1, 2, 3].map(id => ({
      id: "gift-" + id, quantity: 1, freeGift: { value: "true" }, campaignId: { value: String(id) },
      merchandise: { __typename: "ProductVariant", id: String(id * 111) }, cost: { subtotalAmount: { amount: "99" } },
    }));
    if (duplicate) gifts.push({ ...gifts[0], id: "duplicate", tierId: { value: "forged-tier" } } as typeof gifts[number]);
    return cartLinesDiscountsGenerateRun({
      presentmentCurrencyRate: rate,
      cart: { cost: { subtotalAmount: { amount: String(subtotal) } }, lines: [
        { id: "paid", quantity: 1, merchandise: { __typename: "ProductVariant", id: "999" }, cost: { subtotalAmount: { amount: String(subtotal) } } }, ...gifts,
      ] },
      discount: { discountClasses: [DiscountClass.Product], metafield: { jsonValue: {
        schemaVersion: 1, shopDomain: "example.myshopify.com", selectionPolicy: "ELIGIBILITY_FIRST",
        activeCampaigns: reverse ? campaigns.reverse() : campaigns,
      } } },
    });
  }
  for (const reverse of [false, true]) {
    it("chooses qualifying offers at boundaries and when the cart decreases; reverse=" + reverse, () => {
      for (const [subtotal, expected] of [[0, null], [499.99, null], [500, "1"], [999.99, "1"], [1000, "2"], [1999.99, "2"], [2000, "3"], [700, "1"], [0, null]] as const) {
        const result = run(subtotal, 1, reverse);
        const targets = result.operations.flatMap(op => op.productDiscountsAdd.candidates.flatMap(c => c.targets.map(t => t.cartLine.id)));
        assert.deepEqual(targets, expected ? ["gift-" + expected] : []);
      }
    });
  }
  it("converts qualifying thresholds to presentment currency", () => {
    assert.equal(run(11.99, 0.012).operations[0]?.productDiscountsAdd.candidates[0]?.targets[0]?.cartLine.id, "gift-1");
    assert.equal(run(12, 0.012).operations[0]?.productDiscountsAdd.candidates[0]?.targets[0]?.cartLine.id, "gift-2");
  });
  it("does not award the same classic gift twice across separate lines or forged tier tags", () => {
    const result = run(600, 1, false, true);
    assert.deepEqual(result.operations[0]?.productDiscountsAdd.candidates[0]?.targets, [{ cartLine: { id: "gift-1", quantity: 1 } }]);
  });
  it("classic plus tiered: highest reached threshold wins when both qualify", () => {
    const classic = {
      campaignId: "24",
      rewardType: "FREE_GIFT",
      priority: 0,
      threshold: { amount: "999", currencyCode: "USD" },
      giftVariantIds: ["snow"],
      maxGiftQuantity: 1,
    };
    const tiered = {
      campaignId: "25",
      rewardType: "TIERED_FREE_GIFTS",
      priority: 0,
      tiers: [{ tierId: "t1", threshold: { amount: "1500", currencyCode: "USD" }, giftVariantId: "rose" }],
    };
    function mixed(subtotal: number, reverse = false) {
      return cartLinesDiscountsGenerateRun({
        presentmentCurrencyRate: 1,
        cart: {
          cost: { subtotalAmount: { amount: String(subtotal) } },
          lines: [
            { id: "paid", quantity: 1, merchandise: { __typename: "ProductVariant", id: "999" }, cost: { subtotalAmount: { amount: String(subtotal) } } },
            { id: "gift-24", quantity: 1, freeGift: { value: "true" }, campaignId: { value: "24" }, merchandise: { __typename: "ProductVariant", id: "snow" }, cost: { subtotalAmount: { amount: "110" } } },
            { id: "gift-25", quantity: 1, freeGift: { value: "true" }, campaignId: { value: "25" }, tierId: { value: "t1" }, merchandise: { __typename: "ProductVariant", id: "rose" }, cost: { subtotalAmount: { amount: "279" } } },
          ],
        },
        discount: {
          discountClasses: [DiscountClass.Product],
          metafield: {
            jsonValue: {
              schemaVersion: 1,
              shopDomain: "example.myshopify.com",
              selectionPolicy: "ELIGIBILITY_FIRST",
              activeCampaigns: reverse ? [tiered, classic] : [classic, tiered],
            },
          },
        },
      });
    }
    function targetsOf(subtotal: number, reverse = false) {
      return mixed(subtotal, reverse).operations.flatMap((op) =>
        op.productDiscountsAdd.candidates.flatMap((candidate) =>
          candidate.targets.map((target) => target.cartLine.id),
        ),
      );
    }
    assert.deepEqual(targetsOf(837), []);
    assert.deepEqual(targetsOf(1116), ["gift-24"]);
    assert.deepEqual(targetsOf(1500), ["gift-25"]);
    assert.deepEqual(targetsOf(1500, true), ["gift-25"]);
  });
});
