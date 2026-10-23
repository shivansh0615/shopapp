/** Portable policy shared by the server and the Shopify Discount Function. */
export type CampaignCandidate = {
  campaignId: string;
  priority?: number;
  threshold?: { amount: string };
  tiers?: Array<{ threshold: { amount: string } }>;
};

export function campaignThreshold(candidate: CampaignCandidate, subtotal: number, rate = 1): number {
  const thresholds = (candidate.tiers?.map((tier) => Number(tier.threshold.amount)) ??
    [Number(candidate.threshold?.amount)])
    .filter((amount) => Number.isFinite(amount) && amount > 0)
    .map((amount) => Math.round(amount * rate * 100));
  const unlocked = thresholds.filter((amount) => amount <= Math.round(subtotal * 100));
  return unlocked.length ? Math.max(...unlocked) : Math.min(...thresholds);
}

/** Eligible offers first; one reward campaign per cart. No creation-date tie-break. */
export function chooseCartCampaign<T extends CampaignCandidate>(
  candidates: T[], subtotal: number, rate = 1, showProgress = false,
): T | null {
  const valid = candidates.filter((candidate) => Number.isFinite(campaignThreshold(candidate, subtotal, rate)));
  const eligible = valid.filter((candidate) => campaignThreshold(candidate, subtotal, rate) <= Math.round(subtotal * 100));
  const pool = eligible.length ? eligible : showProgress ? valid : [];
  return [...pool].sort((a, b) => {
    const priority = (b.priority ?? 0) - (a.priority ?? 0);
    if (priority) return priority;
    const threshold = campaignThreshold(a, subtotal, rate) - campaignThreshold(b, subtotal, rate);
    if (threshold) return eligible.length ? -threshold : threshold;
    // Numeric database IDs sort numerically; nonnumeric IDs have a stable lexical order.
    const left = Number(a.campaignId), right = Number(b.campaignId);
    if (Number.isSafeInteger(left) && Number.isSafeInteger(right)) return left - right;
    return a.campaignId < b.campaignId ? -1 : a.campaignId > b.campaignId ? 1 : 0;
  })[0] ?? null;
}
