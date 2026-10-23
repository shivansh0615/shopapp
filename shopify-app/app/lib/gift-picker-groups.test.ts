import assert from "node:assert/strict";
import { it } from "node:test";
import { giftVariants, groupGiftProducts, groupGiftVariants, mergeGiftVariants } from "./gift-picker-groups";
import type { ProductSearchResult, ProductSearchVariantSummary } from "./product-availability";

const available = { id: "variant-1", title: "In stock", selectable: true };
const unavailable = { id: "variant-2", title: "Sold out", selectable: false, unavailableReason: "Out of stock" };
const product = (id: string, variants: ProductSearchVariantSummary[] = [available]): ProductSearchResult => ({ id, title: id, featuredImage: null, firstVariant: null, variants });

it("groups mixed products by at least one explicitly verified variant, preserving search order", () => {
  const mixed = product("mixed", [unavailable, available]);
  const soldOut = product("sold-out", [unavailable]);
  const next = product("next");
  const result = groupGiftProducts([soldOut, mixed, next]);
  assert.deepEqual(result.available.map(p => p.id), ["mixed", "next"]);
  assert.deepEqual(result.unavailable.map(p => p.id), ["sold-out"]);
  assert.deepEqual(groupGiftVariants(giftVariants(mixed)).unavailable, [unavailable]);
});

it("never turns unknown variants or a stale firstVariant into addable selections", () => {
  const unknown = { id: "unknown", title: "Not verified" };
  const p = { ...product("blocked", [unavailable]), firstVariant: available };
  assert.deepEqual(giftVariants(p), [unavailable]);
  assert.deepEqual(groupGiftVariants([unknown]).available, []);
  assert.equal(groupGiftProducts([product("unknown", [unknown])]).available.length, 0);
});

it("does not call an unloaded variant page available and accepts verified later variants", () => {
  const partial = { ...product("partial", [unavailable]), variantsTruncated: true };
  assert.equal(groupGiftProducts([partial]).available.length, 0);
  assert.deepEqual(groupGiftProducts([partial]).unchecked.map(p => p.id), ["partial"]);
  assert.equal(groupGiftProducts([partial]).unavailable.length, 0);
  const combined = mergeGiftVariants(partial.variants!, [available]);
  assert.equal(groupGiftVariants(combined).available.length, 1);
  assert.equal(groupGiftVariants(combined).unavailable[0].unavailableReason, "Out of stock");
});

it("merges pagination without duplicate variants and retains the newest availability result", () => {
  const updated = { ...available, selectable: false, unavailableReason: "No longer available" };
  assert.deepEqual(mergeGiftVariants([available, unavailable], [updated]), [updated, unavailable]);
});
