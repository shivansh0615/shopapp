import { createHmac, timingSafeEqual } from "node:crypto";

type WebhookIdentity = {
  shop: string;
  topic: string;
};

type WebhookAuthentication = WebhookIdentity & {
  session?: unknown;
};

type WebhookAuthenticator<T extends WebhookAuthentication> = (
  request: Request,
) => Promise<T>;

const SHOPIFY_DOMAIN_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.myshopify\.com$/i;

function unauthorized(message: string) {
  return new Response(message, { status: 401 });
}

function verifyWebhookHmac(
  body: Buffer,
  providedHmac: string | null,
  secret: string,
) {
  if (!providedHmac || !secret) return false;

  const expected = createHmac("sha256", secret).update(body).digest();
  const actual = Buffer.from(providedHmac.trim(), "base64");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function payloadShop(body: Buffer) {
  try {
    const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    const value = payload.shop_domain ?? payload.myshopify_domain;
    return typeof value === "string" ? value.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Authenticate a Shopify webhook while working around the current SDK failure
 * mode for lifecycle webhooks delivered after an offline token has expired.
 *
 * The SDK remains the primary authenticator. The fallback runs only when the
 * SDK throws HTTP 500 and independently verifies the raw request HMAC before
 * returning the signed shop and topic headers. It does not create a session or
 * call Shopify, so uninstall and privacy cleanup can finish after access has
 * already been revoked.
 */
export async function authenticateLifecycleWebhook<
  T extends WebhookAuthentication,
>(
  request: Request,
  authenticateWebhook: WebhookAuthenticator<T>,
  secret: string,
): Promise<T | (WebhookIdentity & { session: undefined })> {
  const fallbackRequest = request.clone();

  try {
    return await authenticateWebhook(request);
  } catch (error) {
    if (!(error instanceof Response) || error.status !== 500) throw error;

    const body = Buffer.from(await fallbackRequest.arrayBuffer());
    if (
      !verifyWebhookHmac(
        body,
        fallbackRequest.headers.get("X-Shopify-Hmac-Sha256"),
        secret,
      )
    ) {
      throw unauthorized("Invalid Shopify webhook signature");
    }

    const shop = fallbackRequest.headers
      .get("X-Shopify-Shop-Domain")
      ?.trim()
      .toLowerCase();
    const topic = fallbackRequest.headers.get("X-Shopify-Topic")?.trim();

    // A valid HMAC without a usable identity is still not safe to acknowledge.
    // Preserve the original 500 so Shopify retries instead of losing cleanup.
    if (!shop || !SHOPIFY_DOMAIN_PATTERN.test(shop) || !topic) throw error;

    const signedPayloadShop = payloadShop(body);
    if (signedPayloadShop && signedPayloadShop !== shop) {
      throw unauthorized("Shopify webhook shop mismatch");
    }

    console.warn("[webhook-auth] Using sessionless lifecycle fallback", {
      shop,
      topic,
    });

    return { shop, topic, session: undefined };
  }
}
