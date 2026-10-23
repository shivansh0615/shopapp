import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGiftProductSearchQuery, sanitizeGiftSearchTerm } from "./gift-product-search";

describe("gift product search query", () => {
  it("browses active products when the merchant has not typed a term", () => {
    assert.equal(buildGiftProductSearchQuery("   "), "status:active");
  });

  it("matches the reviewer's title term against title and SKU", () => {
    assert.equal(
      buildGiftProductSearchQuery("red"),
      'status:active AND (title:"red" OR sku:"red")',
    );
  });

  it("keeps spaces inside one phrase", () => {
    assert.equal(
      buildGiftProductSearchQuery("red shirt"),
      'status:active AND (title:"red shirt" OR sku:"red shirt")',
    );
  });

  it("drops search operators so they cannot rewrite the query", () => {
    assert.equal(sanitizeGiftSearchTerm('red" OR status:draft'), "red OR status draft");
    assert.equal(
      buildGiftProductSearchQuery("sku:secret"),
      'status:active AND (title:"sku secret" OR sku:"sku secret")',
    );
  });
});
