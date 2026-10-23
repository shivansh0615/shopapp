/**
 * Canonical Promotion Engine types (Phase 2 foundation).
 *
 * Gift property contract (DO NOT CHANGE existing keys):
 * - `_fgpb_free_gift` = "true"
 * - `_fgpb_campaign_id` = campaign id string
 * - `_fgpb_tier_id` = tier id string (Tiered Free Gifts only)
 */

/** Integer minor units (e.g. paise). Prefer this for comparisons. */
export type MoneyMinor = number;

export type CanonicalCartLine = {
  lineKey?: string;
  productId?: string;
  variantId: string;
  quantity: number;
  /** Unit or line price in major currency units (current storefront/server convention). */
  price?: number;
  finalLinePrice?: number;
  properties?: Record<string, string>;
  collectionIds?: string[];
};

export type CanonicalCart = {
  /** Paid qualifying subtotal in major units (gift lines excluded by caller when required). */
  subtotal: number;
  currencyCode?: string;
  lines: CanonicalCartLine[];
};

export type CartSubtotalRule = {
  type: "CART_SUBTOTAL";
  minimumAmount: number;
};

export type ProductQuantityRule = {
  type: "PRODUCT_QUANTITY";
  productIds: string[];
  minimumQuantity: number;
};

export type CollectionQuantityRule = {
  type: "COLLECTION_QUANTITY";
  collectionIds: string[];
  minimumQuantity: number;
};

/** Phase 2 only implements CART_SUBTOTAL for live Free Gift. Others are typed stubs. */
export type PromotionRule = CartSubtotalRule | ProductQuantityRule | CollectionQuantityRule;

export type FreeGiftReward = {
  type: "FREE_GIFT";
  campaignId: string;
  productId?: string;
  variantId: string;
  quantity: 1;
};

export type PercentageDiscountReward = {
  type: "PERCENTAGE_DISCOUNT";
  campaignId: string;
  /** Integer 1–100. */
  percentage: number;
};

export type FixedDiscountReward = {
  type: "FIXED_DISCOUNT";
  campaignId: string;
  /** Fixed currency amount in major units (> 0). */
  amount: number;
};

export type TieredUnlockedGift = {
  tierId: string;
  threshold: number;
  productId?: string;
  variantId: string;
  quantity: 1;
};

export type TieredNextTier = {
  tierId: string;
  threshold: number;
  remaining: number;
  productId?: string;
  variantId: string;
};

export type TieredFreeGiftsReward = {
  type: "TIERED_FREE_GIFTS";
  campaignId: string;
  unlockedGifts: TieredUnlockedGift[];
  nextTier?: TieredNextTier | null;
};

export type PromotionReward =
  | FreeGiftReward
  | PercentageDiscountReward
  | FixedDiscountReward
  | TieredFreeGiftsReward;

export type PromotionProgress = {
  current: number;
  target: number;
  remaining: number;
  percentage: number;
  unlocked: boolean;
};

export type PromotionPresentation = {
  progress?: PromotionProgress;
  widgetSettings?: Record<string, unknown>;
};

export type FreeGiftLineProperties = {
  _fgpb_free_gift: "true";
  _fgpb_campaign_id: string;
  _fgpb_tier_id?: string;
};

export type AddFreeGiftAction = {
  type: "ADD_FREE_GIFT";
  campaignId: string;
  variantId: string;
  quantity: 1;
  tierId?: string;
  properties: FreeGiftLineProperties;
};

export type RemoveFreeGiftAction = {
  type: "REMOVE_FREE_GIFT";
  campaignId: string;
  tierId?: string;
  lineKeys?: string[];
};

export type NormalizeFreeGiftQuantityAction = {
  type: "NORMALIZE_FREE_GIFT_QUANTITY";
  campaignId: string;
  tierId?: string;
  lineKey?: string;
  quantity: 1;
};

export type ApplyPercentageDiscountAction = {
  type: "APPLY_PERCENTAGE_DISCOUNT";
  campaignId: string;
  percentage: number;
};

export type ApplyFixedDiscountAction = {
  type: "APPLY_FIXED_DISCOUNT";
  campaignId: string;
  amount: number;
};

export type NoAction = {
  type: "NO_ACTION";
};

export type PromotionAction =
  | AddFreeGiftAction
  | RemoveFreeGiftAction
  | NormalizeFreeGiftQuantityAction
  | ApplyPercentageDiscountAction
  | ApplyFixedDiscountAction
  | NoAction;

export type PromotionDiagnosticCode =
  | "ELIGIBLE"
  | "THRESHOLD_NOT_MET"
  | "CAMPAIGN_DISABLED"
  | "NOT_STARTED"
  | "EXPIRED"
  | "UNSUPPORTED_CAMPAIGN_TYPE"
  | "GIFT_ALREADY_PRESENT"
  | "GIFT_SHOULD_BE_ADDED"
  | "GIFT_SHOULD_BE_REMOVED"
  | "DUPLICATE_GIFT_LINES"
  | "GIFT_QUANTITY_INVALID"
  | "INVALID_CAMPAIGN_CONFIGURATION"
  | "NO_ACTIVE_CAMPAIGN";

export type PromotionDiagnostic = {
  code: PromotionDiagnosticCode;
  message?: string;
};

export type CanonicalRewardTier = {
  id: string;
  threshold: number;
  giftProductId?: string | null;
  giftVariantId: string;
  position: number;
};

/**
 * Live campaignType strings map via campaign-types.ts → registry evaluators.
 */
export type CanonicalCampaign = {
  id: string;
  type: string;
  status: string;
  priority?: number;
  startDate?: Date | null;
  endDate?: Date | null;
  rules: PromotionRule[];
  rewards: PromotionReward[];
  presentation?: PromotionPresentation;
  /** Legacy fields still required for adapters. */
  threshold?: number;
  giftVariantId?: string | null;
  giftProductId?: string;
  giftQuantity?: number;
  /** 1–100 for percentage discount campaigns. */
  discountPercentage?: number | null;
  /** Fixed amount (> 0) for fixed discount campaigns. */
  fixedDiscountAmount?: number | null;
  /** Ordered tiers for Tiered Free Gifts. */
  rewardTiers?: CanonicalRewardTier[];
  ruleType?: string;
  widgetSettings?: Record<string, unknown> | null;
};

export type EvaluationInput = {
  campaign: CanonicalCampaign;
  cart: CanonicalCart;
  now: Date;
};

export type PromotionEvaluationResult = {
  campaignId: string;
  campaignType: string;
  active: boolean;
  supported: boolean;
  eligible: boolean;
  diagnostic: PromotionDiagnostic;
  progress?: PromotionProgress;
  rewards: PromotionReward[];
  actions: PromotionAction[];
  presentation: PromotionPresentation;
};

export type CampaignEvaluator = {
  type: string;
  evaluate(input: EvaluationInput): PromotionEvaluationResult;
};
