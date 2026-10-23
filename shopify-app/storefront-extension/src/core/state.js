export const state = {
  campaign: {
    enabled: false,
    threshold: 0,
    giftVariantId: null,
    campaignId: null,
  },
  /**
   * Cached from App Proxy (`FREE_GIFT` | `TIERED_FREE_GIFTS` | `PERCENTAGE_DISCOUNT` | `FIXED_DISCOUNT`).
   * Main gift-sync runs only for FREE_GIFT; tiered sync is a separate asset.
   */
  rewardType: null,
  /** Additive — Tiered Free Gifts unlocked lines from App Proxy. */
  unlockedGifts: null,
  /** Additive — next locked tier for progress. */
  nextTier: null,
  /** All tiers for progress math / copy guards. */
  rewardTiers: null,
  knownGiftVariantId: null,
  campaignLoaded: false,
  /** 1 when a valid App Proxy promotion snapshot is cached. */
  sv: 0,
  /** Server eligible (0/1). */
  se: 0,
  /** Server remaining amount. */
  sr: 0,
  /** Server progress 0–100. */
  sp: 0,
  mutating: false,
  giftAddInFlight: false,
  giftAddError: null,
  suppressCartRefresh: false,
  cartListenersInstalled: false,
  autoAddGift: true,
  ht: null,
  ds: null,
  uh: null,
  ud: null,
  cl: null,
  lc: null,
  cb: null,
};
