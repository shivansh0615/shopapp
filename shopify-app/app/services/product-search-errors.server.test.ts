import assert from "node:assert/strict";
import { beforeEach, afterEach, describe, it, mock } from "node:test";
import { GraphqlQueryError, HttpResponseError } from "@shopify/shopify-api";
import { searchProducts, resetPublicationContextCacheForTests, type ShopifyAdminClient } from "./shopify-admin.server";

beforeEach(() => {
  resetPublicationContextCacheForTests();
  mock.method(console, "error", () => {});
});
afterEach(() => mock.restoreAll());

function adminWithSearch(response: () => Promise<Response>): ShopifyAdminClient {
  return {
    graphql: async (query: string) => query.includes("query FgpbPublications")
      ? Response.json({ data: { publications: { nodes: [] } } })
      : response(),
  } as unknown as ShopifyAdminClient;
}

describe("product search service failures", () => {
  it("keeps a genuinely empty Shopify catalog result successful", async () => {
    const result = await searchProducts(adminWithSearch(async () => Response.json({ data: { products: { nodes: [] } } })), "test.myshopify.com", "red");
    assert.equal(result.status, "ok");
  });

  it("identifies GraphQL product access denial", async () => {
    const result = await searchProducts(adminWithSearch(async () => Response.json({ errors: [{ message: "Access denied for products", extensions: { code: "ACCESS_DENIED" } }] })), "test.myshopify.com", "red");
    assert.equal(result.status, "permission_required");
  });

  it("reports a Shopify query error as a loading failure", async () => {
    const result = await searchProducts(adminWithSearch(async () => Response.json({ errors: [{ message: "Query throttled", extensions: { code: "THROTTLED" } }] })), "test.myshopify.com", "red");
    assert.equal(result.status, "load_failed");
  });

  it("reports transport failure as a loading failure", async () => {
    const result = await searchProducts(adminWithSearch(async () => { throw new TypeError("Network failure"); }), "test.myshopify.com", "red");
    assert.equal(result.status, "load_failed");
  });

  for (const payload of [{}, { data: { products: null } }, { data: { products: { nodes: null } } }]) {
    it(`does not interpret missing Shopify data as an empty catalog ${JSON.stringify(payload)}`, async () => {
      const result = await searchProducts(adminWithSearch(async () => Response.json(payload)), "test.myshopify.com", "red");
      assert.equal(result.status, "load_failed");
    });
  }

  it("identifies HTTP product access denial", async () => {
    const result = await searchProducts(adminWithSearch(async () => new Response("Forbidden", { status: 403 })), "test.myshopify.com", "red");
    assert.equal(result.status, "permission_required");
  });

  it("identifies the SDK's thrown GraphQL access-denied error", async () => {
    const result = await searchProducts(adminWithSearch(async () => {
      throw new GraphqlQueryError({
        message: "Product access denied", response: {},
        body: { errors: { graphQLErrors: [{ message: "Access denied for products", extensions: { code: "ACCESS_DENIED" } }] } },
      });
    }), "test.myshopify.com", "red");
    assert.equal(result.status, "permission_required");
  });

  it("identifies the SDK's thrown HTTP forbidden error", async () => {
    const result = await searchProducts(adminWithSearch(async () => {
      throw new HttpResponseError({ message: "Forbidden", code: 403, statusText: "Forbidden" });
    }), "test.myshopify.com", "red");
    assert.equal(result.status, "permission_required");
  });
});
