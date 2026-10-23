import test from "node:test";
import assert from "node:assert/strict";
import { isThemeEditor } from "../utils/design-mode.js";

test("isThemeEditor", async (t) => {
  await t.test("false when Shopify is absent", () => {
    assert.equal(isThemeEditor({}), false);
    assert.equal(isThemeEditor({ Shopify: {} }), false);
  });

  await t.test("true for designMode and inspectMode", () => {
    assert.equal(isThemeEditor({ Shopify: { designMode: true } }), true);
    assert.equal(isThemeEditor({ Shopify: { inspectMode: true } }), true);
  });

  await t.test("true for shopify-design-mode class", () => {
    assert.equal(
      isThemeEditor({
        document: {
          documentElement: { classList: { contains: (c) => c === "shopify-design-mode" } },
        },
      }),
      true,
    );
  });

  await t.test("false for storefront preview bar and unpublished theme preview", () => {
    assert.equal(isThemeEditor({ location: { search: "?pb=0" } }), false);
    assert.equal(isThemeEditor({ location: { search: "?preview_theme_id=123" } }), false);
  });

  await t.test("true for cross-origin parent (admin preview iframe)", () => {
    assert.equal(
      isThemeEditor({
        self: {},
        top: {
          get location() {
            throw new Error("blocked");
          },
        },
      }),
      true,
    );
  });
});
