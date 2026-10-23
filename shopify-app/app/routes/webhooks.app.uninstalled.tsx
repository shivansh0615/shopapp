import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhookLifecycle } from "../shopify.server";
import { handleAppUninstalled } from "../services/webhooks.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticateWebhookLifecycle(request);
  // Never put a Shopify Admin API round trip on the webhook response path.
  // Shopify revokes app access during uninstall, so local cleanup is the only
  // reliable operation to finish before acknowledging the delivery.
  await handleAppUninstalled(shop);
  return new Response();
};
