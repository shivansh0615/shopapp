/**
 * Executable verification of the SHIPPED extensions/.../tiered-gift-sync.js.
 *
 * Every other test in this repo asserts on the asset's source text. These boot
 * the real IIFE in a sandboxed browser-like global and drive an actual Dawn cart
 * mutation through it, so the isolation-stage guarantees and the coordinator
 * contract are proven by execution rather than by pattern matching.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ASSET = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../extensions/free-gift-progress-bar/assets/tiered-gift-sync.js",
);
const SOURCE = readFileSync(ASSET, "utf8");

const GIFT_VARIANT = 555;
const CAMPAIGN_ID = 12;
const THRESHOLD = 50; // major units

function line({ key, variantId = 999, qty = 1, cents = 1000, gift = false }) {
  return {
    key,
    id: variantId,
    variant_id: variantId,
    quantity: qty,
    price: cents / qty,
    line_price: cents,
    final_line_price: cents,
    original_line_price: cents,
    properties: gift
      ? {
          _fgpb_free_gift: "true",
          _is_free_gift: "true",
          _fgpb_campaign_id: String(CAMPAIGN_ID),
          _fgpb_tier_id: "classic",
        }
      : {},
  };
}

function cart(items, token = "tok-1", currency = "INR") {
  return {
    token,
    currency,
    items,
    item_count: items.reduce((n, i) => n + i.quantity, 0),
    total_price: items.reduce((n, i) => n + i.final_line_price, 0),
    items_subtotal_price: items.reduce((n, i) => n + i.final_line_price, 0),
  };
}

/** Rescale a line to a new quantity the way Shopify would, allocations included. */
function reprice(item, qty) {
  const unit = Number(item.price) || 0;
  const original = unit * qty;
  const allocations = (item.line_level_discount_allocations || []).map((a) => ({
    ...a,
    amount: item.quantity ? Math.round((Number(a.amount) / item.quantity) * qty) : a.amount,
  }));
  const covered = allocations.reduce((n, a) => n + Number(a.amount), 0);
  const final = Math.max(0, original - covered);
  return {
    ...item,
    quantity: qty,
    line_price: original,
    original_price: unit,
    final_price: qty ? Math.round(final / qty) : 0,
    original_line_price: original,
    final_line_price: final,
    line_level_discount_allocations: allocations,
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    clone() {
      return jsonResponse(body, status);
    },
    async json() {
      return body;
    },
    async text() {
      return JSON.stringify(body);
    },
  };
}

/** The exact title the app provisions its automatic discount under. */
const OUR_TITLE = "Free Gift Progress Bar — Campaign Rewards";
/** Live cart.js allocation title emitted by the Discount Function message. */
const CANDIDATE_LABEL = "FREE GIFT";

/**
 * A gift line shaped by how Shopify actually priced it, which is the only thing
 * the safety postcondition is allowed to trust.
 *
 * coverage: "ours" | "foreign" | "unknown" | "partial" | "zero" | "none"
 */
function giftLine({
  key = "gift:1",
  variantId = GIFT_VARIANT,
  qty = 1,
  unitCents = 50000,
  coverage = "ours",
  campaignId = CAMPAIGN_ID,
  tierId = "classic",
} = {}) {
  const original = unitCents * qty;
  const ours = { type: "automatic", title: OUR_TITLE };
  let allocations = [];
  let final = original;
  if (coverage === "none") {
    allocations = [];
  } else if (coverage === "zero") {
    allocations = [{ amount: 0, discount_application: ours }];
    final = 0;
  } else if (coverage === "partial") {
    allocations = [{ amount: Math.floor(original / 2), discount_application: ours }];
    final = original - Math.floor(original / 2);
  } else if (coverage === "unknown") {
    allocations = [{ amount: original, discount_application: {} }];
    final = 0;
  } else if (coverage === "foreign") {
    allocations = [
      { amount: original, discount_application: { type: "automatic", title: "Summer Sale" } },
    ];
    final = 0;
  } else if (coverage === "candidate-label") {
    // Live cart.js surfaces the Function message, not the Admin node title.
    allocations = [
      { amount: original, discount_application: { type: "automatic", title: CANDIDATE_LABEL } },
    ];
    final = 0;
  } else if (coverage === "ours-as-code") {
    allocations = [
      { amount: original, discount_application: { type: "discount_code", title: OUR_TITLE } },
    ];
    final = 0;
  } else {
    allocations = [{ amount: original, discount_application: ours }];
    final = 0;
  }
  return {
    key,
    id: variantId,
    variant_id: variantId,
    quantity: qty,
    price: unitCents,
    original_price: unitCents,
    final_price: qty ? Math.round(final / qty) : 0,
    line_price: original,
    original_line_price: original,
    final_line_price: final,
    line_level_discount_allocations: allocations,
    properties: {
      _fgpb_free_gift: "true",
      _is_free_gift: "true",
      _fgpb_campaign_id: campaignId == null ? "" : String(campaignId),
      _fgpb_tier_id: tierId,
    },
  };
}

/**
 * Minimal DOM/window surface — just enough for the asset to boot and run.
 *
 * `giftShape` decides what the mock Shopify returns for a gift the asset adds,
 * so a test can reproduce the discount outcomes the postcondition must survive.
 * `onCartRead` lets a test change the authoritative cart between reads, which is
 * how a late-arriving discount allocation is simulated.
 */
