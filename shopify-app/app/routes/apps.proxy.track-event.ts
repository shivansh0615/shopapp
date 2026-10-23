import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  ANALYTICS_EVENT_TYPES,
  trackGiftAdded,
  trackGiftUnlocked,
  trackWidgetImpression,
} from "../services/analytics.server";
import { AppError } from "../lib/errors.server";
import { handleProxyRouteFailure, readProxyShop } from "../lib/proxy-route.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const route = "track-event" as const;
  let shop = "";

  try {
    const context = await authenticate.public.appProxy(request);
    shop = readProxyShop(request, context.session?.shop);
    if (!shop) {
      return Response.json({ ok: false, error: "Shop required" }, { status: 400 });
    }

    const body = (await request.json()) as {
      eventType?: string;
      campaignId?: number;
      cartSubtotal?: number;
      giftProductId?: string;
    };

    const campaignId = Number(body.campaignId);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return Response.json({ ok: false, error: "Campaign ID required" }, { status: 400 });
    }

    switch (body.eventType) {
      case ANALYTICS_EVENT_TYPES.WIDGET_IMPRESSION:
        await trackWidgetImpression({ shop, campaignId });
        break;
      case ANALYTICS_EVENT_TYPES.GIFT_UNLOCKED:
        await trackGiftUnlocked({
          shop,
          campaignId,
          cartSubtotal: Number(body.cartSubtotal) || 0,
        });
        break;
      case ANALYTICS_EVENT_TYPES.GIFT_ADDED:
        await trackGiftAdded({
          shop,
          campaignId,
          giftProductId: String(body.giftProductId || ""),
        });
        break;
      default:
        return Response.json({ ok: false, error: "Unsupported event type" }, { status: 400 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AppError && error.errorClass === "validation") {
      return Response.json({ ok: false, error: error.message }, { status: 400 });
    }
    return handleProxyRouteFailure(route, error, { request, shop, campaignId: null });
  }
};
