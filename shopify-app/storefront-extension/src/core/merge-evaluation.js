import { state } from "./state.js";
import { buildLocalEvaluation } from "./widget-state.js";
import { num } from "../utils/util.js";

/** Test helper — kept out of the storefront bundle. */
export function mergeEvaluation(proxyEval, cart) {
  if (proxyEval?.gift?.variantId) {
    state.knownGiftVariantId = proxyEval.gift.variantId;
    state.campaign.giftVariantId = proxyEval.gift.variantId;
  }
  const th = num(proxyEval?.threshold);
  if (th > 0) state.campaign.threshold = th;
  if (proxyEval && proxyEval.enabled !== false) {
    state.campaignLoaded = true;
    state.campaign.enabled = true;
    state.sv = 1;
    state.se = proxyEval.eligible ? 1 : 0;
    state.sr = Math.max(0, num(proxyEval.remaining) || 0);
    state.sp = Math.max(0, Math.min(100, num(proxyEval.progress) || 0));
  }
  return buildLocalEvaluation(cart);
}