function createHarness({
  stage,
  initialCart,
  giftShape,
  onCartRead,
  onWidgetState,
  onAddPosted,
  onSections,
  surfaces,
  pathname,
  poisonAddResponse,
  customerShape,
}) {
  let activeGiftShape = giftShape;
  const posts = [];
  const gets = [];
  const diag = [];
  const cartReads = [];
  let current = initialCart;

  const listeners = new Map();
  const noopEl = {
    classList: { contains: () => false, add() {}, remove() {} },
    getAttribute: () => null,
    setAttribute() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    appendChild() {},
    style: { setProperty() {}, removeProperty() {} },
  };

  const document = {
    readyState: "complete",
    documentElement: noopEl,
    head: noopEl,
    body: noopEl,
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(fn);
    },
    removeEventListener() {},
    dispatchEvent(evt) {
      for (const fn of listeners.get(evt && evt.type) || []) fn(evt);
      return true;
    },
    createElement: () => ({ ...noopEl, dataset: {} }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === "cart-items-component" && surfaces ? surfaces : []),
  };

  const storage = () => {
    const map = new Map();
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: (k) => map.delete(k),
    };
  };

  const widgetState = {
    enabled: true,
    rewardType: "FREE_GIFT",
    campaignId: CAMPAIGN_ID,
    threshold: THRESHOLD,
    autoAddGift: true,
    gift: { variantId: GIFT_VARIANT },
  };

  // Distinguishes Dawn's own mutation from one UpsellTrix issued.
  let customerCallInFlight = false;
  let booted = false;

  async function serverFetch(url, init) {
    const method = String((init && init.method) || "GET").toUpperCase();
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (String(url).includes("/apps/")) {
      gets.push(String(url));
      // Lets a test move the cart on while this response is in flight.
      const resolved = onWidgetState ? await onWidgetState(String(url)) : undefined;
      return jsonResponse(resolved === undefined ? widgetState : resolved);
    }
    if (method === "POST") {
      // A customer POST is Dawn's own; the test already supplied the cart it
      // produces. Only UpsellTrix's posts are applied (and recorded) here.
      if (customerCallInFlight) {
        customerCallInFlight = false;
        if (customerShape) return jsonResponse(customerShape(current));
        return jsonResponse({ ...current, sections: {} });
      }
      posts.push({ url: String(url), body });
      if (String(url).includes("/cart/add.js")) {
        const items = (body.items || []).map((it, n) => {
          const key = `gift:${it.id}:${n}`;
          return activeGiftShape
            ? activeGiftShape({ key, variantId: it.id, properties: it.properties })
            : giftLine({ key, variantId: it.id, unitCents: 0, coverage: "none" });
        });
        current = cart([...current.items, ...items], current.token);
        if (onAddPosted) await onAddPosted();
      } else if (String(url).includes("/cart/change.js")) {
        const qty = Number(body.quantity);
        current = cart(
          current.items
            .map((i) => (i.key === body.id && qty > 0 ? reprice(i, qty) : i))
            .filter((i) => !(i.key === body.id && qty === 0)),
          current.token,
        );
      } else if (String(url).includes("/cart/update.js")) {
        const updates = body.updates || {};
        current = cart(
          current.items
            .map((i) => (updates[i.key] != null ? reprice(i, Number(updates[i.key])) : i))
            .filter((i) => !(updates[i.key] != null && Number(updates[i.key]) === 0)),
          current.token,
        );
      }
      if (poisonAddResponse && String(url).includes("/cart/add.js")) {
        // The mutation response deliberately disagrees with the authoritative
        // cart: any decision taken from it would be wrong.
        return jsonResponse({
          ...current,
          items: current.items.map((i) =>
            i.line_level_discount_allocations && i.line_level_discount_allocations.length
              ? {
                  ...i,
                  line_level_discount_allocations: [],
                  final_line_price: i.original_line_price,
                }
              : i,
          ),
          sections: {},
        });
      }
      const requested = body && body.sections ? String(body.sections).split(",") : [];
      let sections = {};
      if (onSections) {
        const built = await onSections(current, requested, body);
        if (built && typeof built === "object") sections = built;
      }
      return jsonResponse({ ...current, sections });
    }
    gets.push(String(url));
    if (String(url).includes("/cart.js")) {
      cartReads.push(cartReads.length + 1);
      if (onCartRead) {
        const replaced = onCartRead(cartReads.length, current);
        if (replaced) current = replaced;
      }
    }
    return jsonResponse(current);
  }

  const window = {
    location: { pathname: pathname || "/", search: "", href: "https://shop.test/" },
    localStorage: storage(),
    sessionStorage: storage(),
    document,
    fetch: (url, init) => serverFetch(url, init),
    addEventListener() {},
    removeEventListener() {},
    __fgpbCartUiGen: 0,
    __FGPB_RT: {
      stage,
      flags: {
        stage,
        enabled: stage > 0,
        readCart: stage >= 1,
        renderProgress: stage >= 2,
        progressRecovery: stage >= 3,
        evaluateGifts: stage >= 4,
        mutateGifts: stage >= 5,
        optimisticPaint: stage >= 5,
        recommendations: stage >= 5,
        applyDawnSections: false,
      },
      note: (type, data) => {
        diag.push({ type, data });
        return null;
      },
    },
    __fgpbLastWidgetState: widgetState,
  };
  window.window = window;
  window.self = window;
  window.top = window;

  class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = (init && init.detail) || null;
      this.bubbles = !!(init && init.bubbles);
    }
  }

  class XMLHttpRequest {
    open() {}
    send() {}
    addEventListener() {}
  }

  const sandbox = {
    window,
    document,
    location: window.location,
    sessionStorage: window.sessionStorage,
    localStorage: window.localStorage,
    fetch: window.fetch,
    CustomEvent,
    XMLHttpRequest,
    setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; },
    clearTimeout,
    Promise,
    Date,
    Math,
    JSON,
    Number,
    String,
    Object,
    Array,
    Boolean,
    Error,
    console: { log() {}, warn() {}, error() {}, info() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: "tiered-gift-sync.js" });

  return {
    window,
    posts,
    gets,
    diag,
    cartReads,
    get cart() {
      return current;
    },
    setCart(next) {
      current = next;
    },
    setGiftShape(next) {
      activeGiftShape = next;
    },
    /** Simulate the shopper advancing the cart generation mid-flight. */
    bumpGeneration() {
      window.__fgpbCartUiGen = Number(window.__fgpbCartUiGen || 0) + 1;
    },
    /** Simulate Dawn performing a customer cart mutation through window.fetch. */
    async dawnMutation(url, body, resultCart) {
      // The asset runs a boot reconcile on a timer; a mutation that lands while
      // it is still processing is coalesced, which is correct but not what these
      // tests are measuring.
      if (!booted) {
        booted = true;
        await settle(300);
        posts.length = 0;
        gets.length = 0;
        diag.length = 0;
      }
      current = resultCart;
      customerCallInFlight = true;
      const res = await window.fetch(url, { method: "POST", body: JSON.stringify(body) });
      await settle();
      return res;
    },
  };
}

/** Let the asset's microtasks and setTimeout(0)/(80) work drain. */
async function settle(ms = 260) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 10));
  }
}

const giftPosts = (h) => h.posts.filter((p) => p.url.includes("/cart/add.js"));
const removePosts = (h) =>
  h.posts.filter((p) => p.url.includes("/cart/change.js") || p.url.includes("/cart/update.js"));

describe("shipped tiered-gift-sync: stage isolation is enforced at runtime", () => {
  for (const stage of [0, 1, 2, 3, 4]) {
    it(`stage ${stage} performs no gift POST after a real customer mutation`, async () => {
      const below = cart([line({ key: "p1", cents: 1000 })]);
      const h = createHarness({ stage, initialCart: below });
      // Customer adds enough to cross the threshold.
      const above = cart([line({ key: "p1", cents: 9000 })]);
      await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 9 }, above);
      await settle();
      assert.deepEqual(giftPosts(h), [], `stage ${stage} must not add a gift`);
      assert.deepEqual(removePosts(h), [], `stage ${stage} must not mutate lines`);
    });
  }

  it("exposes no manual claim entry point below stage 4", async () => {
    for (const stage of [0, 1, 2, 3]) {
      const h = createHarness({ stage, initialCart: cart([line({ key: "p1", cents: 9000 })]) });
      await settle(300);
      assert.equal(
        typeof h.window.__fgpbClaimTierGifts,
        "undefined",
        `stage ${stage} must not expose the claim hook`,
      );
    }
  });

  it("refuses the manual claim button at stage 4 even though the cart qualifies", async () => {
    const h = createHarness({ stage: 4, initialCart: cart([line({ key: "p1", cents: 9000 })]) });
    await settle(300);
    h.posts.length = 0;
    assert.equal(typeof h.window.__fgpbClaimTierGifts, "function");
    const res = await h.window.__fgpbClaimTierGifts();
    await settle();
    assert.equal(res.stageBlocked, true);
    assert.deepEqual(giftPosts(h), [], "the claim button must not POST below stage 5");
  });

  it("honours the manual claim button at stage 5", async () => {
    // Boot below the threshold so the boot reconcile has nothing to add and the
    // claim is genuinely the thing that adds the gift.
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    await settle(300);
    h.posts.length = 0;
    h.setCart(cart([line({ key: "p1", cents: 9000 })]));
    await h.window.__fgpbClaimTierGifts();
    await settle();
    assert.equal(giftPosts(h).length, 1);
  });

  it("stage 4 still evaluates eligibility and reports the plan it withheld", async () => {
    const h = createHarness({ stage: 4, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    const above = cart([line({ key: "p1", cents: 9000 })]);
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 9 }, above);
    await settle();
    const dryRun = h.diag.find((d) => d.type === "gift-plan-dry-run");
    assert.ok(dryRun, "stage 4 must report a dry-run plan");
    // Values cross the vm realm boundary, so normalise before comparing.
    assert.deepEqual(Array.from(dryRun.data.actions, (a) => String(a.type)), ["ADD"]);
    assert.deepEqual(giftPosts(h), []);
  });

  it("stage 5 does add exactly one gift once the threshold is crossed", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    const above = cart([line({ key: "p1", cents: 9000 })]);
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 9 }, above);
    await settle();
    const adds = giftPosts(h);
    assert.equal(adds.length, 1, "exactly one gift add");
    assert.equal(adds[0].body.items[0].id, GIFT_VARIANT);
    assert.equal(adds[0].body.items[0].properties._fgpb_free_gift, "true");
    assert.equal(adds[0].body.items[0].properties._fgpb_campaign_id, String(CAMPAIGN_ID));
  });
});

