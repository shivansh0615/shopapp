import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DISCOUNT_FUNCTION_TITLE } from "./discount-engine/discount-config.schema";
import {
  REQUIRED_DISCOUNT_CLASSES,
  toDiscountAutomaticNodeGid,
  updateAutomaticAppDiscountConfig,
} from "../services/discount-provisioner.server";
import { discountSyncFailureMessage } from "../services/discount-sync.server";

type Call = { query: string; variables?: Record<string, unknown> };

/** Records what the provisioner would send to Shopify. */
function fakeAdmin(responses: unknown[]) {
  const calls: Call[] = [];
  let n = 0;
  return {
    calls,
    admin: {
      graphql: async (query: string, opts?: { variables?: Record<string, unknown> }) => {
        calls.push({ query, variables: opts?.variables });
        const body = responses[Math.min(n, responses.length - 1)];
        n += 1;
        return { json: async () => body };
      },
    } as never,
  };
}

const OK_UPDATE = { data: { discountAutomaticAppUpdate: { userErrors: [] } } };

describe("discount GID normalization", () => {
  it("is idempotent for full GIDs", () => {
    const gid = "gid://shopify/DiscountAutomaticNode/123";
    assert.equal(toDiscountAutomaticNodeGid(gid), gid);
  });

  it("prefixes numeric ids", () => {
    assert.equal(
      toDiscountAutomaticNodeGid("456"),
      "gid://shopify/DiscountAutomaticNode/456",
    );
  });
});

describe("discount class convergence", () => {
  const GID = "gid://shopify/DiscountAutomaticNode/1809021698295";
  const CONFIG = JSON.stringify({ schemaVersion: 1, activeCampaigns: [] });

  it("restates the PRODUCT class on every config sync", async () => {
    // The Function's first gate. A node created before this was provisioned, or
    // adopted by title, is otherwise never repaired and never discounts.
    const { admin, calls } = fakeAdmin([OK_UPDATE]);
    await updateAutomaticAppDiscountConfig(admin, GID, CONFIG);

    const input = calls[0]?.variables?.automaticAppDiscount as Record<string, unknown>;
    assert.equal(input.title, DISCOUNT_FUNCTION_TITLE);
    assert.equal(input.title, "UpsellTrix Free Gift");
    assert.deepEqual(input.discountClasses, REQUIRED_DISCOUNT_CLASSES);
    assert.equal(REQUIRED_DISCOUNT_CLASSES[0], "PRODUCT");
  });

  it("still writes the config metafield alongside the class", async () => {
    const { admin, calls } = fakeAdmin([OK_UPDATE]);
    await updateAutomaticAppDiscountConfig(admin, GID, CONFIG);

    const input = calls[0]?.variables?.automaticAppDiscount as {
      metafields: Array<{ key: string; value: string }>;
    };
    assert.equal(input.metafields[0]?.key, "discount_config");
    assert.equal(input.metafields[0]?.value, CONFIG);
  });

  it("reads discount classes back so a wrong node is observable", () => {
    // Repairing state nobody queries is how this stayed invisible for a build.
    const source = readFileSync(
      new URL("./discount-provisioner.server.ts", import.meta.url),
      "utf8",
    );
    const nodeQuery = source.slice(
      source.indexOf("const DISCOUNT_NODE_QUERY"),
      source.indexOf("const FIND_APP_DISCOUNTS_QUERY"),
    );
    assert.ok(nodeQuery.includes("discountClasses"));
  });

  it("falls back to metafieldsSet when the combined update is rejected", async () => {
    const { admin, calls } = fakeAdmin([
      { data: { discountAutomaticAppUpdate: { userErrors: [{ field: null, message: "no" }] } } },
      { data: { metafieldsSet: { userErrors: [] } } },
    ]);
    await updateAutomaticAppDiscountConfig(admin, GID, CONFIG);

    assert.equal(calls.length, 2, "the config must still land");
    assert.match(String(calls[1]?.query), /metafieldsSet/);
  });
});

describe("discount sync failure messaging", () => {
  it("states DB saved but Shopify sync is pending or failed", () => {
    const message = discountSyncFailureMessage(new Error("timeout"));
    assert.match(message, /saved/i);
    assert.match(message, /pending|permanently/i);
    assert.match(message, /timeout/i);
  });
});
