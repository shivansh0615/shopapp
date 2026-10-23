import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  handleProxyRouteFailure,
  proxyDisabledPayload,
  readProxyShop,
} from "../lib/proxy-route.server";
import { getStorefrontWidgetState } from "../services/widget.server";
import { touchWidgetStateSeen } from "../services/shop-integration.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const route = "widget-state" as const;
  let shop = "";
  let campaignId: number | null = null;

  try {
    const context = await authenticate.public.appProxy(request);
    shop = readProxyShop(request, context.session?.shop);

    if (!shop) {
      return Response.json(proxyDisabledPayload(route), { status: 400 });
    }

    const widgetState = await getStorefrontWidgetState(shop, request);
    campaignId = widgetState.campaignId;

    // Best-effort storefront heartbeat for merchant onboarding status.
    // Never fail widget-state if status persistence errors.
    void touchWidgetStateSeen(shop).catch(() => {});

    return Response.json(widgetState, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    return handleProxyRouteFailure(route, error, {
      request,
      shop,
      campaignId,
    });
  }
};