describe("shipped tiered-gift-sync: coordinator contract in execution", () => {
  it("emits the full lifecycle diagnostics stage 5 testing relies on", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 9 },
      cart([line({ key: "p1", cents: 9000 })]),
    );
    await settle();
    const types = new Set(h.diag.map((d) => d.type));
    for (const required of [
      "customer-generation",
      "eligibility",
      "gift-plan",
      "pre-post-validate",
      "gift-post-result",
      "compensating-reconcile",
    ]) {
      assert.ok(types.has(required), `missing diagnostic: ${required}`);
    }
  });

  it("advances the customer generation even while a gift mutation is processing", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    const before = h.window.__fgpbCartUiGen;
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 9 },
      cart([line({ key: "p1", cents: 9000 })]),
    );
    assert.ok(h.window.__fgpbCartUiGen > before, "customer mutation must bump the generation");
    await settle();
  });

  it("does not add a gift when the customer drops below the threshold first", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 9000 })]) });
    // Customer removes the qualifying product entirely.
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 0 }, cart([]));
    await settle();
    assert.deepEqual(giftPosts(h), []);
  });

  it("leaves no orphaned gift when eligibility is lost right after crossing", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 9 },
      cart([line({ key: "p1", cents: 9000 })]),
    );
    await settle();
    assert.equal(h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true").length, 1);

    // Now the shopper empties the qualifying products.
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 0 },
      cart(h.cart.items.filter((i) => i.key !== "p1")),
    );
    await settle();
    assert.equal(
      h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true").length,
      0,
      "gift must not outlive the products that earned it",
    );
  });

  it("does not duplicate the gift when the cart changes while still eligible", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 9000 })]) });
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 9 },
      cart([line({ key: "p1", cents: 9000 })]),
    );
    await settle();
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 10 },
      cart([line({ key: "p1", cents: 10000 }), ...h.cart.items.filter((i) => i.key !== "p1")]),
    );
    await settle();
    assert.equal(
      h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true").length,
      1,
      "exactly one gift after a second eligible mutation",
    );
  });

  it("keeps a same-SKU paid line paid while the tagged gift is reconciled", async () => {
    const paidCopy = line({ key: "paid-gift-sku", variantId: GIFT_VARIANT, cents: 9000 });
    const h = createHarness({ stage: 5, initialCart: cart([paidCopy]) });
    await h.dawnMutation("/cart/change.js", { id: "paid-gift-sku", quantity: 1 }, cart([paidCopy]));
    await settle();

    const paid = h.cart.items.filter((i) => i.properties._fgpb_free_gift !== "true");
    assert.equal(paid.length, 1, "the paid same-SKU line must survive");
    assert.equal(paid[0].key, "paid-gift-sku");
    assert.equal(
      h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true").length,
      1,
      "and it is distinct from the tagged gift",
    );
    // Nothing may have removed the paid line.
    assert.equal(
      h.posts.some(
        (p) => p.body && (p.body.id === "paid-gift-sku" || (p.body.updates || {})["paid-gift-sku"] === 0),
      ),
      false,
    );
  });

  it("reaches idle with no recurring requests (build 137 baseline)", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 9000 })]) });
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 9 },
      cart([line({ key: "p1", cents: 9000 })]),
    );
    await settle(400);
    const posts = h.posts.length;
    const gets = h.gets.length;
    await settle(500);
    assert.equal(h.posts.length, posts, "no recurring cart mutations while idle");
    assert.equal(h.gets.length, gets, "no recurring cart reads while idle");
  });
});

/**
 * Build 138: the safety postcondition, proven by booting the shipped asset and
 * letting it react to the discount outcomes Shopify can actually produce.
 */
