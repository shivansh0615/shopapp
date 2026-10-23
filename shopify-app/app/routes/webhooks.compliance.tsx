import type { ActionFunctionArgs } from "react-router";
import { authenticateWebhookLifecycle } from "../shopify.server";
import {
  handleCustomerComplianceTopic,
  handleShopRedact,
  normalizeComplianceTopic,
} from "../services/webhooks.server";

/**
 * Mandatory privacy / GDPR compliance webhooks.
 * The framework performs primary authentication. The lifecycle fallback also
 * verifies the raw-body HMAC before allowing sessionless privacy cleanup.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticateWebhookLifecycle(request);
  const normalized = normalizeComplianceTopic(topic);

  switch (normalized) {
    case "CUSTOMERS_DATA_REQUEST":
      await handleCustomerComplianceTopic({
        shop,
        topic: "customers/data_request",
      });
      break;
    case "CUSTOMERS_REDACT":
      await handleCustomerComplianceTopic({
        shop,
        topic: "customers/redact",
      });
      break;
    case "SHOP_REDACT":
      await handleShopRedact(shop);
      break;
    default:
      console.info("[compliance]", {
        topic: normalized || topic || null,
        shop: shop || null,
        ignored: true,
      });
      break;
  }

  return new Response();
};
