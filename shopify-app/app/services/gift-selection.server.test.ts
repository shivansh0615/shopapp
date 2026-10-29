import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { readFileSync } from "node:fs";
import { buildClientSchema, parse, validate } from "graphql";
import {
  searchProducts, getGiftVariantPage, validateGiftVariantForOnlineStore, filterSellableRecommendationProducts, getShopCurrencyCode,
  resolvePublicationContext, resetPublicationContextCacheForTests, type ShopifyAdminClient,
} from "./shopify-admin.server";

const schema = buildClientSchema(JSON.parse(readFileSync(new URL("../types/admin-2025-10.schema.json", import.meta.url), "utf8")));
const publication = { id: "gid://shopify/Publication/1", catalog: { title: "Online Store" } };
const productId = "gid://shopify/Product/1";
const variant = { id: "gid://shopify/ProductVariant/2", title: "Red / Large", price: "10", sku: "RED-L", availableForSale: true, inventoryQuantity: 10, inventoryPolicy: "DENY", image: null };
const product = { id: productId, title: "Shirt", status: "ACTIVE", publishedOnPublication: true, featuredImage: null, variants: { nodes: [variant], pageInfo: { hasNextPage: false, endCursor: null } } };

it("refreshes recommendation prices for the explicitly selected variant", async () => {
  const fake = admin(() => ({ data: { productVariant: { ...variant, price: "15.00", compareAtPrice: "20.00" } } }));
  const products = await filterSellableRecommendationProducts(fake.client, [{ productId, variantId: variant.id }]);
  assert.equal(products[0]?.price, "15.00");
  assert.equal(products[0]?.compareAtPrice, "20.00");
  assert.equal(fake.calls[0].variables.id, variant.id);
});

it("does not guess INR when Shopify fails to return currency", async () => {
  const fake = admin(() => ({ data: { shop: null } }));
  await assert.rejects(getShopCurrencyCode(fake.client), /verify shop currency/);
});
type Call = { query: string; variables: Record<string, unknown> };
function admin(handler: (call: Call) => unknown) {
  const calls: Call[] = [];
  return {
    calls,
    client: { graphql: async (query: string, options: { variables?: Record<string, unknown> }) => {
      const call = { query, variables: options?.variables ?? {} };
      calls.push(call);
      assert.deepEqual(validate(schema, parse(query)).map((error) => error.message), [], "query must match pinned Shopify schema");
      return Response.json(query.includes("query FgpbPublications")
        ? { data: { publications: { nodes: [publication] } } } : handler(call));
    } } as unknown as ShopifyAdminClient,
  };
}
beforeEach(() => { resetPublicationContextCacheForTests(); mock.method(console, "error", () => {}); });
afterEach(() => mock.restoreAll());