describe("shipped tiered-gift-sync: the gift safety postcondition", () => {
  /** Drive a real customer mutation across the threshold so the asset adds a gift. */
  async function addGift(options = {}) {
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "p1", cents: 1000 })]),
      ...options,
    });
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 9 },
      cart([line({ key: "p1", cents: 9000 }), ...(options.extraLines || [])]),
    );
    await settle(700);
    return h;
  }

  const tagged = (h) => h.cart.items.filter((i) => i.properties._fgpb_free_gift === "true");
  const graceCount = (h) => h.diag.filter((d) => d.type === "gift-safety-grace").length;
  const audits = (h) => h.diag.filter((d) => d.type === "gift-safety-audit");
  const shape = (coverage, extra = {}) => (s) => giftLine({ ...s, coverage, ...extra });

  it("routes a real gift POST through the integrated coordinator", async () => {
    const h = await addGift({ giftShape: shape("ours") });
    assert.equal(giftPosts(h).length, 1, "the asset must have actually added a gift");
    assert.ok(audits(h).length > 0, "the add must be followed by a safety audit");
    assert.ok(
      h.gets.filter((u) => u.includes("/cart.js")).length > 0,
      "the audit must come from an authoritative read",
    );
    // Live triage depends on seeing the label Shopify actually used.
    const observed = audits(h).pop().data.tagged;
    assert.equal(observed.length, 1);
    assert.equal(observed[0].allocations[0].title, OUR_TITLE);
    assert.equal(observed[0].allocations[0].attributed, "ours");
    assert.equal(observed[0].fullyFree, true);
  });

  it("decides from a fresh authoritative read, not from the mutation response", async () => {
    // The add response reports the gift as fully charged; only /cart.js shows the
    // allocation. Keeping the gift is only possible if settle() re-read the cart.
    const h = await addGift({ giftShape: shape("ours"), poisonAddResponse: true });
    assert.equal(tagged(h).length, 1, "a stale mutation response must not condemn the gift");
    assert.equal(audits(h).pop().data.safe, true);
    assert.deepEqual(removePosts(h), [], "nothing should have been corrected");
  });

  it("executes the correction mutation rather than only planning it", async () => {
    const h = await addGift({ giftShape: shape("ours", { campaignId: 999 }) });
    const giftKey = `gift:${GIFT_VARIANT}:0`;
    assert.ok(
      removePosts(h).some((p) => p.body && p.body.id === giftKey && p.body.quantity === 0),
      "the gift for an unsynchronised campaign must be removed by a real POST",
    );
    assert.equal(tagged(h).length, 0);
  });

  it("spends zero grace removing a gift for a campaign absent from the config", async () => {
    const h = await addGift({ giftShape: shape("ours", { campaignId: 999 }) });
    assert.equal(graceCount(h), 0, "a provable fault must not wait for a discount");
    assert.equal(tagged(h).length, 0);
  });

  it("allows exactly one bounded grace read for a late discount allocation", async () => {
    let unprovenReads = 0;
    const h = await addGift({
      giftShape: shape("none"),
      onCartRead: (_n, c) => {
        const unproven = c.items.some(
          (i) => i.properties._fgpb_free_gift === "true" && i.final_line_price > 0,
        );
        if (!unproven) return null;
        unprovenReads += 1;
        if (unprovenReads < 2) return null;
        // The allocation lands on the second read, inside the grace budget.
        return cart(
          c.items.map((i) =>
            i.properties._fgpb_free_gift === "true"
              ? giftLine({ key: i.key, variantId: i.variant_id, coverage: "ours" })
              : i,
          ),
          c.token,
        );
      },
    });
    assert.equal(graceCount(h), 1, "grace is used once and only once");
    assert.equal(tagged(h).length, 1, "the gift survives once Shopify proves it is free");
    assert.deepEqual(removePosts(h), []);
  });

  it("normalizes an over-cap quantity by line key without touching the paid same-SKU line", async () => {
    const paid = line({ key: "paid-555", variantId: GIFT_VARIANT, cents: 4000 });
    const h = await addGift({ giftShape: shape("ours", { qty: 2 }), extraLines: [paid] });
    const giftKey = `gift:${GIFT_VARIANT}:0`;

    const updates = h.posts.filter((p) => p.url.includes("/cart/update.js"));
    assert.equal(updates.length, 1, "one normalization");
    assert.deepEqual(Object.keys(updates[0].body.updates), [giftKey], "only the tagged line");
    assert.equal(updates[0].body.updates[giftKey], 1);

    assert.equal(tagged(h).length, 1);
    assert.equal(tagged(h)[0].quantity, 1, "capped at the configured gift quantity");
    const paidNow = h.cart.items.find((i) => i.key === "paid-555");
    assert.equal(paidNow.quantity, 1, "the paid same-SKU line is untouched");
    assert.equal(paidNow.final_line_price, 4000);
  });

  it("removes a gift covered only by an unattributable allocation", async () => {
    const h = await addGift({ giftShape: shape("unknown") });
    assert.equal(giftPosts(h).length, 1);
    assert.equal(tagged(h).length, 0, "unknown attribution is not proof of a free gift");
    assert.ok(removePosts(h).length > 0);
  });

  it("removes a gift covered only by somebody else's discount", async () => {
    const h = await addGift({ giftShape: shape("foreign") });
    assert.equal(giftPosts(h).length, 1, "the gift must have been added before it is judged");
    assert.equal(tagged(h).length, 0, "a foreign discount does not validate our gift");
    assert.ok(removePosts(h).length > 0);
  });

  it("keeps a gift whose complete allocation is positively attributed to us", async () => {
    const h = await addGift({ giftShape: shape("ours") });
    assert.equal(tagged(h).length, 1);
    assert.equal(tagged(h)[0].final_line_price, 0);
    assert.deepEqual(removePosts(h), [], "a provably free gift must never be corrected");
    assert.equal(graceCount(h), 0);
  });

  it("removes a gift whose allocation only partly covers it", async () => {
    const h = await addGift({ giftShape: shape("partial") });
    assert.equal(giftPosts(h).length, 1);
    assert.equal(tagged(h).length, 0, "a partly charged gift must never reach checkout");
    assert.ok(removePosts(h).length > 0);
  });

  it("removes a gift whose allocation is present but zero", async () => {
    const h = await addGift({ giftShape: shape("zero") });
    assert.equal(giftPosts(h).length, 1);
    assert.equal(tagged(h).length, 0);
    assert.ok(removePosts(h).length > 0);
  });

  it("gates FREE presentation on authoritative evidence, never on the tag", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    await settle(300);
    const canRenderFree = h.window.__fgpbCanRenderFree;
    assert.equal(typeof canRenderFree, "function", "presentation needs a shared gate");

    assert.equal(canRenderFree(giftLine({ coverage: "ours" })), true);
    assert.equal(canRenderFree(giftLine({ coverage: "candidate-label" })), true);
    for (const coverage of ["unknown", "foreign", "partial", "zero", "none"]) {
      assert.equal(canRenderFree(giftLine({ coverage })), false, `${coverage} must not render FREE`);
    }
    assert.equal(
      canRenderFree({
        properties: { _fgpb_free_gift: "true" },
        original_line_price: 50000,
        final_line_price: 50000,
      }),
      false,
      "the _fgpb_* tag alone is never proof",
    );
    assert.equal(
      canRenderFree(line({ key: "p1", cents: 0 })),
      false,
      "an untagged line is not ours to label",
    );
  });

  it("leaves a paid same-SKU line editable after the gift is settled", async () => {
    const paid = line({ key: "paid-555", variantId: GIFT_VARIANT, cents: 4000 });
    const h = await addGift({ giftShape: shape("ours"), extraLines: [paid] });
    assert.equal(tagged(h).length, 1);

    const edited = cart([
      line({ key: "p1", cents: 9000 }),
      line({ key: "paid-555", variantId: GIFT_VARIANT, qty: 2, cents: 8000 }),
      ...tagged(h),
    ]);
    h.posts.length = 0;
    await h.dawnMutation("/cart/change.js", { id: "paid-555", quantity: 2 }, edited);
    await settle(500);

    const paidNow = h.cart.items.find((i) => i.key === "paid-555");
    assert.equal(paidNow.quantity, 2, "the shopper's edit to the paid line must stick");
    assert.equal(
      h.posts.some(
        (p) => p.body && (p.body.id === "paid-555" || (p.body.updates || {})["paid-555"] != null),
      ),
      false,
      "UpsellTrix must never write to a paid line",
    );
    assert.equal(tagged(h).length, 1, "and the gift is still valid");
  });

  it("keeps a gift labelled with the Function's cart.js message FREE GIFT", async () => {
    const h = await addGift({ giftShape: shape("candidate-label") });
    assert.equal(giftPosts(h).length, 1);
    assert.equal(tagged(h).length, 1);
    const observed = audits(h).pop().data.tagged[0];
    assert.equal(observed.allocations[0].title, CANDIDATE_LABEL);
    assert.equal(observed.allocations[0].attributed, "ours");
    assert.equal(observed.fullyFree, true);
    assert.deepEqual(removePosts(h), []);
    assert.equal(
      h.diag.some((d) => d.type === "gift-safety-latched"),
      false,
      "a correctly attributed Function message must not latch",
    );
  });

  it("removes a gift carrying our title under a discount-code application", async () => {
    const h = await addGift({ giftShape: shape("ours-as-code") });
    assert.equal(giftPosts(h).length, 1);
    assert.equal(tagged(h).length, 0, "a removable code is not proof the gift is free");
  });

  it("keeps a genuinely zero-priced gift and records it as intrinsically zero", async () => {
    const h = await addGift({ giftShape: shape("none", { unitCents: 0 }) });
    assert.equal(tagged(h).length, 1);
    const observed = audits(h).pop().data.tagged[0];
    assert.equal(observed.evidenceKind, "intrinsically-zero");
    assert.equal(observed.originalUnit, 0);
    assert.equal(observed.finalUnit, 0);
    assert.deepEqual(removePosts(h), []);
  });

  it("refuses the zero-price exception when the unit price is positive", async () => {
    // Line totals read zero but the unit price does not. The exception must be
    // unreachable, so the gift falls back to needing a real allocation.
    const h = await addGift({
      giftShape: (s) => ({
        ...giftLine({ ...s, coverage: "none", unitCents: 0 }),
        price: 50000,
        original_price: 50000,
      }),
    });
    assert.equal(tagged(h).length, 0);
    assert.equal(audits(h)[0].data.tagged[0].evidenceKind, null);
  });

  it("records the discount-confirmed evidence kind for an attributed gift", async () => {
    const h = await addGift({ giftShape: shape("ours") });
    assert.equal(audits(h).pop().data.tagged[0].evidenceKind, "discount-confirmed");
  });

  it("exposes a read-only attribution probe that captures the live labels", async () => {
    const h = await addGift({ giftShape: shape("ours") });
    h.posts.length = 0;
    const report = await h.window.__fgpbAttributionProbe();

    assert.deepEqual(h.posts, [], "the probe must never mutate the cart");
    assert.deepEqual(Array.from(report.allowlist), [
      "upselltrix free gift",
      "free gift progress bar - campaign rewards",
      "FREE GIFT",
    ]);
    assert.deepEqual(Array.from(report.applicationTypes), ["automatic"]);

    const alloc = report.tagged[0].allocations[0];
    assert.equal(alloc.title, OUR_TITLE);
    assert.equal(alloc.type, "automatic");
    assert.equal(alloc.amount, 50000);
    assert.equal(alloc.normalizedTitle, "free gift progress bar - campaign rewards");
    assert.equal(alloc.attributed, "ours");
  });

  it("adds an undiscounted gift once, removes it once, then settles idle", async () => {
    // The live failure: eligible cart, Shopify charges for the gift, safety
    // removes it, eligibility is still true, planner adds it again forever.
    const h = await addGift({ giftShape: shape("none") });
    await settle(1500);

    assert.equal(giftPosts(h).length, 1, "exactly one add, ever");
    assert.equal(
      removePosts(h).filter((p) => p.body && p.body.quantity === 0).length,
      1,
      "exactly one removal",
    );
    assert.equal(tagged(h).length, 0);
    assert.ok(
      h.diag.some((d) => d.type === "gift-safety-latched"),
      "the failure must be latched",
    );
  });

  it("refuses to re-add the same campaign and variant on an unchanged cart", async () => {
    const h = await addGift({ giftShape: shape("none") });
    h.posts.length = 0;
    // Every trigger the planner has: cart events, and a fresh eligible mutation
    // that does not change the qualifying lines.
    for (let i = 0; i < 3; i += 1) {
      h.window.document.dispatchEvent({ type: "fgpb:cart", detail: {} });
      // eslint-disable-next-line no-await-in-loop
      await settle(400);
    }
    assert.deepEqual(giftPosts(h), [], "no automatic re-add while latched");
    assert.ok(h.diag.some((d) => d.type === "gift-add-latched"));
  });

  it("does not clear the latch merely because the gift was removed", async () => {
    const h = await addGift({ giftShape: shape("none") });
    // The gift is already gone; the qualifying lines are untouched. A latch keyed
    // on the whole cart would have cleared itself here and looped.
    assert.equal(tagged(h).length, 0);
    h.posts.length = 0;
    await settle(900);
    assert.deepEqual(giftPosts(h), []);
    assert.equal(
      h.diag.filter((d) => d.type === "gift-safety-latch-cleared").length,
      0,
      "removing the gift is not a meaningful change",
    );
  });

  it("clears the latch when the qualifying cart actually changes", async () => {
    const h = await addGift({ giftShape: shape("none") });
    h.posts.length = 0;
    h.diag.length = 0;
    // The shopper edits a paid line, and the discount is fixed meanwhile.
    h.setGiftShape(shape("ours"));
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 12 },
      cart([line({ key: "p1", cents: 12000 })]),
    );
    await settle(700);

    assert.ok(
      h.diag.some(
        (d) => d.type === "gift-safety-latch-cleared" && d.data.reason === "qualifying-cart-changed",
      ),
      "a real cart change must release the latch",
    );
    assert.equal(giftPosts(h).length, 1, "and the gift is added again, once");
    assert.equal(tagged(h).length, 1);
  });

  /**
   * Cross the threshold through a plain cart event so the slow path — the one
   * that actually fetches campaign state — is what plans the gift. `arm()`
   * makes the shopper's minus click land while that request is in flight.
   */
  function harnessWithLateShopperClick(onInFlight) {
    let armed = false;
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "p1", cents: 1000 })]),
      giftShape: shape("ours"),
      onWidgetState: () => {
        if (!armed) return;
        armed = false;
        onInFlight(h);
      },
    });
    return {
      h,
      arm() {
        armed = true;
      },
    };
  }

  it("refuses a POST authorised by a stale widget-state subtotal", async () => {
    // Generation 4 → 5: the response describes $2,999.80, the cart is now lower.
    const { h, arm } = harnessWithLateShopperClick((harness) => {
      harness.bumpGeneration();
      harness.setCart(cart([line({ key: "p1", cents: 2000 })]));
    });
    await settle(400);
    h.posts.length = 0;
    h.diag.length = 0;
    h.setCart(cart([line({ key: "p1", cents: 9000 })], "tok-1", "EUR"));
    arm();
    h.window.document.dispatchEvent({ type: "fgpb:cart", detail: {} });
    await settle(900);

    assert.deepEqual(giftPosts(h), [], "a superseded response must not authorise an add");
    assert.ok(
      h.diag.some((d) => d.type === "widget-state-stale"),
      "the stale response must be discarded, not used",
    );
  });

  it("produces zero adds when the threshold is lost mid-request", async () => {
    const { h, arm } = harnessWithLateShopperClick((harness) => {
      harness.bumpGeneration();
      harness.setCart(cart([line({ key: "p1", cents: 1000 })]));
    });
    await settle(400);
    h.posts.length = 0;
    h.setCart(cart([line({ key: "p1", cents: 9000 })], "tok-1", "EUR"));
    arm();
    h.window.document.dispatchEvent({ type: "fgpb:cart", detail: {} });
    await settle(900);

    assert.deepEqual(giftPosts(h), []);
    assert.deepEqual(tagged(h), []);
  });

  it("holds request counts steady across an idle observation window", async () => {
    const h = await addGift({ giftShape: shape("none") });
    await settle(1200);
    const posts = h.posts.length;
    const gets = h.gets.length;
    await settle(2500);
    assert.equal(h.posts.length, posts, "no mutations during the idle window");
    assert.equal(h.gets.length, gets, "no reads during the idle window");
  });

  it("issues no requests at all while idle below the threshold", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]) });
    await settle(400);
    const posts = h.posts.length;
    const gets = h.gets.length;
    await settle(600);
    assert.equal(h.posts.length, posts, "no mutations while idle");
    assert.equal(h.gets.length, gets, "no reads while idle");
    assert.deepEqual(tagged(h), []);
  });
});



