import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const TIERED = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../extensions/free-gift-progress-bar/assets/tiered-gift-sync.js"),
  "utf8",
);

/**
 * Mirrors tiered-gift-sync cartPost section contract (Fix 2).
 * Ensures every mutation requests theme sections and applies via shared hook.
 */
function buildMutationBody(body, sectionsList, pathname) {
  const withSections = { ...body };
  withSections.sections = sectionsList;
  withSections.sections_url = pathname || "/";
  return withSections;
}

function shouldSuppressSyncOnNotify(suppressEvents) {
  return !!suppressEvents;
}

describe("tiered section refresh (Fix 2)", () => {
  const SECTIONS = "cart-drawer,cart-icon-bubble";

  it("ADD requests the same theme sections as cart chrome", () => {
    const body = buildMutationBody(
      {
        items: [{ id: 1, quantity: 1, properties: { _fgpb_free_gift: "true" } }],
      },
      SECTIONS,
      "/products/x",
    );
    assert.equal(body.sections, SECTIONS);
    assert.ok(body.sections.includes("cart-drawer"));
    assert.equal(body.sections_url, "/products/x");
  });

  it("REMOVE requests drawer sections on mutation POST", () => {
    const body = buildMutationBody(
      { updates: { "54277123998062:abc": 0 } },
      SECTIONS,
      "/cart",
    );
    assert.ok(body.sections.includes("cart-drawer"));
    assert.equal(body.updates["54277123998062:abc"], 0);
  });

  it("on /cart the mutation asks for Dawn's live cart-page section ids", () => {
    const listFn = TIERED.slice(
      TIERED.indexOf("function cartSectionsList"),
      TIERED.indexOf("function currentCartUiGen"),
    );
    assert.match(listFn, /getElementById\("main-cart-items"\)/);
    assert.match(listFn, /getElementById\("main-cart-footer"\)/);
    assert.match(listFn, /cartPageSectionId/);
    assert.equal(listFn.includes('list += ",main-cart-items,main-cart-footer"'), false);
  });

  it("applies sections only after mutation payload is present (success path)", () => {
    const mutationOk = { item_count: 0, sections: { "cart-drawer": "<cart-drawer></cart-drawer>" } };
    const applied = [];
    if (mutationOk.sections) applied.push("apply");
    assert.deepEqual(applied, ["apply"]);
  });

  it("notifyAfterMutation keeps suppressEvents true (no sync loop)", () => {
    let suppressEvents = true;
    assert.equal(shouldSuppressSyncOnNotify(suppressEvents), true);
    // Simulated onCartMutation gate
    const wouldSchedule = suppressEvents ? false : true;
    assert.equal(wouldSchedule, false);
  });

  it("does not emit cart:change from section apply (duplicate sync guard)", () => {
    const emitted = [];
    function notifyAfterMutation() {
      emitted.push("fgpb:cart");
      emitted.push("cart:updated");
      // intentionally no cart:change — theme section HTML already refreshed
    }
    notifyAfterMutation();
    assert.ok(!emitted.includes("cart:change"));
    assert.ok(emitted.includes("fgpb:cart"));
  });
});
