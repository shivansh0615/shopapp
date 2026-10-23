import * as analyticsRepository from "../repositories/analytics.repository";
import type { AnalyticsDb } from "../repositories/analytics.repository";
import type { Prisma } from "@prisma/client";
import { AppError } from "../lib/errors.server";

export const ANALYTICS_EVENT_TYPES = {
  WIDGET_IMPRESSION: "widget_impression",
  GIFT_UNLOCKED: "gift_unlocked",
  GIFT_ADDED: "gift_added",
  ORDER_INFLUENCED: "order_influenced",
} as const;

export type AnalyticsEventType =
  (typeof ANALYTICS_EVENT_TYPES)[keyof typeof ANALYTICS_EVENT_TYPES];

export type AnalyticsEventBase = {
  eventType: AnalyticsEventType;
  shop: string;
  campaignId: number;
  timestamp: string;
  persisted: boolean;
};

export type WidgetImpressionEvent = AnalyticsEventBase & {
  eventType: typeof ANALYTICS_EVENT_TYPES.WIDGET_IMPRESSION;
};

export type GiftUnlockedEvent = AnalyticsEventBase & {
  eventType: typeof ANALYTICS_EVENT_TYPES.GIFT_UNLOCKED;
  cartSubtotal: number;
};

export type GiftAddedEvent = AnalyticsEventBase & {
  eventType: typeof ANALYTICS_EVENT_TYPES.GIFT_ADDED;
  giftProductId: string;
};

export type OrderInfluencedEvent = AnalyticsEventBase & {
  eventType: typeof ANALYTICS_EVENT_TYPES.ORDER_INFLUENCED;
  orderId: string;
  revenue: number;
};

export type AnalyticsEvent =
  | WidgetImpressionEvent
  | GiftUnlockedEvent
  | GiftAddedEvent
  | OrderInfluencedEvent;

export type AnalyticsSummary = {
  revenueGenerated: number;
  giftsUnlocked: number;
  giftsAdded: number;
  influencedOrders: number;
};

export type TrackWidgetImpressionInput = {
  shop: string;
  campaignId: number;
};

export type TrackGiftUnlockedInput = {
  shop: string;
  campaignId: number;
  cartSubtotal: number;
};

export type TrackGiftAddedInput = {
  shop: string;
  campaignId: number;
  giftProductId: string;
};

export type TrackOrderInfluencedInput = {
  shop: string;
  campaignId: number;
  orderId: string;
  revenue: number;
};

function createEventTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

export function requireShop(shop: string): string {
  const normalizedShop = shop?.trim();
  if (!normalizedShop) {
    throw new AppError({
      code: "SHOP_REQUIRED",
      message: "Shop is required.",
      errorClass: "validation",
    });
  }
  return normalizedShop;
}

export function requireCampaignId(campaignId: number): number {
  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    throw new AppError({
      code: "CAMPAIGN_ID_INVALID",
      message: "Campaign ID is required.",
      errorClass: "validation",
    });
  }
  return Math.trunc(campaignId);
}

export function requireNonNegativeNumber(
  value: number,
  fieldName: string,
): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new AppError({
      code: "INVALID_NUMBER",
      message: `${fieldName} must be a valid non-negative number.`,
      errorClass: "validation",
    });
  }
  return value;
}

export function requireNonEmptyString(value: string, fieldName: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new AppError({
      code: "REQUIRED_STRING",
      message: `${fieldName} is required.`,
      errorClass: "validation",
    });
  }
  return normalized;
}

export function createAnalyticsEventBase(input: {
  eventType: AnalyticsEventType;
  shop: string;
  campaignId: number;
  timestamp?: string;
}): AnalyticsEventBase {
  return {
    eventType: input.eventType,
    shop: requireShop(input.shop),
    campaignId: requireCampaignId(input.campaignId),
    timestamp: input.timestamp ?? createEventTimestamp(),
    persisted: false,
  };
}

async function persistEvent(
  shop: string,
  campaignId: number,
  eventType: AnalyticsEventType,
  payload: Prisma.InputJsonValue = {},
  client?: AnalyticsDb,
): Promise<void> {
  await analyticsRepository.createAnalyticsEvent(
    {
      shop,
      campaignId,
      eventType,
      payload,
    },
    client,
  );
}