describe("campaign arbitration on the shipped storefront runtime", () => {
  const state = (id, variantId, threshold = 50) => ({ enabled: true, rewardType: "FREE_GIFT", campaignId: id, threshold, autoAddGift: true, gift: { variantId } });
  const giftShape = ({ key, variantId, properties }) => giftLine({ key, variantId, campaignId: properties._fgpb_campaign_id, tierId: properties._fgpb_tier_id });
  const withSpend = (h, cents) => cart([line({ key: "p1", cents }), ...h.cart.items.filter(i => i.properties?._fgpb_free_gift === "true")]);
  const gifts = h => h.cart.items.filter(i => i.properties?._fgpb_free_gift === "true");

  it("changes A to B and back as paid spend crosses goals, without a page reload", async () => {
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]), giftShape,
      onWidgetState: url => Number(new URL(url, "https://shop.test").searchParams.get("cartSubtotal")) >= 100 ? state(13, 777, 100) : state(12, 555),
    });
    for (const [cents, id, variant] of [[7000, "12", 555], [12000, "13", 777], [7000, "12", 555]]) {
      await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 1 }, withSpend(h, cents));
      await settle(1200);
      assert.equal(gifts(h).length, 1);
      assert.equal(gifts(h)[0].properties._fgpb_campaign_id, id);
      assert.equal(gifts(h)[0].variant_id, variant);
      assert.equal(h.cart.items.find(i => i.key === "p1").final_line_price, cents);
    }
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 1 }, withSpend(h, 1000));
    await settle(600);
    assert.equal(gifts(h).length, 0);
  });
  it("replaces the gift when a merchant changes the variant within the same campaign/tier", async () => {
    let selected = state(12, 555);
    const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]), giftShape, onWidgetState: () => selected });
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 1 }, withSpend(h, 7000));
    await settle(600);
    selected = state(12, 888);
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 1 }, withSpend(h, 8000));
    await settle(600);
    assert.deepEqual(gifts(h).map(i => i.variant_id), [888]);
  });
  for (const response of [{ enabled: false }, { enabled: true, campaignId: 22, rewardType: "PERCENTAGE_DISCOUNT", threshold: 50 }]) {
    it("removes obsolete gifts after authoritative " + response.rewardType + "/enabled=" + response.enabled, async () => {
      let selected = state(12, 555);
      const h = createHarness({ stage: 5, initialCart: cart([line({ key: "p1", cents: 1000 })]), giftShape, onWidgetState: () => selected });
      await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 1 }, withSpend(h, 7000));
      await settle(600);
      selected = response;
      await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 1 }, withSpend(h, 8000));
      await settle(600);
      assert.equal(gifts(h).length, 0);
      assert.equal(h.cart.items[0].key, "p1");
    });
  }
});

