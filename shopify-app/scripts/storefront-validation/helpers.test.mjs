/**
 * Unit tests for storefront validation helpers (no live store).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyBody, RESPONSE_KINDS, isRetryableTransport } from "./lib/classify-response.mjs";
import { snapshotCart, detectQuantityViolation, classifyLine } from "./lib/cart-snapshot.mjs";
import { hashToken, redactPreview, pathnameOf } from "./lib/redact.mjs";
import { classifyFromMeta, FAILURE_CLASS } from "./lib/failure-class.mjs";

describe("redact", () => {
  it("hashes tokens without leaking raw value", () => {
    const h = hashToken("secret-cart-token");
    assert.equal(h.length, 16);
    assert.equal(hashToken("secret-cart-token"), h);
    assert.notEqual(h, "secret-cart-token");
  });

  it("redacts bearer and emails from previews", () => {
    const p = redactPreview("Bearer abc.def.ghi user@example.com cart=xyz123");
    assert.ok(!p.includes("abc.def"));
    assert.ok(!p.includes("user@example.com"));
    assert.ok(p.includes("[redacted]"));
  });

  it("pathname strips query values", () => {
    assert.equal(pathnameOf("https://x.myshopify.com/cart.js?token=abc"), "/cart.js?…");
  });
});

describe("classifyBody", () => {
  it("accepts JSON", () => {
    const c = classifyBody(200, "application/json", '{"item_count":0}');
    assert.equal(c.kind, RESPONSE_KINDS.JSON);
  });

  it("detects password HTML", () => {
    const c = classifyBody(200, "text/html", '<form><input name="password" /></form>');
    assert.equal(c.kind, RESPONSE_KINDS.HTML_PASSWORD);
    assert.equal(c.retryable, false);
  });

  it("detects rate limit", () => {
    const c = classifyBody(429, "text/html", "Too Many Requests");
    assert.equal(c.kind, RESPONSE_KINDS.HTML_RATE_LIMIT);
    assert.equal(isRetryableTransport(429, c.kind), true);
  });

  it("detects bot challenge", () => {
    const c = classifyBody(403, "text/html", "<div class='captcha challenge'></div>");
    assert.equal(c.kind, RESPONSE_KINDS.HTML_BOT_CHALLENGE);
  });

  it("detects malformed JSON content-type", () => {
    const c = classifyBody(200, "application/json", "{not-json");
    assert.equal(c.kind, RESPONSE_KINDS.MALFORMED_JSON);
  });

  it("detects empty", () => {
    assert.equal(classifyBody(200, "application/json", "  ").kind, RESPONSE_KINDS.EMPTY);
  });
});

describe("cart snapshot", () => {
  const giftVid = "54277124391278";

  it("detects one tagged line quantity 2", () => {
    const snap = snapshotCart(
      {
        item_count: 2,
        items: [
          {
            key: "g1",
            variant_id: giftVid,
            quantity: 2,
            properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "9" },
          },
        ],
      },
      { giftVariantId: giftVid },
    );
    assert.equal(snap.shapes.oneTaggedQty2, true);
    assert.equal(detectQuantityViolation(snap).code, "TAGGED_QTY_2_SINGLE_LINE");
  });

  it("detects two tagged lines", () => {
    const snap = snapshotCart(
      {
        items: [
          {
            key: "a",
            variant_id: giftVid,
            quantity: 1,
            properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "9" },
          },
          {
            key: "b",
            variant_id: giftVid,
            quantity: 1,
            properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "9" },
          },
        ],
      },
      { giftVariantId: giftVid },
    );
    assert.equal(snap.shapes.twoTaggedQty1, true);
    assert.equal(detectQuantityViolation(snap).code, "TWO_TAGGED_LINES");
  });

  it("classifies gift + paid same SKU", () => {
    const snap = snapshotCart(
      {
        items: [
          {
            key: "paid",
            variant_id: giftVid,
            quantity: 1,
            properties: {},
          },
          {
            key: "gift",
            variant_id: giftVid,
            quantity: 1,
            properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "9" },
          },
        ],
      },
      { giftVariantId: giftVid },
    );
    assert.equal(snap.shapes.taggedPlusPaidSameSku, true);
    assert.equal(snap.taggedGiftQuantityTotal, 1);
    assert.equal(snap.paidSameSkuQuantityTotal, 1);
  });

  it("classifyLine marks untagged same SKU as paid_same_sku", () => {
    const line = classifyLine(
      { key: "x", variant_id: giftVid, quantity: 1, properties: {} },
      giftVid,
    );
    assert.equal(line.kind, "paid_same_sku");
  });
});

describe("failure classification", () => {
  it("maps password HTML to auth failure", () => {
    assert.equal(
      classifyFromMeta({ kind: "HTML_PASSWORD", status: 200 }),
      FAILURE_CLASS.AUTH_OR_COOKIE_FAILURE,
    );
  });

  it("maps 429 to rate limit", () => {
    assert.equal(
      classifyFromMeta({ kind: "HTML_RATE_LIMIT", status: 429 }),
      FAILURE_CLASS.SHOPIFY_RATE_LIMIT,
    );
  });
});
