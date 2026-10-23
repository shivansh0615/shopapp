import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  handleProxyRouteFailure,
  proxyDisabledPayload,
  readProxyShop,
} from "../lib/proxy-route.server";
import { buildEvaluateCartProxyResponse } from "../services/proxy-evaluation.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const route = "evaluate-cart" as const;
  let shop = "";
  let campaignId: number | null = null;

  try {
    const context = await authenticate.public.appProxy(request);
    shop = readProxyShop(request, context.session?.shop);

    if (!shop) {
      return Response.json(proxyDisabledPayload(route), { status: 400 });
    }

    const payload = await buildEvaluateCartProxyResponse(shop, request);
    campaignId = payload.campaign?.id ?? null;
    return Response.json(payload, {
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
