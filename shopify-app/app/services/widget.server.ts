import { unauthenticated } from "../shopify.server";
import { filterSellableRecommendationProducts } from "./shopify-admin.server";
import { buildWidgetStateProxyResponse } from "./proxy-evaluation.server";
import type { StorefrontWidgetStateResponse } from "../lib/storefront-contract";
export type { StorefrontWidgetStateResponse } from "../lib/storefront-contract";
export { mergeWidgetSettings, resolveWidgetColors } from "./widget-presentation.server";


export async function getStorefrontWidgetState(
  shop: string,
  request: Request,
): Promise<StorefrontWidgetStateResponse> {
  const response = await buildWidgetStateProxyResponse(shop, request);

  const recs = response.widgetSettings?.cartRecommendations;
  if (!recs?.enabled || !Array.isArray(recs.products) || !recs.products.length) {
    return response;
  }

  try {
    const { admin } = await unauthenticated.admin(shop);
    const sellable = await filterSellableRecommendationProducts(admin, recs.products);
    return {
      ...response,
      widgetSettings: {
        ...response.widgetSettings,
        cartRecommendations: {
          ...recs,
          products: sellable,
        },
      },
    };
  } catch (error) {
    console.error("[getStorefrontWidgetState] recommendation availability filter failed:", error);
    return response;
  }
}
