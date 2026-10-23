/**
 * Phase 2C — route adapter contract + parity tests.
 * Locks public JSON shapes without requiring App Proxy auth / DB.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AppSettings, Campaign, CampaignRewardTier } from "@prisma/client";
import { RULE_TYPES } from "../cart-rules.server";
import { proxyDisabledPayload } from "../../lib/proxy-route.server";
import { toPromotionCampaignSnapshot } from "../promotion-engine.server";
import { evaluateWithRegistry } from "./evaluate";
import { toCanonicalCampaign } from "./adapters";
import {
  toEvaluateCartResponse,
  toLegacyEvaluateCartAction,
  toWidgetStateResponse,
} from "./route-adapters";
import {
  canCalculateQualifyingSubtotalFromLines,
  resolveEvaluationSubtotal,
} from "./resolve-subtotal";

const THRESHOLD = 999;

it("normalizes legacy classic quantity in the public promotion snapshot", () => {
  assert.equal(toPromotionCampaignSnapshot(campaignRow({ giftQuantity: 3 })).giftQuantity, 1);
});

type CampaignWithOptionalTiers = Campaign & {
  rewardTiers?: CampaignRewardTier[];
};

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    id: 1,
    shop: "demo.myshopify.com",
    defaultThreshold: 999,
    defaultWidgetTemplate: "Premium",
    primaryColor: "#111111",
    backgroundColor: "#FAFAFA",
    textColor: "#111111",
    autoAddGift: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AppSettings;
}

function campaignRow(
  overrides: Partial<CampaignWithOptionalTiers> = {},
): CampaignWithOptionalTiers {
  return {
    id: 8,
    shop: "demo.myshopify.com",
    name: "Monsoon AOV Booster",
    campaignType: "Spend X -> Free Gift",
    threshold: THRESHOLD,
    thresholdMinor: null,
    currencyCode: "INR",
    status: "ACTIVE",
    giftProductId: "gid://shopify/Product/1",
    giftProductTitle: "Board",
    giftProductImage: "https://cdn.example/board.jpg",
    giftVariantId: "gid://shopify/ProductVariant/11",
    giftQuantity: 1,
    discountPercentage: null,
    fixedDiscountAmount: null,
    fixedDiscountAmountMinor: null,
    placements: [],
    widgetSettings: {
      heading: "You are {remaining} away",
      description: "Add more",
      unlockedHeading: "Unlocked!",
      unlockedDescription: "Enjoy",
      template: "Premium",
      barColor: "#111111",
      backgroundColor: "#FAFAFA",
      textColor: "#111111",
      borderRadius: 16,
      progressHeight: 12,
      widgetPadding: 16,
      buttonText: "Shop",
      cartProgressBar: {
        enabled: true,
        height: 6,
        borderRadius: 8,
        compact: true,
        bannerTitle: "SHOP MORE, WIN FREEBIES",
      },
      cartRecommendations: {
        enabled: true,
        heading: "Bestsellers",
        description: "Add these",
        products: [],
        maxProducts: 4,
        buttonText: "Add",
        backgroundColor: "#FFFFFF",
      },
      celebrationPopup: {
        enabled: true,
        style: "bold",
        buttonText: "Nice",
        cardBackgroundColor: "#111111",
      },
    },
    ruleType: RULE_TYPES.SPEND_THRESHOLD,
    triggerQuantity: 1,
    triggerProductIds: [],
    triggerCollectionIds: [],
    allowCustomerChoice: false,
    startDate: null,
    endDate: null,
    priority: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as CampaignWithOptionalTiers;
}

function evaluate(campaign: CampaignWithOptionalTiers, subtotal: number) {
  const snapshot = toPromotionCampaignSnapshot(campaign);
  return evaluateWithRegistry({
    campaign: toCanonicalCampaign(snapshot, {
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      priority: campaign.priority,
    }),
    cart: { subtotal, lines: [] },
    now: new Date("2026-07-15T00:00:00Z"),
  });
}

describe("Phase 2C — widget-state adapter contract", () => {
  const appSettings = settings();

  it("no / unsupported campaign → disabled payload shape", () => {
    const disabled = proxyDisabledPayload("widget-state");
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.campaignId, null);
    assert.equal(disabled.gift, null);
    assert.equal(disabled.eligible, false);
    assert.equal(disabled.heading, null);
    assert.equal(disabled.widgetSettings, null);

    const unsupported = evaluate(
      campaignRow({ campaignType: "Mystery Gift" }),
      THRESHOLD,
    );
    const adapted = toWidgetStateResponse(unsupported, {
      campaign: campaignRow({ campaignType: "Mystery Gift" }),
      snapshot: toPromotionCampaignSnapshot(campaignRow({ campaignType: "Mystery Gift" })),
      settings: appSettings,
    });
    assert.equal(adapted.enabled, false);
    assert.equal(adapted.eligible, false);
    assert.equal(adapted.gift, null);
  });

  it("below threshold preserves presentation fields and locked copy", () => {
    const row = campaignRow();
    const result = evaluate(row, 500);
    const response = toWidgetStateResponse(result, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
      currency: "₹",
    });

    assert.equal(response.enabled, true);
    assert.equal(response.eligible, false);
    assert.equal(response.campaignId, 8);
    assert.equal(response.threshold, THRESHOLD);
    assert.ok((response.remaining ?? 0) > 0);
    assert.ok((response.progress ?? 0) < 100);
    assert.equal(response.heading, "You are 499 away");
    assert.equal(String(response.heading).includes("₹"), false);
    assert.equal(String(response.heading).includes("$"), false);
    assert.equal(response.gift?.variantId, "gid://shopify/ProductVariant/11");
    assert.equal(response.gift?.productId, "gid://shopify/Product/1");
    assert.equal(response.widgetSettings?.cartProgressBar?.bannerTitle, "SHOP MORE, WIN FREEBIES");
    assert.equal(response.widgetSettings?.cartRecommendations?.heading, "Bestsellers");
    assert.equal(response.widgetSettings?.celebrationPopup?.style, "bold");
    assert.equal(response.widgetSettings?.celebrationPopup?.buttonText, "Nice");
    assert.equal(response.colors?.barColor, "#111111");
    assert.equal(response.template, "Premium");
    assert.equal(response.autoAddGift, true);
  });

  it("exact and above threshold unlock", () => {
    const row = campaignRow();
    const at = toWidgetStateResponse(evaluate(row, THRESHOLD), {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(at.eligible, true);
    assert.equal(at.remaining, 0);
    assert.equal(at.progress, 100);
    assert.match(String(at.heading), /Unlocked/i);

    const above = toWidgetStateResponse(evaluate(row, 2000), {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(above.eligible, true);
    assert.equal(above.progress, 100);
  });
});

describe("Phase 2C — evaluate-cart adapter contract", () => {
  const appSettings = settings();

  it("preserves legacy action field (eligible→ADD_GIFT, else→REMOVE_GIFT)", () => {
    const row = campaignRow();
    const eligible = evaluate(row, THRESHOLD);
    const ineligible = evaluate(row, 400);

    assert.equal(toLegacyEvaluateCartAction(eligible), "ADD_GIFT");
    assert.equal(toLegacyEvaluateCartAction(ineligible), "REMOVE_GIFT");

    const eligibleResponse = toEvaluateCartResponse(eligible, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(eligibleResponse.action, "ADD_GIFT");
    assert.equal(eligibleResponse.eligible, true);
    assert.equal(eligibleResponse.rewardType, "FREE_GIFT");
    assert.equal(eligibleResponse.campaign?.id, 8);
    assert.equal(eligibleResponse.gift?.variantId, "gid://shopify/ProductVariant/11");
    assert.equal(eligibleResponse.maxGiftQuantity, 1);
    assert.equal(eligibleResponse.allowCustomerChoice, false);
    assert.deepEqual(eligibleResponse.giftOptions, []);

    const ineligibleResponse = toEvaluateCartResponse(ineligible, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(ineligibleResponse.action, "REMOVE_GIFT");
    assert.equal(ineligibleResponse.eligible, false);
  });

  it("unsupported / disabled-style evaluate-cart payload", () => {
    const row = campaignRow({ campaignType: "Mystery Gift" });
    const result = evaluate(row, THRESHOLD);
    const response = toEvaluateCartResponse(result, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(response.enabled, false);
    assert.equal(response.action, "NONE");
    assert.equal(response.gift, null);
    assert.equal(response.campaign, null);
  });

  it("exact threshold eligible with progress fields", () => {
    const row = campaignRow();
    const response = toEvaluateCartResponse(evaluate(row, THRESHOLD), {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
      currency: "₹",
    });
    assert.equal(response.enabled, true);
    assert.equal(response.eligible, true);
    assert.equal(response.threshold, THRESHOLD);
    assert.equal(response.progress, 100);
    assert.equal(response.remaining, 0);
    assert.ok(response.heading);
    assert.ok(response.widgetSettings);
    assert.ok(response.colors);
  });

  it("percentage discount → NONE action, null gift, PERCENTAGE_DISCOUNT rewardType", () => {
    const row = campaignRow({
      campaignType: "Spend X -> Percentage Discount",
      discountPercentage: 10,
      giftProductId: "",
      giftVariantId: null,
      giftProductTitle: null,
    });
    const eligible = evaluate(row, THRESHOLD);
    const response = toEvaluateCartResponse(eligible, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(response.enabled, true);
    assert.equal(response.eligible, true);
    assert.equal(response.action, "NONE");
    assert.equal(response.rewardType, "PERCENTAGE_DISCOUNT");
    assert.equal(response.gift, null);
    assert.equal(response.autoAddGift, false);

    const widget = toWidgetStateResponse(eligible, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(widget.rewardType, "PERCENTAGE_DISCOUNT");
    assert.equal(widget.gift, null);
    assert.equal(toLegacyEvaluateCartAction(eligible), "NONE");
  });

  it("fixed discount → NONE action, null gift, FIXED_DISCOUNT rewardType + progress", () => {
    const row = campaignRow({
      campaignType: "Spend X -> Fixed Discount",
      fixedDiscountAmount: 100,
      giftProductId: "",
      giftVariantId: null,
      giftProductTitle: null,
    });
    const below = evaluate(row, THRESHOLD - 100);
    const belowResponse = toEvaluateCartResponse(below, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(belowResponse.eligible, false);
    assert.equal(belowResponse.action, "NONE");
    assert.equal(belowResponse.rewardType, "FIXED_DISCOUNT");
    assert.equal(belowResponse.gift, null);
    assert.ok((belowResponse.remaining ?? 0) > 0);

    const eligible = evaluate(row, THRESHOLD);
    const response = toEvaluateCartResponse(eligible, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(response.enabled, true);
    assert.equal(response.eligible, true);
    assert.equal(response.action, "NONE");
    assert.equal(response.rewardType, "FIXED_DISCOUNT");
    assert.equal(response.gift, null);
    assert.equal(response.autoAddGift, false);

    const widget = toWidgetStateResponse(eligible, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(widget.rewardType, "FIXED_DISCOUNT");
    assert.equal(widget.gift, null);
    assert.equal(toLegacyEvaluateCartAction(eligible), "NONE");
  });

  it("tiered free gifts → NONE action, unlockedGifts, nextTier, TIERED_FREE_GIFTS rewardType", () => {
    const row = campaignRow({
      campaignType: "Tiered Free Gifts",
      threshold: 50,
      giftProductId: "",
      giftVariantId: null,
      giftProductTitle: null,
      widgetSettings: {
        heading: "Custom unlock path {remaining}",
        description: "Merchant tier description",
        unlockedHeading: "Custom all unlocked!",
        unlockedDescription: "Merchant done copy",
        template: "Premium",
        barColor: "#111111",
        backgroundColor: "#FAFAFA",
        textColor: "#111111",
        borderRadius: 16,
        progressHeight: 12,
        widgetPadding: 16,
        buttonText: "Shop",
        cartProgressBar: {
          enabled: true,
          height: 6,
          borderRadius: 8,
          compact: true,
          bannerTitle: "Unlock Exclusive Rewards",
        },
      },
      rewardTiers: [
        {
          id: "t1",
          campaignId: 8,
          threshold: 50,
          thresholdMinor: null,
          giftProductId: "p1",
          giftProductTitle: "A",
          giftProductImage: null,
          giftVariantId: "101",
          position: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "t2",
          campaignId: 8,
          threshold: 100,
          thresholdMinor: null,
          giftProductId: "p2",
          giftProductTitle: "B",
          giftProductImage: null,
          giftVariantId: "102",
          position: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const below = evaluate(row, 40);
    const belowResponse = toEvaluateCartResponse(below, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(belowResponse.rewardType, "TIERED_FREE_GIFTS");
    assert.equal(belowResponse.action, "NONE");
    assert.equal(belowResponse.gift, null);
    assert.equal(belowResponse.unlockedGifts?.length, 0);
    assert.equal(belowResponse.nextTier?.threshold, 50);
    assert.match(belowResponse.heading || "", /Custom unlock path/i);

    const mid = evaluate(row, 100);
    const midResponse = toEvaluateCartResponse(mid, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(midResponse.eligible, true);
    assert.equal(midResponse.unlockedGifts?.length, 2);
    assert.equal(midResponse.nextTier, null);
    assert.equal(midResponse.remaining, 0);
    assert.match(midResponse.heading || "", /Custom all unlocked/i);

    const widget = toWidgetStateResponse(mid, {
      campaign: row,
      snapshot: toPromotionCampaignSnapshot(row),
      settings: appSettings,
    });
    assert.equal(widget.rewardType, "TIERED_FREE_GIFTS");
    assert.equal(widget.gift, null);
    assert.equal(widget.unlockedGifts?.length, 2);
    assert.match(widget.heading || "", /Custom all unlocked/i);
    assert.equal(widget.widgetSettings?.cartProgressBar?.bannerTitle, "Unlock Exclusive Rewards");
  });
});

describe("Phase 2C — subtotal source policy", () => {
  it("defaults to legacy caller subtotal when cart lines omit properties", () => {
    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 800,
      lines: [{ variantId: "1", quantity: 1, price: 500 }],
    });
    assert.equal(resolved.source, "legacy_caller_subtotal");
    assert.equal(resolved.subtotal, 800);
    assert.equal(
      canCalculateQualifyingSubtotalFromLines([{ variantId: "1", quantity: 1, price: 500 }]),
      false,
    );
  });

  it("calculates qualifying subtotal when lines include prices + properties", () => {
    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 9999,
      lines: [
        { variantId: "1", quantity: 1, price: 600, properties: {} },
        {
          variantId: "11",
          quantity: 1,
          price: 100,
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "8" },
        },
      ],
    });
    assert.equal(resolved.source, "calculated_from_cart_lines");
    assert.equal(resolved.subtotal, 600);
  });
});
