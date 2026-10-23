import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  THEME_APP_EMBED_BLOCK_HANDLE,
  buildActivateAppId,
  buildThemeAppEmbedDeepLink,
  normalizeMyshopifyShopDomain,
  readPublishedThemeEmbedStatus,
} from "./theme-embed-deeplink";

const API_KEY = "b335d11311bf491819d273532508a56b";

describe("theme embed deep link", () => {
  it("composes activateAppId from the app client id and block filename", () => {
    const id = buildActivateAppId(API_KEY);
    assert.equal(id, `${API_KEY}/${THEME_APP_EMBED_BLOCK_HANDLE}`);
    assert.equal(id.includes("bc15044b"), false);
  });

  it("URL-encodes activateAppId so the slash is percent-encoded", () => {
    const url = buildThemeAppEmbedDeepLink({
      shop: "newish-9013.myshopify.com",
      apiKey: API_KEY,
    });
    assert.match(
      url,
      /^https:\/\/newish-9013\.myshopify\.com\/admin\/themes\/current\/editor\?/,
    );
    assert.match(url, /context=apps/);
    assert.equal(url.includes("template="), false);
    const encoded = encodeURIComponent(`${API_KEY}/${THEME_APP_EMBED_BLOCK_HANDLE}`);
    assert.ok(url.includes(`activateAppId=${encoded}`));
    assert.equal(url.includes(`${API_KEY}/`), false);
  });

  it("accepts shop domains with protocol and strips it", () => {
    const shop = normalizeMyshopifyShopDomain("https://Demo-Shop.myshopify.com/");
    assert.equal(shop, "demo-shop.myshopify.com");
  });

  it("rejects non-myshopify domains and store-handle-only values", () => {
    assert.throws(() => normalizeMyshopifyShopDomain("newish-9013"), /myshopify\.com/);
    assert.throws(() => normalizeMyshopifyShopDomain(""), /required/);
  });

  it("rejects a missing client id instead of building a broken embed link", () => {
    assert.throws(() => buildActivateAppId(""), /client id/);
  });

  it("targets the configured production app and an existing embed block", () => {
    const config = readFileSync(new URL("../../shopify.app.production.toml", import.meta.url), "utf8");
    const clientId = config.match(/^client_id\s*=\s*"([^"]+)"/m)?.[1];
    assert.ok(clientId, "production configuration must identify its app");
    const url = new URL(buildThemeAppEmbedDeepLink({
      shop: "newish-app-test.myshopify.com",
      apiKey: clientId,
    }));
    assert.equal(url.searchParams.get("activateAppId"), `${clientId}/free-gift-embed`);
    const block = readFileSync(new URL(
      "../../extensions/free-gift-progress-bar/blocks/free-gift-embed.liquid",
      import.meta.url,
    ), "utf8");
    const schema = JSON.parse(block.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/)?.[1] ?? "{}");
    assert.equal(schema.target, "body", "the destination must be an embed, not a section block");
  });

  it("does not reuse a production identifier for a different running app", () => {
    const developmentClientId = "38f760e2b4436ea157c262ac18f1970b";
    const url = new URL(buildThemeAppEmbedDeepLink({
      shop: "development-test.myshopify.com",
      apiKey: developmentClientId,
    }));
    assert.equal(url.searchParams.get("activateAppId"), `${developmentClientId}/free-gift-embed`);
    assert.equal(url.hostname, "development-test.myshopify.com");
    assert.equal(url.href.includes(API_KEY), false);
  });
});

describe("published theme embed status", () => {
  it("reads the embed handle from theme app extension activations", () => {
    assert.equal(
      readPublishedThemeEmbedStatus([
        {
          type: "theme_app_extension",
          activations: [{ handle: "free-gift-embed", status: "active" }],
        },
      ]),
      "active",
    );
    assert.equal(
      readPublishedThemeEmbedStatus([
        { type: "ui_extension", activations: [{ handle: "free-gift-embed", status: "active" }] },
      ]),
      "missing",
    );
    assert.equal(
      readPublishedThemeEmbedStatus([
        {
          type: "theme_app_extension",
          activations: [{ handle: "free-gift-embed", status: "available" }],
        },
      ]),
      "available",
    );
  });
});
