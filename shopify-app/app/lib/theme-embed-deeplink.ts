/**
 * Theme editor links.
 *
 * The embed link opens App embeds and leaves the switch off. Shopify's
 * activateAppId parameter turns the embed on, so merchant links do not send it.
 * api_key is the running app's client_id (SHOPIFY_API_KEY), not the client secret
 * and not the extension uid in shopify.extension.toml.
 *
 * The block handle is the Liquid filename without .liquid.
 */

/** blocks/free-gift-embed.liquid */
export const THEME_APP_EMBED_BLOCK_HANDLE = "free-gift-embed";

/** blocks/free-gift-progress-bar.liquid — product template app block, not the body embed. */
export const THEME_APP_PRODUCT_BLOCK_HANDLE = "free-gift-progress-bar";

export function normalizeMyshopifyShopDomain(shop: string): string {
  const trimmed = String(shop || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (!trimmed) {
    throw new Error("Shop domain is required for the theme editor deep link.");
  }
  if (!trimmed.endsWith(".myshopify.com")) {
    throw new Error(
      `Theme editor deep link requires a .myshopify.com shop domain (got "${trimmed}").`,
    );
  }
  if (trimmed.includes("/") || trimmed.includes(" ")) {
    throw new Error(`Invalid shop domain for theme editor deep link: "${trimmed}".`);
  }
  return trimmed;
}

export function buildActivateAppId(
  apiKey: string,
  blockHandle: string = THEME_APP_EMBED_BLOCK_HANDLE,
): string {
  const key = String(apiKey || "").trim();
  const handle = String(blockHandle || "").trim();
  if (!key || !handle) {
    throw new Error("App client id and block handle are required.");
  }
  if (key.includes("/") || handle.includes("/")) {
    throw new Error("App client id and block handle must not contain '/'.");
  }
  return `${key}/${handle}`;
}

/**
 * Theme editor URL that opens App embeds. The merchant turns UpsellTrix on and saves.
 * Shop domain comes from the authenticated shop. Client id is checked so a
 * misconfigured app does not build a link, and it is not sent as activateAppId.
 */
export function buildThemeAppEmbedDeepLink(input: {
  shop: string;
  apiKey: string;
  blockHandle?: string;
  /** Optional Liquid template hint. Omit it to open the theme homepage. */
  template?: string;
}): string {
  const shop = normalizeMyshopifyShopDomain(input.shop);
  buildActivateAppId(input.apiKey, input.blockHandle ?? THEME_APP_EMBED_BLOCK_HANDLE);

  const params = new URLSearchParams();
  params.set("context", "apps");
  if (input.template) {
    params.set("template", input.template);
  }

  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
}

/**
 * Theme editor URL that adds the product-page app block to the main section.
 * Shopify's documented target for the section with id "main" is mainSection.
 */
export function buildThemeAppBlockDeepLink(input: {
  shop: string;
  apiKey: string;
  blockHandle?: string;
  template?: string;
}): string {
  const shop = normalizeMyshopifyShopDomain(input.shop);
  const addAppBlockId = buildActivateAppId(
    input.apiKey,
    input.blockHandle ?? THEME_APP_PRODUCT_BLOCK_HANDLE,
  );
  const params = new URLSearchParams();
  params.set("template", input.template?.trim() || "product");
  params.set("addAppBlockId", addAppBlockId);
  params.set("target", "mainSection");
  return `https://${shop}/admin/themes/current/editor?${params.toString()}`;
}

export type PublishedThemeEmbedStatus = "active" | "available" | "unavailable" | "missing";

export type ThemeExtensionRecord = {
  type?: string;
  activations?: Array<{ handle?: string; status?: string }>;
};

/** Published-theme status from shopify.app.extensions(). Draft previews are not included. */
export function readPublishedThemeEmbedStatus(
  extensions: ThemeExtensionRecord[] | null | undefined,
  blockHandle: string = THEME_APP_EMBED_BLOCK_HANDLE,
): PublishedThemeEmbedStatus {
  if (!Array.isArray(extensions)) throw new Error("Invalid extension status response.");
  if (extensions.some((extension) => !extension || typeof extension.type !== "string")) {
    throw new Error("Invalid extension record.");
  }
  const blocks = extensions
    .filter((extension) => extension?.type === "theme_app_extension")
    .flatMap((extension) => {
      if (!Array.isArray(extension.activations)) throw new Error("Incomplete theme extension status response.");
      if (extension.activations.some((block) => !block || typeof block.handle !== "string" || typeof block.status !== "string")) {
        throw new Error("Invalid theme activation record.");
      }
      return extension.activations;
    });
  const embed = blocks.find((block) => block?.handle === blockHandle);
  if (!embed) return "missing";
  if (embed.status === "active" || embed.status === "available" || embed.status === "unavailable") {
    return embed.status;
  }
  throw new Error("Unknown embed activation status.");
}
