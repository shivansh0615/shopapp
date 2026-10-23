/**
 * Pure helpers for native cart intercept: predict subtotal, merge add.js
 * payloads into lastKnownCart, batch gift lines, queue mutations, 422 gate.
 */
export const FREE_GIFT_KEY = "_fgpb_free_gift";

export function emptyCart(currency = "") {
  return {
    items: [],
    item_count: 0,
    total_price: 0,
    items_subtotal_price: 0,
    currency,
  };
}

export function cloneCart(cart) {
  if (!cart) return emptyCart();
  return JSON.parse(JSON.stringify(cart));
}

export function isHiddenGiftProps(props) {
  if (!props || typeof props !== "object") return false;
  const flag = props[FREE_GIFT_KEY];
  return flag === "true" || flag === true;
}

export function hiddenGiftProperties(campaignId, tierId) {
  const p = { [FREE_GIFT_KEY]: "true", _is_free_gift: "true" };
  if (campaignId) p._fgpb_campaign_id = String(campaignId);
  if (tierId) p._fgpb_tier_id = String(tierId);
  return p;
}

export function visiblePropertyKeys(props) {
  return Object.keys(props || {}).filter((k) => k && k.charAt(0) !== "_");
}

export function paidSubtotalCents(cart) {
  let sum = 0;
  for (const item of (cart && cart.items) || []) {
    if (isHiddenGiftProps(item.properties)) continue;
    const line = Number(
      item.final_line_price != null
        ? item.final_line_price
        : item.line_price != null
          ? item.line_price
          : NaN,
    );
    if (Number.isFinite(line)) sum += line;
    else sum += (Number(item.quantity) || 0) * (Number(item.price) || 0);
  }
  return sum;
}

export function recountCart(cart) {
  const next = cart || emptyCart();
  let count = 0;
  let total = 0;
  let sub = 0;
  for (const item of next.items || []) {
    count += Number(item.quantity) || 0;
    const line = Number(
      item.final_line_price != null
        ? item.final_line_price
        : item.line_price != null
          ? item.line_price
          : (Number(item.quantity) || 0) * (Number(item.price) || 0),
    );
    if (Number.isFinite(line)) {
      total += line;
      if (!isHiddenGiftProps(item.properties)) sub += line;
    }
  }
  next.item_count = count;
  next.total_price = total;
  next.items_subtotal_price = sub;
  return next;
}

export function addedLinesFromResponse(json) {
  if (!json || typeof json !== "object") return [];
  if (Array.isArray(json.items) && json.total_price == null) return json.items;
  if (Array.isArray(json.items) && json.item_count == null) return json.items;
  if (json.variant_id != null || json.product_id != null || (json.id && json.quantity && !json.items)) {
    return [json];
  }
  return [];
}

export function isFullCartJson(json) {
  return !!(
    json &&
    typeof json === "object" &&
    Array.isArray(json.items) &&
    json.total_price != null &&
    json.item_count != null
  );
}

export function stripCart(json) {
  if (!json) return emptyCart();
  return {
    items: Array.isArray(json.items) ? json.items.slice() : [],
    item_count: json.item_count,
    total_price: json.total_price,
    items_subtotal_price: json.items_subtotal_price,
    currency: json.currency || "",
  };
}

export function mergeAddedItems(cart, added) {
  const next = recountCart(cloneCart(cart));
  const list = Array.isArray(added) ? added : added ? [added] : [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    if (raw.sections && raw.variant_id == null && raw.id == null && !raw.key) continue;
    const key = raw.key;
    const idx = key ? next.items.findIndex((i) => i.key === key) : -1;
    if (idx >= 0) next.items[idx] = { ...next.items[idx], ...raw };
    else next.items.push(raw);
  }
  return recountCart(next);
}

export function adoptMutationResponse(lastKnownCart, json) {
  if (isFullCartJson(json)) return recountCart(stripCart(json));
  const added = addedLinesFromResponse(json);
  if (added.length) return mergeAddedItems(lastKnownCart, added);
  return lastKnownCart ? cloneCart(lastKnownCart) : emptyCart();
}

export function normalizeAddItems(payload) {
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.items)) {
    return payload.items.map((it) => ({
      id: it.id || it.variant_id,
      quantity: it.quantity || 1,
      properties: it.properties || {},
      price: it.price,
    }));
  }
  if (payload.id != null) {
    return [
      {
        id: payload.id,
        quantity: payload.quantity || 1,
        properties: payload.properties || {},
        price: payload.price,
      },
    ];
  }
  return [];
}

export function stampCartVersion(cart, ver) {
  if (!cart || typeof cart !== "object") return cart;
  cart._fgpbVer = Number(ver) || 0;
  return cart;
}

export function shouldAcceptCartVersion(incomingVer, paintedVer) {
  if (incomingVer == null || incomingVer === "") return !(Number(paintedVer) > 0);
  return Number(incomingVer) >= Number(paintedVer || 0);
}

/** Qty/remove prediction so progress matches Dawn's optimistic quantity input. */
export function projectAfterChange(cart, payload) {
  const next = cloneCart(cart);
  if (!payload || typeof payload !== "object") return recountCart(next);
  if (payload.updates && typeof payload.updates === "object") {
    for (const key of Object.keys(payload.updates)) {
      applyLineQuantity(next, { id: key, quantity: payload.updates[key] });
    }
    return recountCart(next);
  }
  applyLineQuantity(next, payload);
  return recountCart(next);
}

