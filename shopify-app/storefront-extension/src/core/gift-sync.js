import {
  addGift,
  enforceGiftLimit,
  findTaggedLine,
  loadCart,
  removeGift,
} from "./cart-client.js";
import { state } from "./state.js";
import { buildLocalEvaluation } from "./widget-state.js";
import {
  GIFT_ADD_ERROR_MESSAGE as ERR,
  GIFT_ADD_TIMEOUT_MS as TO,
  isCartRateLimited,
  withTimeout,
} from "../utils/util.js";

/**
 * Browser: classic gift ADD/REMOVE is owned by tiered-gift-sync.js (FREE_GIFT branch)
 * so both paths cannot race duplicate /cart/add calls into Shopify 429s.
 * Node tests keep mutations enabled.
 *
 * Bundled with esbuild --platform=browser so `typeof window !== "undefined"` is
 * constant-folded to true and unused mutation helpers are tree-shaken from the
 * schema javascript asset (10KB Theme Check budget).
 */
export const DISABLE_GIFT_CART_MUTATIONS = typeof window !== "undefined";

export function clearGiftLoadingState() {
  state.giftAddInFlight = false;
  state.mutating = false;
}

export function clearGiftMutationState() {
  clearGiftLoadingState();
  state.giftAddError = null;
}

export function beginGiftMutation() {
  state.giftAddInFlight = true;
  state.giftAddError = null;
  state.mutating = true;
}

function deps(o) {
  return {
    addGift,
    loadCart,
    findTaggedLine,
    removeGift,
    ...o,
  };
}

export async function confirmTaggedGiftInCart(_c, d = deps()) {
  const cart = await d.loadCart();
  return { cart, confirmed: !!d.findTaggedLine(cart) };
}

export async function runRemoveGiftFlow(cart, d = deps()) {
  if (DISABLE_GIFT_CART_MUTATIONS || isCartRateLimited()) return cart;
  const line = d.findTaggedLine(cart);
  if (!line?.lineKey) return cart;
  state.mutating = true;
  state.suppressCartRefresh = true;
  try {
    await d.removeGift(line.lineKey);
    const next = await d.loadCart();
    state.giftAddError = d.findTaggedLine(next) ? ERR : null;
    return next;
  } catch (_e) {
    state.giftAddError = ERR;
    return d.loadCart().catch(() => cart);
  } finally {
    state.mutating = false;
    state.suppressCartRefresh = false;
  }
}

export async function runAddGiftFlow(cart, giftId, d = deps(), ms = TO) {
  if (DISABLE_GIFT_CART_MUTATIONS || isCartRateLimited()) return cart;
  if (d.findTaggedLine(cart)) {
    clearGiftMutationState();
    return cart;
  }
  beginGiftMutation();
  state.suppressCartRefresh = true;
  try {
    return await withTimeout(
      (async () => {
        await d.addGift(giftId);
        const { cart: next, confirmed } = await confirmTaggedGiftInCart(cart, d);
        state.giftAddError = confirmed ? null : ERR;
        return next;
      })(),
      ms,
    );
  } catch (_e) {
    state.giftAddError = ERR;
    return d.loadCart().catch(() => cart);
  } finally {
    clearGiftLoadingState();
    state.suppressCartRefresh = false;
  }
}

export async function syncGift(cart) {
  if (DISABLE_GIFT_CART_MUTATIONS || isCartRateLimited()) return cart;

  // Classic Free Gift only. Skip Tiered/Percentage/Fixed and any Tiered payload
  // that arrived before rewardType was set (prevents /cart/add 429 loops).
  // Primary cart mutations for classic also run via tiered-gift-sync.js (FREE_GIFT branch).
  if (state.rewardType && state.rewardType !== "FREE_GIFT") {
    return cart;
  }
  if (
    state.rewardType !== "FREE_GIFT" &&
    ((state.unlockedGifts && state.unlockedGifts.length) || state.nextTier != null)
  ) {
    return cart;
  }
  // Tiered sync lives in the separate tiered-gift-sync.js asset.
  let next = await enforceGiftLimit(cart);
  const ev = buildLocalEvaluation(next);
  if (findTaggedLine(next)) clearGiftMutationState();
  if (ev.action === "NONE" || state.mutating) return next;
  if (ev.action === "REMOVE_GIFT") return runRemoveGiftFlow(next);
  if (ev.action === "ADD_GIFT") {
    const id = ev.gift?.variantId || state.campaign.giftVariantId || state.knownGiftVariantId;
    if (state.autoAddGift === false || !id || findTaggedLine(next)) {
      clearGiftMutationState();
      return next;
    }
    return runAddGiftFlow(next, id);
  }
  return next;
}
