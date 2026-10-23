import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canSelectProductVariant,
  isSellableVariant,
  pickOnlineStorePublicationId,
  productUnavailableReason,
  sameShopifyGid,
  validateGiftVariantForActivation,
} from "./product-availability.server";

const publicationVerified = {
  onlineStorePublicationId: "gid://shopify/Publication/1",
  canVerifyPublication: true,
};

const publicationFallback = {
  onlineStorePublicationId: null,
  canVerifyPublication: false,
};

const sellableVariant = {
  availableForSale: true,
  inventoryQuantity: 5,
  inventoryPolicy: "DENY",
};

describe("product availability", () => {
  it("does not offer a product when publication data is missing", () => {
    const selectable = canSelectProductVariant({
      status: "ACTIVE",
      variant: sellableVariant,
      publishedOnPublication: false,
      publicationContext: publicationFallback,
    });

    assert.equal(selectable, false);
  });

  for (const [label, publishedAt, expected] of [
    ["published on a password-protected store", "2025-01-01T00:00:00Z", true],
    ["unpublished", null, false],
    ["invalid publication date", "invalid", false],
    ["scheduled in the future", "2099-01-01T00:00:00Z", false],
  ] as const) {
    it(`handles a product that is ${label} consistently in selection and activation`, () => {
      const input = { status: "ACTIVE", variant: sellableVariant, publicationContext: publicationFallback, onlineStoreUrl: null, publishedAt };
      assert.equal(canSelectProductVariant(input), expected);
      assert.equal(validateGiftVariantForActivation({ ...input, productStatus: input.status }).valid, expected);
    });
  }

  it("does not let publication dates override a verified unpublished channel", () => {
    const input = { status: "ACTIVE", variant: sellableVariant, publicationContext: publicationVerified, publishedOnPublication: false, publishedAt: "2025-01-01T00:00:00Z", onlineStoreUrl: null };
    assert.equal(canSelectProductVariant(input), false);
    assert.equal(validateGiftVariantForActivation({ ...input, productStatus: input.status }).valid, false);
  });

  it("requires Online Store publication when publication verification is available", () => {
    const unpublished = canSelectProductVariant({
      status: "ACTIVE",
      variant: sellableVariant,
      publishedOnPublication: false,
      publicationContext: publicationVerified,
    });
    const published = canSelectProductVariant({
      status: "ACTIVE",
      variant: sellableVariant,
      publishedOnPublication: true,
      publicationContext: publicationVerified,
    });

    assert.equal(unpublished, false);
    assert.equal(published, true);
  });

  it("rejects deny-policy variants with zero inventory", () => {
    assert.equal(
      isSellableVariant({
        availableForSale: true,
        inventoryQuantity: 0,
        inventoryPolicy: "DENY",
      }),
      false,
    );
  });

  it("explains out-of-stock products clearly for the dashboard picker", () => {
    const reason = productUnavailableReason({
      status: "ACTIVE",
      variants: [
        {
          availableForSale: false,
          inventoryQuantity: 0,
          inventoryPolicy: "DENY",
        },
      ],
      publishedOnPublication: true,
      publicationContext: publicationVerified,
    });
    assert.equal(reason, "Can't add — this product is out of stock.");
  });

  it("blocks activation when Online Store publication cannot be verified", () => {
    const result = validateGiftVariantForActivation({
      productStatus: "ACTIVE",
      variant: sellableVariant,
      publicationContext: publicationFallback,
    });

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.reason, /Retry before activating/);
    }
  });

  it("picks the Online Store publication by catalog title", () => {
    const publicationId = pickOnlineStorePublicationId([
      { id: "gid://shopify/Publication/1", catalog: { title: "Point of Sale" } },
      { id: "gid://shopify/Publication/2", catalog: { title: "Online Store" } },
    ]);

    assert.equal(publicationId, "gid://shopify/Publication/2");
  });

  it("returns null when Online Store publication cannot be identified", () => {
    const publicationId = pickOnlineStorePublicationId([
      { id: "gid://shopify/Publication/1", catalog: { title: "Point of Sale" } },
    ]);

    assert.equal(publicationId, null);
  });

  it("blocks activation when publication verification is available but product is unpublished", () => {
    const result = validateGiftVariantForActivation({
      productStatus: "ACTIVE",
      variant: sellableVariant,
      publishedOnPublication: false,
      publicationContext: publicationVerified,
    });

    assert.equal(result.valid, false);
    if (!result.valid) {
      assert.match(result.reason, /published to the Online Store/i);
    }
  });

  it("treats a numeric product id and its global id as the same product", () => {
    assert.equal(sameShopifyGid("42", "gid://shopify/Product/42", "Product"), true);
    assert.equal(
      sameShopifyGid("gid://shopify/Product/42", "gid://shopify/Product/99", "Product"),
      false,
    );
  });
});