describe("gift browsing and variant validation", () => {
  it("returns per-variant blocking reasons while retaining selectable variants", async () => {
    const fake = admin(() => ({ data: { products: { nodes: [{ ...product, variants: { nodes: [variant,
      { ...variant, id: "gid://shopify/ProductVariant/3", availableForSale: false, inventoryQuantity: 0 },
    ] } }] } } }));
    const result = await searchProducts(fake.client, "shop.myshopify.com", "Shirt");
    assert.equal(result.products[0].available, true);
    assert.equal(result.products[0].variants?.[0].unavailableReason, null);
    assert.match(result.products[0].variants?.[1].unavailableReason ?? "", /out of stock/);
    assert.equal(result.products[0].variants?.[1].selectable, false);
  });

  it("keeps a product sold out on the Online Store out of the available list", async () => {
    const soldOut = {
      ...variant,
      availableForSale: true,
      inventoryQuantity: 4,
      sellableOnlineQuantity: 0,
      inventoryItem: { tracked: true },
    };
    const fake = admin(() => ({ data: { products: { nodes: [{ ...product, variants: { nodes: [soldOut] } }] } } }));
    const result = await searchProducts(fake.client, "shop.myshopify.com", "", { browse: true });
    assert.equal(result.products[0].available, false);
    assert.equal(result.products[0].variants?.[0].selectable, false);
    assert.match(result.products[0].unavailableReason ?? "", /out of stock/);
  });
  it("browses without search text and passes the next product cursor to Shopify", async () => {
    const fake = admin(({ variables }) => ({ data: { products: { nodes: [product], pageInfo: variables.after ? { hasNextPage: false, endCursor: null } : { hasNextPage: true, endCursor: "page-1" } } } }));
    const first = await searchProducts(fake.client, "shop.myshopify.com", "", { browse: true });
    assert.equal(first.status, "ok");
    assert.equal(first.pageInfo?.endCursor, "page-1");
    const second = await searchProducts(fake.client, "shop.myshopify.com", "", { browse: true, after: first.pageInfo?.endCursor });
    assert.equal(second.pageInfo?.hasNextPage, false);
    assert.equal(fake.calls.at(-1)?.variables.after, "page-1");
    assert.equal(fake.calls.at(-1)?.variables.query, "status:active");
  });

  it("preserves all returned variants and identifies a partial variant page", async () => {
    const fake = admin(() => ({ data: { products: { nodes: [{ ...product, variants: { nodes: [variant, { ...variant, id: "gid://shopify/ProductVariant/3", title: "Blue / Small" }], pageInfo: { hasNextPage: true, endCursor: "variant-20" } } }] } } }));
    const result = await searchProducts(fake.client, "shop.myshopify.com", "Shirt");
    assert.equal(result.products[0]?.variants?.length, 2);
    assert.equal(result.products[0]?.variantsTruncated, true);
    assert.equal(result.products[0]?.variantPageInfo?.endCursor, "variant-20");
  });

  it("retrieves later variants for the chosen product without selecting the first variant", async () => {
    const fake = admin(() => ({ data: { product: { ...product, variants: { nodes: [{ ...variant, id: "gid://shopify/ProductVariant/99", title: "Green / XL" }], pageInfo: { hasNextPage: false, endCursor: null } } } } }));
    const result = await getGiftVariantPage(fake.client, "shop.myshopify.com", productId, "variant-20");
    assert.equal(result.status, "ok");
    assert.equal(fake.calls.at(-1)?.variables.id, productId);
    assert.equal(fake.calls.at(-1)?.variables.after, "variant-20");
    assert.equal(result.products[0]?.variants?.[0]?.title, "Green / XL");
  });

  it("rejects a deleted gift product during variant browsing", async () => {
    const result = await getGiftVariantPage(admin(() => ({ data: { product: null } })).client, "shop.myshopify.com", productId);
    assert.equal(result.status, "load_failed");
  });

  it("rejects a variant belonging to another product", async () => {
    const fake = admin(() => ({ data: { productVariant: { ...variant, product: { ...product, id: "gid://shopify/Product/999" } } } }));
    const result = await validateGiftVariantForOnlineStore(fake.client, "shop.myshopify.com", variant.id, { expectedProductId: productId });
    assert.equal(result.valid, false);
    if (!result.valid) assert.match(result.reason, /does not belong/);
  });

  for (const [name, value] of [
    ["unpublished", { ...variant, product: { ...product, publishedOnPublication: false } }],
    ["out of stock", { ...variant, inventoryQuantity: 0, availableForSale: false, product }],
    ["sold out on the Online Store", { ...variant, inventoryQuantity: 4, sellableOnlineQuantity: 0, inventoryItem: { tracked: true }, product }],
    ["deleted", null],
  ] as const) {
    it(`blocks activation of a ${name} variant`, async () => {
      const result = await validateGiftVariantForOnlineStore(admin(() => ({ data: { productVariant: value } })).client, "shop.myshopify.com", variant.id, { expectedProductId: productId });
      assert.equal(result.valid, false);
    });
  }

  it("allows a complete draft to retain its unavailable variant but blocks activation", async () => {
    const fake = admin(() => ({ data: { productVariant: { ...variant, availableForSale: false, product } } }));
    assert.equal((await validateGiftVariantForOnlineStore(fake.client, "shop.myshopify.com", variant.id, { expectedProductId: productId, requireSellable: false })).valid, true);
    assert.equal((await validateGiftVariantForOnlineStore(fake.client, "shop.myshopify.com", variant.id, { expectedProductId: productId, requireSellable: true })).valid, false);
  });

  it("accepts a valid published selected variant", async () => {
    const result = await validateGiftVariantForOnlineStore(admin(() => ({ data: { productVariant: { ...variant, product } } })).client, "shop.myshopify.com", variant.id, { expectedProductId: productId });
    assert.equal(result.valid, true);
  });
});