function applyLineQuantity(cart, payload) {
  const items = cart.items || [];
  const qty = Number(payload && payload.quantity);
  if (!Number.isFinite(qty)) return;
  let idx = -1;
  const id = payload.id != null ? String(payload.id) : "";
  if (id) {
    idx = items.findIndex(
      (i) => String(i.key) === id || String(i.variant_id) === id || String(i.id) === id,
    );
  }
  if (idx < 0) {
    const line = Number(payload.line);
    if (Number.isFinite(line) && line >= 1 && line <= items.length) idx = line - 1;
  }
  // Dawn change.js uses the Shopify line key; projected carts use "proj:vid".
  // A single paid line is unambiguous — apply the qty so progress does not stay at qty 1.
  if (idx < 0 && qty > 0) {
    const paid = [];
    for (let i = 0; i < items.length; i++) {
      if (!isHiddenGiftProps(items[i].properties)) paid.push(i);
    }
    if (paid.length === 1) idx = paid[0];
  }
  if (idx < 0) return;
  if (qty <= 0) {
    items.splice(idx, 1);
    return;
  }
  const item = items[idx];
  const unit = Number(item.price) || 0;
  item.quantity = qty;
  item.final_line_price = unit * qty;
  item.line_price = unit * qty;
}

/** Stale mutation JSON must not let Dawn apply older cart-drawer HTML. */
export function stripStaleCartSections(json, startedGen, liveGen) {
  if (!json || typeof json !== "object") return json;
  if (shouldApplyGiftCartSections(startedGen, liveGen)) return json;
  if (!json.sections) return json;
  const next = { ...json };
  delete next.sections;
  return next;
}

export function projectAfterAdd(cart, incomingItems, lookupPriceCents) {
  const next = cloneCart(cart);
  for (const inc of incomingItems || []) {
    if (isHiddenGiftProps(inc.properties)) continue;
    const qty = Math.max(1, Number(inc.quantity) || 1);
    const vid = String(inc.id || inc.variant_id || "");
    let unit = Number(inc.price);
    if (!Number.isFinite(unit) || unit <= 0) {
      unit = lookupPriceCents ? Number(lookupPriceCents(vid)) || 0 : 0;
    }
    next.items.push({
      key: "proj:" + vid,
      variant_id: vid,
      id: vid,
      quantity: qty,
      price: unit,
      final_line_price: unit * qty,
      properties: inc.properties || {},
    });
  }
  return recountCart(next);
}

export function taggedGiftInCart(cart, variantId) {
  const want = variantId != null ? String(variantId) : "";
  for (const item of (cart && cart.items) || []) {
    if (!isHiddenGiftProps(item.properties)) continue;
    if (!want) return true;
    const vid = String(item.variant_id || item.id || "");
    if (vid === want) return true;
  }
  return false;
}

export function shouldBatchGift({
  paidCents,
  thresholdMajor,
  giftAlreadyInCart,
  giftUnavailable,
  autoAddGift,
}) {
  if (giftUnavailable || autoAddGift === false || giftAlreadyInCart) return false;
  const thresholdCents = Math.round(Number(thresholdMajor) * 100);
  return thresholdCents > 0 && paidCents + 1e-9 >= thresholdCents;
}

export function appendGiftsToAddPayload(payload, gifts) {
  const items = normalizeAddItems(payload);
  const next = { ...(payload || {}), items: items.concat(gifts || []) };
  if (next.items.length > 1) {
    delete next.id;
    delete next.quantity;
  }
  return next;
}

export function isGiftUnprocessable(status) {
  return Number(status) === 422;
}

/** Gift-sync HTML captured before a shopper qty/remove must not overwrite Dawn. */
export function shouldApplyGiftCartSections(startedGen, liveGen) {
  if (startedGen == null || startedGen === "") return true;
  return Number(startedGen) === Number(liveGen || 0);
}

/** Older /cart.js or widget-state must not repaint a newer mutation. */
export function shouldAcceptPaintGen(responseGen, paintedGen) {
  if (responseGen == null || responseGen === "") return true;
  return Number(responseGen) >= Number(paintedGen || 0);
}

/** Dawn `line` indexes break after gift rows move. Prefer the line-item key. */
export function rewriteChangeLineToKey(body, cart) {
  if (!body || typeof body !== "object") return body;
  if (body.id || (body.updates && typeof body.updates === "object")) return body;
  const items = (cart && cart.items) || [];
  const line = Number(body.line);
  const qtyZero = body.quantity === 0 || body.quantity === "0";
  let key = null;
  if (Number.isFinite(line) && line >= 1 && line <= items.length) {
    key = items[line - 1] && items[line - 1].key;
  } else if (qtyZero && items.length > 0 && Number.isFinite(line) && line >= 1) {
    key = items[Math.min(line, items.length) - 1].key || items[items.length - 1].key;
  }
  if (!key) return body;
  const next = { ...body, id: String(key) };
  delete next.line;
  return next;
}

export function isInvalidLineError(payload, status) {
  if (Number(status) !== 400) return false;
  const msg = String(
    (payload && (payload.description || payload.message || payload.status)) || payload || "",
  ).toLowerCase();
  return msg.includes("line") && msg.includes("invalid");
}

export function shouldRetryGiftAdd(status) {
  if (isGiftUnprocessable(status)) return false;
  if (status === 429 || status === 430) return false;
  return true;
}

export function createMutationQueue() {
  let tail = Promise.resolve();
  return function enqueue(fn) {
    const run = tail.then(fn, fn);
    tail = run.then(
      function () {},
      function () {},
    );
    return run;
  };
}
