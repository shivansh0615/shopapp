import type { LoaderFunctionArgs } from "react-router";
import { authenticateAdmin } from "../shopify.server";
import { getStorefrontWidgetState } from "../services/widget.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticateAdmin(request);
  const widgetState = await getStorefrontWidgetState(session.shop, request);
  return Response.json(widgetState);
};