export async function trackWidgetImpression(
  input: TrackWidgetImpressionInput,
  client?: AnalyticsDb,
): Promise<WidgetImpressionEvent> {
  const shop = requireShop(input.shop);
  const campaignId = requireCampaignId(input.campaignId);
  await persistEvent(
    shop,
    campaignId,
    ANALYTICS_EVENT_TYPES.WIDGET_IMPRESSION,
    {},
    client,
  );
  return {
    ...createAnalyticsEventBase({
      eventType: ANALYTICS_EVENT_TYPES.WIDGET_IMPRESSION,
      shop,
      campaignId,
    }),
    eventType: ANALYTICS_EVENT_TYPES.WIDGET_IMPRESSION,
    persisted: true,
  };
}

export async function trackGiftUnlocked(
  input: TrackGiftUnlockedInput,
  client?: AnalyticsDb,
): Promise<GiftUnlockedEvent> {
  const shop = requireShop(input.shop);
  const campaignId = requireCampaignId(input.campaignId);
  const cartSubtotal = requireNonNegativeNumber(input.cartSubtotal, "Cart subtotal");
  await persistEvent(
    shop,
    campaignId,
    ANALYTICS_EVENT_TYPES.GIFT_UNLOCKED,
    { cartSubtotal },
    client,
  );
  return {
    ...createAnalyticsEventBase({
      eventType: ANALYTICS_EVENT_TYPES.GIFT_UNLOCKED,
      shop,
      campaignId,
    }),
    eventType: ANALYTICS_EVENT_TYPES.GIFT_UNLOCKED,
    cartSubtotal,
    persisted: true,
  };
}

export async function trackGiftAdded(
  input: TrackGiftAddedInput,
  client?: AnalyticsDb,
): Promise<GiftAddedEvent> {
  const shop = requireShop(input.shop);
  const campaignId = requireCampaignId(input.campaignId);
  const giftProductId = requireNonEmptyString(input.giftProductId, "Gift product ID");
  await persistEvent(
    shop,
    campaignId,
    ANALYTICS_EVENT_TYPES.GIFT_ADDED,
    { giftProductId },
    client,
  );
  return {
    ...createAnalyticsEventBase({
      eventType: ANALYTICS_EVENT_TYPES.GIFT_ADDED,
      shop,
      campaignId,
    }),
    eventType: ANALYTICS_EVENT_TYPES.GIFT_ADDED,
    giftProductId,
    persisted: true,
  };
}

export async function trackOrderInfluenced(
  input: TrackOrderInfluencedInput,
  client?: AnalyticsDb,
): Promise<OrderInfluencedEvent> {
  const shop = requireShop(input.shop);
  const campaignId = requireCampaignId(input.campaignId);
  const orderId = requireNonEmptyString(input.orderId, "Order ID");
  const revenue = requireNonNegativeNumber(input.revenue, "Revenue");
  await persistEvent(
    shop,
    campaignId,
    ANALYTICS_EVENT_TYPES.ORDER_INFLUENCED,
    { orderId, revenue },
    client,
  );
  return {
    ...createAnalyticsEventBase({
      eventType: ANALYTICS_EVENT_TYPES.ORDER_INFLUENCED,
      shop,
      campaignId,
    }),
    eventType: ANALYTICS_EVENT_TYPES.ORDER_INFLUENCED,
    orderId,
    revenue,
    persisted: true,
  };
}

export async function getAnalyticsSummary(
  shop: string,
  client?: AnalyticsDb,
): Promise<AnalyticsSummary> {
  const normalized = requireShop(shop);
  const [giftsUnlocked, giftsAdded, influencedOrders, revenueGenerated] =
    await Promise.all([
      analyticsRepository.countEventsByType(
        normalized,
        ANALYTICS_EVENT_TYPES.GIFT_UNLOCKED,
        client,
      ),
      analyticsRepository.countEventsByType(
        normalized,
        ANALYTICS_EVENT_TYPES.GIFT_ADDED,
        client,
      ),
      analyticsRepository.countEventsByType(
        normalized,
        ANALYTICS_EVENT_TYPES.ORDER_INFLUENCED,
        client,
      ),
      analyticsRepository.sumRevenueFromOrders(normalized, client),
    ]);

  return {
    revenueGenerated,
    giftsUnlocked,
    giftsAdded,
    influencedOrders,
  };
}

/** Gifts the storefront actually added. Orders are not included. */
export async function getFreeGiftsAddedCount(
  shop: string,
  client?: AnalyticsDb,
): Promise<number> {
  return analyticsRepository.countEventsByType(
    requireShop(shop),
    ANALYTICS_EVENT_TYPES.GIFT_ADDED,
    client,
  );
}