describe("publication discovery", () => {
  it("finds Online Store after the first publication page", async () => {
    const calls: Call[] = [];
    const client = { graphql: async (query: string, options: { variables: Record<string, unknown> }) => {
      calls.push({ query, variables: options.variables });
      return Response.json({ data: { publications: options.variables.after
        ? { nodes: [publication], pageInfo: { hasNextPage: false, endCursor: null } }
        : { nodes: [], pageInfo: { hasNextPage: true, endCursor: "publications-next" } } } });
    } } as unknown as ShopifyAdminClient;
    assert.equal((await resolvePublicationContext(client, "shop.myshopify.com")).onlineStorePublicationId, publication.id);
    assert.equal(calls[1]?.variables.after, "publications-next");
    assert.match(calls[0]?.query ?? "", /catalogType: APP/);
  });

  it("retries failed publication discovery instead of caching failure permanently", async () => {
    let calls = 0;
    const client = { graphql: async () => {
      calls += 1;
      return Response.json({ data: { publications: { nodes: calls === 1 ? [] : [publication] } } });
    } } as unknown as ShopifyAdminClient;
    assert.equal((await resolvePublicationContext(client, "shop.myshopify.com")).canVerifyPublication, false);
    assert.equal((await resolvePublicationContext(client, "shop.myshopify.com")).canVerifyPublication, true);
  });
});


describe("Online Store URL publishing fallback", () => {
  it("allows browsing, variant selection and activation on a password-protected store", async () => {
    const publishedProduct = { ...product, onlineStoreUrl: null, publishedAt: "2025-01-01T00:00:00Z" };
    const client = { graphql: async (query: string) => {
      assert.deepEqual(validate(schema, parse(query)).map(error => error.message), []);
      if (query.includes("query FgpbPublications")) return Response.json({ errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] });
      assert.match(query, /publishedAt/);
      return Response.json({ data: {
        products: { nodes: [publishedProduct] },
        product: publishedProduct,
        productVariant: { ...variant, product: publishedProduct },
      } });
    } } as unknown as ShopifyAdminClient;
    const result = await searchProducts(client, "protected.myshopify.com", "shirt");
    assert.equal(result.products[0].available, true);
    assert.equal(result.publicationWarning, false);
    const variants = await getGiftVariantPage(client, "protected.myshopify.com", productId);
    assert.equal(variants.products[0].variants?.[0].selectable, true);
    assert.equal(variants.publicationWarning, false);
    assert.equal((await validateGiftVariantForOnlineStore(client, "protected.myshopify.com", variant.id, { expectedProductId: productId })).valid, true);
  });

  it("still blocks unpublished products on a password-protected store", async () => {
    const unpublished = { ...product, onlineStoreUrl: null, publishedAt: null };
    const client = { graphql: async (query: string) => {
      if (query.includes("query FgpbPublications")) return Response.json({ errors: [{ message: "Access denied" }] });
      return Response.json({ data: { products: { nodes: [unpublished] }, productVariant: { ...variant, product: unpublished } } });
    } } as unknown as ShopifyAdminClient;
    assert.equal((await searchProducts(client, "protected.myshopify.com", "shirt")).products[0].available, false);
    assert.equal((await validateGiftVariantForOnlineStore(client, "protected.myshopify.com", variant.id)).valid, false);
  });

  for (const [label, url, valid] of [
    ["published", "https://shop.myshopify.com/products/shirt", true],
    ["unpublished", null, false],
    ["unknown", undefined, false],
  ] as const) {
    it(`validates a ${label} gift when publication discovery is denied`, async () => {
      const client = { graphql: async (query: string) => {
        assert.deepEqual(validate(schema, parse(query)).map(error => error.message), []);
        if (query.includes("query FgpbPublications")) return Response.json({ errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] });
        assert.match(query, /onlineStoreUrl/);
        return Response.json({ data: { productVariant: { ...variant, product: { ...product, onlineStoreUrl: url } } } });
      } } as unknown as ShopifyAdminClient;
      const result = await validateGiftVariantForOnlineStore(client, "fallback.myshopify.com", variant.id, { expectedProductId: productId });
      assert.equal(result.valid, valid);
    });
  }
  it("filters unpublished search results and clears the warning only with verified product data", async () => {
    const client = { graphql: async (query: string) => {
      assert.deepEqual(validate(schema, parse(query)).map(error => error.message), []);
      if (query.includes("query FgpbPublications")) return Response.json({ errors: [{ message: "Access denied" }] });
      assert.match(query, /onlineStoreUrl/);
      return Response.json({ data: { products: { nodes: [
        { ...product, onlineStoreUrl: "https://shop.myshopify.com/products/shirt" },
        { ...product, id: "gid://shopify/Product/3", onlineStoreUrl: null },
      ] } } });
    } } as unknown as ShopifyAdminClient;
    const result = await searchProducts(client, "fallback.myshopify.com", "shirt");
    assert.equal(result.publicationWarning, false);
    assert.equal(result.products[0].available, true);
    assert.equal(result.products[1].available, false);
  });
});
