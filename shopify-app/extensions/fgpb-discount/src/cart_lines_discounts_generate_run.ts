import { chooseCartCampaign } from "../../../shared/campaign-policy";
import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
} from "../generated/api";
import {
  canonicalizeDiscountConfig,
  calculateFunctionQualifyingSubtotal,
  evaluateFixedDiscounts,
  evaluatePercentageDiscounts,
  evaluateTaggedGiftDiscounts,
  mapCartLineFromInput,
  parseDiscountConfig,
  type FunctionCartLineInput,
  type PercentageDiscountLineTarget,
} from "./discount-engine";

type CartLinesDiscountsGenerateRunInput = {
  presentmentCurrencyRate?: string | number | null;
  cart: {
    cost?: {
      subtotalAmount?: { amount?: string | null } | null;
    } | null;
    lines: FunctionCartLineInput[];
  };
  discount: {
    discountClasses: DiscountClass[];
    metafield?: {
      jsonValue?: unknown;
    } | null;
  };
};

type ProductDiscountCandidate = {
  message: string;
  targets: Array<{ cartLine: { id: string; quantity: number } }>;
  value:
    | { percentage: { value: string }; fixedAmount?: never }
    | {
        fixedAmount: { amount: string; appliesToEachItem: boolean };
        percentage?: never;
      };
};

const EMPTY_RESULT = { operations: [] as const };

function parseCartSubtotal(input: CartLinesDiscountsGenerateRunInput): number | null {
  const raw = input.cart.cost?.subtotalAmount?.amount;
  if (raw == null) return null;
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function parsePresentmentRate(input: CartLinesDiscountsGenerateRunInput): number {
  const rate = Number(input.presentmentCurrencyRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 1;
}

function groupPercentageTargets(targets: PercentageDiscountLineTarget[]) {
  const byPercentage = new Map<number, PercentageDiscountLineTarget[]>();
  for (const target of targets) {
    const list = byPercentage.get(target.percentage) ?? [];
    list.push(target);
    byPercentage.set(target.percentage, list);
  }
  return byPercentage;
}

function formatFixedAmount(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function formatFixedMessage(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded} OFF` : `${rounded.toFixed(2)} OFF`;
}

/**
 * Resolve the cart winner before computing discount targets. Legacy configs retain their stored winner.
 * Never uses ProductDiscountSelectionStrategy.All to stack campaigns.
 */
export function cartLinesDiscountsGenerateRun(input: CartLinesDiscountsGenerateRunInput) {
  const hasProductDiscountClass = input.discount.discountClasses.includes(DiscountClass.Product);
  if (!hasProductDiscountClass) {
    return EMPTY_RESULT;
  }

  const parsed = parseDiscountConfig(input.discount.metafield?.jsonValue);
  if (!parsed) {
    return EMPTY_RESULT;
  }

  let config = canonicalizeDiscountConfig(parsed);
  if (!config.activeCampaigns.length) {
    return EMPTY_RESULT;
  }

  const lines = input.cart.lines.map(mapCartLineFromInput);
  const cartSubtotal = parseCartSubtotal(input);
  const presentmentCurrencyRate = parsePresentmentRate(input);
  if (config.selectionPolicy === "ELIGIBILITY_FIRST") {
    const winner = chooseCartCampaign(config.activeCampaigns,
      calculateFunctionQualifyingSubtotal({ lines, cartSubtotal }), presentmentCurrencyRate);
    config = { ...config, activeCampaigns: winner ? [winner] : [] };
  }
  const giftEvaluation = evaluateTaggedGiftDiscounts({
    lines,
    config,
    cartSubtotal,
    presentmentCurrencyRate,
  });
  const percentageEvaluation = evaluatePercentageDiscounts({
    lines,
    config,
    cartSubtotal,
    presentmentCurrencyRate,
  });
  const fixedEvaluation = evaluateFixedDiscounts({
    lines,
    config,
    cartSubtotal,
    presentmentCurrencyRate,
  });

  const candidates: ProductDiscountCandidate[] = [];

  if (giftEvaluation.targets.length > 0) {
    candidates.push({
      message: "FREE GIFT",
      targets: giftEvaluation.targets.map((target) => ({
        cartLine: {
          id: target.cartLineId,
          quantity: target.quantity,
        },
      })),
      value: {
        percentage: {
          value: "100",
        },
      },
    });
  }

  for (const [percentage, targets] of groupPercentageTargets(percentageEvaluation.targets)) {
    candidates.push({
      message: `${percentage}% OFF`,
      targets: targets.map((target) => ({
        cartLine: {
          id: target.cartLineId,
          quantity: target.quantity,
        },
      })),
      value: {
        percentage: {
          value: String(percentage),
        },
      },
    });
  }

  if (fixedEvaluation.targets.length > 0 && fixedEvaluation.amount > 0) {
    candidates.push({
      message: formatFixedMessage(fixedEvaluation.amount),
      targets: fixedEvaluation.targets.map((target) => ({
        cartLine: {
          id: target.cartLineId,
          quantity: target.quantity,
        },
      })),
      value: {
        fixedAmount: {
          amount: formatFixedAmount(fixedEvaluation.amount),
          appliesToEachItem: false,
        },
      },
    });
  }

  if (!candidates.length) {
    return EMPTY_RESULT;
  }

  // Single winning campaign → at most one reward class of candidates.
  // Always First — never All (no stacking).
  return {
    operations: [
      {
        productDiscountsAdd: {
          selectionStrategy: ProductDiscountSelectionStrategy.First,
          candidates,
        },
      },
    ],
  };
}
