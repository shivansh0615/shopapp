import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { fetchProductSearch, pickGiftWithResourcePicker } from "./product-search-client";

afterEach(() => mock.restoreAll());

describe("product search response handling", () => {
  it("treats a successful empty product list as genuine no matches", async () => {
    mock.method(globalThis, "fetch", async () => Response.json({ products: [], status: "ok" }));
    const result = await fetchProductSearch({ q: "red" });
    assert.equal(result.status, "ok");
    assert.deepEqual(result.products, []);
  });

  it("retains products from a successful response", async () => {
    const product = { id: "gid://shopify/Product/1", title: "Red shirt", featuredImage: null, firstVariant: null };
    mock.method(globalThis, "fetch", async () => Response.json({ products: [product], status: "ok" }));
    assert.deepEqual((await fetchProductSearch({ q: "red" })).products, [product]);
  });

  it("reports missing permission even when the response is not JSON", async () => {
    mock.method(globalThis, "fetch", async () => new Response("Forbidden", { status: 403 }));
    assert.equal((await fetchProductSearch({ q: "red" })).status, "permission_required");
  });

  it("reports server and network failures instead of no matches", async () => {
    mock.method(globalThis, "fetch", async () => Response.json({ products: [] }, { status: 502 }));
    assert.equal((await fetchProductSearch({ q: "red" })).status, "load_failed");
    mock.restoreAll();
    mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
    assert.equal((await fetchProductSearch({ q: "red" })).status, "load_failed");
  });

  for (const body of ["<html>Sign in</html>", "null", "{}", '{"products":{}}', '{"products":[],"status":"unexpected"}']) {
    it(`rejects invalid successful payload ${body}`, async () => {
      mock.method(globalThis, "fetch", async () => new Response(body, { status: 200 }));
      assert.equal((await fetchProductSearch({ q: "red" })).status, "load_failed");
    });
  }

  it("propagates cancelled requests without showing a failure", async () => {
    mock.method(globalThis, "fetch", async () => { throw new DOMException("Cancelled", "AbortError"); });
    await assert.rejects(fetchProductSearch({ q: "red" }), { name: "AbortError" });
  });

  it("can recover from failure on the next request with the same search", async () => {
    const urls: string[] = [];
    mock.method(globalThis, "fetch", async (url: string) => {
      urls.push(url);
      return urls.length === 1 ? new Response("Unavailable", { status: 503 }) : Response.json({ products: [] });
    });
    assert.equal((await fetchProductSearch({ q: "red" })).status, "load_failed");
    assert.equal((await fetchProductSearch({ q: "red" })).status, "ok");
    assert.equal(urls[0], urls[1]);
  });
});

async function withPicker<T>(picker: () => Promise<unknown>, callback: () => Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { shopify: { resourcePicker: picker } } });
  try { return await callback(); } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

describe("native gift picker", () => {
  it("treats cancellation as cancellation rather than a failed search", async () => {
    await withPicker(async () => undefined, async () => {
      assert.deepEqual(await pickGiftWithResourcePicker(), { status: "cancelled" });
    });
  });

  it("preserves the merchant's explicit variant choice", async () => {
    await withPicker(async () => [{ id: "gid://shopify/Product/1", title: "Shirt", variants: [{ id: "gid://shopify/ProductVariant/99", title: "Blue / Small" }] }], async () => {
      const result = await pickGiftWithResourcePicker();
      assert.equal(result.status, "selected");
      if (result.status === "selected") assert.deepEqual(result.gift.variants, [{ id: "gid://shopify/ProductVariant/99", title: "Blue / Small" }]);
    });
  });

  it("falls back to catalog browsing when the native picker is unavailable", async () => {
    await withPicker(async () => { throw new Error("Unsupported API"); }, async () => {
      assert.deepEqual(await pickGiftWithResourcePicker(), { status: "unavailable" });
    });
  });
});