it("manual-only offers wait for a shopper claim", async () => {
 const h = createHarness({stage:5, initialCart:cart([line({key:"p1",cents:9000})]), onWidgetState: () => ({enabled:true,rewardType:"FREE_GIFT",campaignId:CAMPAIGN_ID,threshold:THRESHOLD,autoAddGift:false,gift:{variantId:GIFT_VARIANT}})});
 await settle(700);
 assert.equal(giftPosts(h).length, 0);
 await h.window.__fgpbClaimTierGifts();
 await settle();
 assert.equal(giftPosts(h).length, 1);
});

const earnedGift = (spec) => giftLine({ ...spec, coverage: "ours" });
const taggedGifts = (h) => h.cart.items.filter((i) => i.properties && i.properties._fgpb_free_gift === "true");

describe("stale eligibility must not award a gift", () => {
  it("celebrates once when the added gift is still earned", async () => {
    const celebrated = [];
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "p1", cents: 1000 })]),
      giftShape: earnedGift,
    });
    h.window.document.addEventListener("fgpb:gift-added", () => celebrated.push("gift-added"));
    await settle(400);
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 9 }, cart([line({ key: "p1", cents: 9000 })]));
    await settle(800);
    assert.equal(taggedGifts(h).length, 1);
    assert.deepEqual(celebrated, ["gift-added"]);
  });

  it("drops a delayed qualifying response after the cart falls below the threshold", async () => {
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let hold = false;
    const celebrated = [];
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "p1", cents: 1000 })]),
      giftShape: earnedGift,
      onWidgetState: async () => {
        if (!hold) return undefined;
        hold = false;
        await gate;
        return {
          enabled: true,
          rewardType: "TIERED_FREE_GIFTS",
          campaignId: CAMPAIGN_ID,
          autoAddGift: true,
          unlockedGifts: [{ tierId: "t1", threshold: THRESHOLD, variantId: GIFT_VARIANT, quantity: 1 }],
          rewardTiers: [{ tierId: "t1", threshold: THRESHOLD, variantId: GIFT_VARIANT }],
        };
      },
    });
    h.window.document.addEventListener("fgpb:gift-added", () => celebrated.push("gift-added"));
    await settle(400);
    h.posts.length = 0;
    hold = true;
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 9 }, cart([line({ key: "p1", cents: 9000 })]));
    assert.equal(taggedGifts(h).length, 1, "the cached campaign adds the gift before widget-state returns");
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 1 }, cart([line({ key: "p1", cents: 1000 })]));
    assert.equal(taggedGifts(h).length, 0, "the drop removes the gift while the old response is still held");
    release();
    await settle(900);
    assert.equal(taggedGifts(h).length, 0, "the old response must not add a gift");
    assert.equal(giftPosts(h).length, 1);
    assert.deepEqual(celebrated, ["gift-added"]);
    assert.equal(h.cart.items[0].key, "p1");
    assert.equal(h.cart.items[0].final_line_price, 1000);
  });

  it("removes an in-flight gift after the cart drops and does not celebrate", async () => {
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let hold = false;
    const celebrated = [];
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "p1", cents: 1000 })]),
      giftShape: earnedGift,
      onAddPosted: async () => {
        if (!hold) return;
        hold = false;
        await gate;
      },
    });
    h.window.document.addEventListener("fgpb:gift-added", () => celebrated.push("gift-added"));
    await settle(400);
    h.posts.length = 0;
    hold = true;
    await h.dawnMutation("/cart/change.js", { id: "p1", quantity: 9 }, cart([line({ key: "p1", cents: 9000 })]));
    const gift = taggedGifts(h)[0];
    assert.ok(gift, "Shopify has accepted the add before its response is released");
    const paidCopy = line({ key: "paid-copy", variantId: GIFT_VARIANT, cents: 2000 });
    await h.dawnMutation(
      "/cart/change.js",
      { id: "p1", quantity: 1 },
      cart([line({ key: "p1", cents: 1000 }), gift, paidCopy]),
    );
    release();
    await settle(1200);
    assert.equal(taggedGifts(h).length, 0, "the unearned tagged gift must be removed");
    const paid = h.cart.items.find((i) => i.key === "paid-copy");
    assert.ok(paid, "a paid copy of the gift variant must stay");
    assert.notEqual(paid.properties && paid.properties._fgpb_free_gift, "true");
    assert.equal(paid.final_line_price, 2000);
    assert.equal(
      h.posts.some(
        (p) => p.body && (p.body.id === "paid-copy" || (p.body.updates || {})["paid-copy"] === 0),
      ),
      false,
    );
    assert.deepEqual(celebrated, []);
  });
});

