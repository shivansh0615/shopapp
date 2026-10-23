import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCartRecommendations,
  normalizeCartProgressBar,
} from "./widget-settings";
import { parseWidgetSettingsFromForm } from "./campaign-ui";

test("normalizeCartRecommendations clamps and sanitizes", () => {
  const result = normalizeCartRecommendations({
    enabled: true,
    heading: "  ".padEnd(100, "A"),
    description: "Hello\r\nWorld",
    maxProducts: 99,
    buttonText: "Buy now!!!!!".repeat(10),
    products: [
      { productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/11", title: "One", imageUrl: "https://cdn.example/a.jpg" },
      { productId: "gid://shopify/Product/1", variantId: "gid://shopify/ProductVariant/11", title: "Dup" },
      { productId: "", variantId: "22" },
      { productId: "p2", variantId: "22", imageUrl: "not-a-url" },
    ],
  });

  assert.equal(result.enabled, true);
  assert.equal(result.maxProducts, 8);
  assert.ok((result.heading || "").length <= 80);
  assert.equal(result.description, "Hello\nWorld");
  assert.ok((result.buttonText || "").length <= 40);
  assert.equal(result.products?.length, 2);
  assert.equal(result.products?.[0]?.variantId, "gid://shopify/ProductVariant/11");
  assert.equal(result.products?.[1]?.imageUrl, null);
});

test("normalizeCartRecommendations defaults when disabled/empty", () => {
  const result = normalizeCartRecommendations({ enabled: false, products: [] });
  assert.equal(result.enabled, false);
  assert.equal(result.heading, "Our other bestsellers loved by shoppers. You can try them!");
  assert.equal(result.products?.length, 0);
  assert.equal(result.maxProducts, 4);
  assert.equal(result.buttonText, "+ Add");
  assert.equal(result.backgroundColor, "#f7d6de");
});

test("normalizeCartRecommendations sanitizes backgroundColor", () => {
  const ok = normalizeCartRecommendations({ enabled: true, backgroundColor: "#ABC", products: [] });
  assert.equal(ok.backgroundColor, "#aabbcc");
  const bad = normalizeCartRecommendations({ enabled: true, backgroundColor: "pink", products: [] });
  assert.equal(bad.backgroundColor, "#f7d6de");
});

test("normalizeCartProgressBar clamps height and radius", () => {
  const result = normalizeCartProgressBar({ height: 100, borderRadius: -3, compact: false });
  assert.equal(result.height, 40);
  assert.equal(result.borderRadius, 0);
  assert.equal(result.compact, false);
});

test("parseWidgetSettingsFromForm normalizes cartRecommendations from JSON", () => {
  const form = new FormData();
  form.set(
    "widgetSettings",
    JSON.stringify({
      heading: "H",
      description: "D",
      unlockedHeading: "U",
      unlockedDescription: "UD",
      template: "Premium",
      barColor: "#111111",
      backgroundColor: "#fafafa",
      textColor: "#111111",
      borderRadius: 12,
      progressHeight: 10,
      buttonText: "Go",
      cartRecommendations: {
        enabled: true,
        heading: "Picks",
        description: "Line one\nLine two",
        maxProducts: 3,
        buttonText: "Add",
        products: [{ productId: "p1", variantId: "v1", title: "Tea" }],
      },
    }),
  );

  const parsed = parseWidgetSettingsFromForm(form);
  assert.equal(parsed.cartRecommendations?.enabled, true);
  assert.equal(parsed.cartRecommendations?.heading, "Picks");
  assert.equal(parsed.cartRecommendations?.maxProducts, 3);
  assert.equal(parsed.cartRecommendations?.products?.[0]?.productId, "p1");
  assert.equal(parsed.cartProgressBar?.height, 6);
});

test("recommendation add payload never includes fgpb properties", () => {
  const variantId = "123456789";
  const payload = { items: [{ id: Number(variantId), quantity: 1 }] };
  assert.equal("properties" in payload.items[0], false);
  assert.ok(!JSON.stringify(payload).includes("_fgpb_"));
});
