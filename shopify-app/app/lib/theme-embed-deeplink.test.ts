import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  THEME_APP_EMBED_BLOCK_HANDLE,
  THEME_APP_PRODUCT_BLOCK_HANDLE,
  buildActivateAppId,
  buildThemeAppBlockDeepLink,
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

  it("opens App embeds without turning the embed on", () => {
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
    assert.equal(url.includes("activateAppId="), false);
    assert.equal(url.includes(API_KEY), false);
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
    assert.equal(url.searchParams.get("context"), "apps");
    assert.equal(url.searchParams.get("activateAppId"), null);
    assert.equal(url.href.includes(clientId), false);
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
    assert.equal(url.searchParams.get("activateAppId"), null);
    assert.equal(url.hostname, "development-test.myshopify.com");
    assert.equal(url.href.includes(API_KEY), false);
    assert.equal(url.href.includes(developmentClientId), false);
  });

  it("opens the product template and adds the product block to the main section", () => {
    const url = new URL(buildThemeAppBlockDeepLink({
      shop: "newish-app-test.myshopify.com",
      apiKey: API_KEY,
    }));
    assert.equal(url.searchParams.get("template"), "product");
    assert.equal(url.searchParams.get("target"), "mainSection");
    assert.equal(url.searchParams.get("addAppBlockId"), `${API_KEY}/${THEME_APP_PRODUCT_BLOCK_HANDLE}`);
    assert.equal(url.searchParams.has("activateAppId"), false);
    const block = readFileSync(new URL(
      "../../extensions/free-gift-progress-bar/blocks/free-gift-progress-bar.liquid",
      import.meta.url,
    ), "utf8");
    const schema = JSON.parse(block.match(/{%\s*schema\s*%}([\s\S]*?){%\s*endschema\s*%}/)?.[1] ?? "{}");
    assert.equal(schema.target, "section");
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