const PAGE_SECTION = "template--savor__cart-section";
const DRAWER_SECTION = "cart-drawer-section";
const STALE_CART_PAGE = "Collection Snowboard $110.00\nEstimated total $659.00";

function savorSurface(sectionId) {
  return {
    tagName: "CART-ITEMS-COMPONENT",
    dataset: { sectionId },
    getAttribute(name) {
      return name === "data-section-id" ? sectionId : null;
    },
    innerHTML: "",
    refs: { cartItemRows: [] },
    querySelectorAll() {
      return [];
    },
  };
}

function renderSavorCart(snapshot) {
  const items = (snapshot && snapshot.items) || [];
  if (!items.length) return "Your cart is empty";
  const lines = items.map((item) => {
    const gift = item.properties && item.properties._fgpb_free_gift === "true";
    const amount = (Number(item.final_line_price) / 100).toFixed(2);
    return `${gift ? "Collection Snowboard FREE GIFT" : item.key} $${amount}`;
  });
  return `${lines.join("\n")}\nEstimated total $${(Number(snapshot.total_price) / 100).toFixed(2)}`;
}

function sectionMap(snapshot, requested) {
  const html = renderSavorCart(snapshot);
  const out = {};
  for (const id of requested || []) {
    if (id === PAGE_SECTION || id === DRAWER_SECTION) out[id] = html;
  }
  return out;
}

const campaign999 = () => ({
  enabled: true,
  rewardType: "FREE_GIFT",
  campaignId: CAMPAIGN_ID,
  threshold: 999,
  autoAddGift: true,
  gift: { variantId: GIFT_VARIANT },
});

function attachSavorMorph(h, page, icon) {
  h.window.document.addEventListener("shopify:cart:lines-update", (event) => {
    if (!event.promise || !event.promise.then) return;
    event.promise.then(({ cart: payload, detail }) => {
      const html = detail && detail.sections && detail.sections[page.dataset.sectionId];
      if (html) page.innerHTML = html;
      const count = payload && payload.totalQuantity != null ? payload.totalQuantity : detail && detail.itemCount;
      if (count != null) icon.count = count;
    });
  });
}

describe("Savor cart page refreshes from the gift mutation", () => {
  it("replaces the stale $659 page with $549, then requalifies and empties", async () => {
    const page = savorSurface(PAGE_SECTION);
    const drawer = savorSurface(DRAWER_SECTION);
    page.innerHTML = STALE_CART_PAGE;
    const icon = { count: 99 };
    const celebrated = [];
    const h = createHarness({
      stage: 5,
      pathname: "/cart",
      surfaces: [drawer, page],
      initialCart: cart([
        line({ key: "pepper", cents: 54900 }),
        giftLine({ key: "snowboard", unitCents: 11000, coverage: "none" }),
      ]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
      onSections: sectionMap,
    });
    attachSavorMorph(h, page, icon);
    h.window.document.addEventListener("fgpb:gift-added", () => celebrated.push("gift-added"));
    await settle(900);

    assert.equal(taggedGifts(h).length, 0, "the unearned gift is gone from Shopify's cart");
    assert.equal(h.cart.total_price, 54900);
    assert.match(page.innerHTML, /Estimated total \$549\.00/);
    assert.equal(page.innerHTML.includes("Snowboard"), false);
    assert.equal(page.innerHTML.includes("$659.00"), false);
    assert.equal(icon.count, 1);
    assert.ok(
      h.posts.some((p) => String(p.body && p.body.sections || "").includes(PAGE_SECTION)),
      "the gift removal must request the Savor cart-page section",
    );
    assert.ok(
      h.posts.some((p) => String(p.body && p.body.sections || "").includes("cart-drawer")),
      "the Dawn drawer section is still requested",
    );

    await h.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })]),
    );
    await settle(900);
    assert.equal(taggedGifts(h).length, 1);
    assert.equal(taggedGifts(h)[0].final_line_price, 0);
    assert.match(page.innerHTML, /FREE GIFT \$0\.00/);
    assert.match(page.innerHTML, /Estimated total \$1198\.00/);
    assert.equal(icon.count, 3);
    assert.deepEqual(celebrated, ["gift-added"]);

    const awarded = taggedGifts(h)[0];
    await h.dawnMutation("/cart/change.js", { id: "pepper", quantity: 0 }, cart([awarded]));
    await settle(900);
    assert.equal(h.cart.item_count, 0);
    assert.equal(h.cart.total_price, 0);
    assert.equal(page.innerHTML, "Your cart is empty");
    assert.equal(icon.count, 0);
    assert.deepEqual(celebrated, ["gift-added"]);
  });

  it("leaves the rendered page alone when section HTML is unavailable", async () => {
    const page = savorSurface(PAGE_SECTION);
    page.innerHTML = STALE_CART_PAGE;
    const icon = { count: 99 };
    const h = createHarness({
      stage: 5,
      pathname: "/cart",
      surfaces: [page],
      initialCart: cart([
        line({ key: "pepper", cents: 54900 }),
        giftLine({ key: "snowboard", unitCents: 11000, coverage: "none" }),
      ]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
      onSections: () => ({}),
    });
    attachSavorMorph(h, page, icon);
    await settle(900);
    assert.equal(taggedGifts(h).length, 0);
    assert.equal(h.cart.total_price, 54900);
    assert.equal(page.innerHTML, STALE_CART_PAGE);
    assert.equal(icon.count, 99);
    const posts = h.posts.length;
    await settle(800);
    assert.equal(h.posts.length, posts, "a missing section must not start another gift mutation");
  });

  it("does not paint a delayed gift section after the cart has moved on", async () => {
    const page = savorSurface(PAGE_SECTION);
    page.innerHTML = "CURRENT-549";
    const icon = { count: 1 };
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let hold = false;
    let useFrozen = false;
    const h = createHarness({
      stage: 5,
      pathname: "/cart",
      surfaces: [page],
      initialCart: cart([line({ key: "pepper", cents: 54900 })]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
      onAddPosted: async () => {
        if (!hold) return;
        hold = false;
        useFrozen = true;
        await gate;
      },
      onSections: (snapshot) => {
        if (useFrozen) {
          useFrozen = false;
          return { [PAGE_SECTION]: "STALE-GIFT-MARKUP\nEstimated total $659.00" };
        }
        return sectionMap(snapshot, [PAGE_SECTION]);
      },
    });
    attachSavorMorph(h, page, icon);
    await settle(400);
    hold = true;
    await h.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })]),
    );
    page.innerHTML = "CURRENT-549";
    await h.dawnMutation("/cart/change.js", { id: "pepper", quantity: 1 }, cart([line({ key: "pepper", cents: 54900 })]));
    release();
    await settle(1000);
    assert.equal(page.innerHTML.includes("STALE-GIFT-MARKUP"), false);
    assert.equal(taggedGifts(h).length, 0);
    assert.equal(h.cart.total_price, 54900);
  });

  it("does not add a second gift or celebration when quantity changes while still eligible", async () => {
    const page = savorSurface(PAGE_SECTION);
    const icon = { count: 0 };
    const celebrated = [];
    const h = createHarness({
      stage: 5,
      pathname: "/cart",
      surfaces: [page],
      initialCart: cart([line({ key: "pepper", cents: 54900 })]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
      onSections: sectionMap,
    });
    attachSavorMorph(h, page, icon);
    h.window.document.addEventListener("fgpb:gift-added", () => celebrated.push("gift-added"));
    await settle(400);
    await h.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })]),
    );
    await h.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 2 },
      cart([
        line({ key: "chilli", cents: 64900 }),
        line({ key: "pepper", cents: 54900, qty: 2 }),
        ...h.cart.items.filter((i) => i.properties && i.properties._fgpb_free_gift === "true"),
      ]),
    );
    await settle(900);
    assert.equal(taggedGifts(h).length, 1);
    assert.deepEqual(celebrated, ["gift-added"]);
    assert.match(page.innerHTML, /FREE GIFT/);
  });
});

function countGets(h) {
  return {
    cart: h.gets.filter((u) => u.includes("/cart.js")).length,
    state: h.gets.filter((u) => (u.includes("/apps/") || u.includes("widget-state")) && !u.includes("track-event")).length,
  };
}

describe("fast gift sync uses the cart in hand", () => {
  // Before this path, one qualifying change after boot did four /cart.js reads
  // (plan, safety, reconcile, trailing read) and two widget-state reads
  // (plan and reconcile). The gift section is applied inside the gift POST,
  // before the background check.
  it("qualifies and disqualifies with one cart read and one eligibility check", async () => {
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "pepper", cents: 54900 })]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
    });
    await settle(500);
    h.gets.length = 0;
    h.posts.length = 0;
    await h.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })]),
    );
    await settle(400);
    assert.equal(taggedGifts(h).length, 1);
    assert.equal(countGets(h).cart, 1, "safety confirms the cart; the shopper response is not read again");
    assert.equal(countGets(h).state, 1, "widget-state confirms the cache after the gift save");
    assert.equal(giftPosts(h).length, 1);
    assert.equal(h.gets.filter((u) => u.includes("track-event")).length, 1);
    assert.ok(h.diag.some((d) => d.type === "eligibility-source" && d.data.source === "cache"));

    const before = countGets(h);
    const posts = h.posts.length;
    await h.dawnMutation(
      "/cart/change.js",
      { id: "chilli", quantity: 0 },
      cart([line({ key: "pepper", cents: 54900 }), taggedGifts(h)[0]]),
    );
    await settle(400);
    assert.equal(taggedGifts(h).length, 0);
    assert.equal(h.cart.total_price, 54900);
    assert.equal(countGets(h).cart - before.cart, 1);
    assert.equal(countGets(h).state - before.state, 1);
    assert.equal(h.posts.length - posts, 1);

    const emptyBefore = countGets(h);
    await h.dawnMutation("/cart/change.js", { id: "pepper", quantity: 0 }, cart([]));
    await settle(400);
    assert.equal(h.cart.item_count, 0);
    assert.equal(countGets(h).cart, emptyBefore.cart, "an empty cart needs no gift read");
  });

  it("adds both tiers from the cached campaign, then removes them as the cart falls", async () => {
    const tierShape = ({ key, variantId, properties }) =>
      giftLine({
        key,
        variantId,
        campaignId: properties._fgpb_campaign_id,
        tierId: properties._fgpb_tier_id,
        coverage: "ours",
      });
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "pepper", cents: 1000 })]),
      giftShape: tierShape,
      onWidgetState: () => ({
        enabled: true,
        rewardType: "TIERED_FREE_GIFTS",
        campaignId: CAMPAIGN_ID,
        autoAddGift: true,
        rewardTiers: [
          { tierId: "low", threshold: 50, variantId: GIFT_VARIANT },
          { tierId: "high", threshold: 80, variantId: 777 },
        ],
      }),
    });
    await settle(400);
    await h.dawnMutation("/cart/change.js", { id: "pepper", quantity: 1 }, cart([line({ key: "pepper", cents: 9000 })]));
    await settle(500);
    assert.equal(taggedGifts(h).length, 2);
    await h.dawnMutation("/cart/change.js", { id: "pepper", quantity: 1 }, cart([
      line({ key: "pepper", cents: 6000 }),
      ...taggedGifts(h),
    ]));
    await settle(500);
    assert.deepEqual(taggedGifts(h).map((i) => i.variant_id), [GIFT_VARIANT]);
    await h.dawnMutation("/cart/change.js", { id: "pepper", quantity: 1 }, cart([
      line({ key: "pepper", cents: 1000 }),
      ...taggedGifts(h),
    ]));
    await settle(500);
    assert.equal(taggedGifts(h).length, 0);
  });

  it("asks the server before adding when the currency or the market rate changed", async () => {
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "pepper", cents: 1000 })]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
    });
    await settle(400);
    h.gets.length = 0;
    h.posts.length = 0;
    await h.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })], "tok-1", "EUR"),
    );
    await settle(400);
    assert.equal(giftPosts(h).length, 1);
    assert.ok(h.diag.some((d) => d.type === "eligibility-source" && d.data.source === "server"));
    assert.ok(h.gets.some((u) => u.includes("currency=EUR")));

    const rated = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "pepper", cents: 1000 })]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
    });
    await settle(400);
    rated.window.Shopify = { currency: { active: "INR", rate: 2 } };
    rated.posts.length = 0;
    await rated.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })]),
    );
    await settle(400);
    assert.equal(taggedGifts(rated).length, 1);
    assert.ok(rated.diag.some((d) => d.type === "eligibility-source" && d.data.source === "server"));
  });

  it("fetches the full cart when a product add returns only the new line", async () => {
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "pepper", cents: 54900 })]),
      giftShape: earnedGift,
      onWidgetState: campaign999,
      customerShape: () => ({ id: 999, quantity: 1, variant_id: 999 }),
    });
    await settle(400);
    h.gets.length = 0;
    await h.dawnMutation(
      "/cart/add.js",
      { id: 1, quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })]),
    );
    await settle(400);
    assert.equal(taggedGifts(h).length, 1);
    assert.ok(countGets(h).cart >= 2, "a partial add still reads /cart.js, then safety reads it again");
  });

  it("does not add when the required eligibility request fails", async () => {
    let fail = false;
    const h = createHarness({
      stage: 5,
      initialCart: cart([line({ key: "pepper", cents: 1000 })]),
      giftShape: earnedGift,
      onWidgetState: () => {
        if (fail) throw new Error("widget-state down");
        return campaign999();
      },
    });
    await settle(400);
    fail = true;
    h.posts.length = 0;
    await h.dawnMutation(
      "/cart/change.js",
      { id: "pepper", quantity: 1 },
      cart([line({ key: "chilli", cents: 64900 }), line({ key: "pepper", cents: 54900 })], "tok-1", "EUR"),
    );
    await settle(500);
    assert.equal(giftPosts(h).length, 0);
    assert.equal(taggedGifts(h).length, 0);
  });
});
