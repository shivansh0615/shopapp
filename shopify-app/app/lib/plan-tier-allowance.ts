/**
 * How many spend thresholds a tiered campaign may save.
 *
 * Billing is not live. Every shop may use the top allowance for free.
 * When plans ship, free keeps 2, the first paid plan keeps 3, and the top
 * plan keeps 5. Thresholds 3, 4, and 5 are the ones that become paid.
 */
export const PLAN_THRESHOLD_LIMITS = {
  free: 2,
  paid: 3,
  paidTop: 5,
} as const;

export type PlanThresholdKey = keyof typeof PLAN_THRESHOLD_LIMITS;

/** The allowance enforced today. Swap this when a shop's plan is known. */
export const CURRENT_THRESHOLD_LIMIT = PLAN_THRESHOLD_LIMITS.paidTop;

export function currentThresholdLimit(): number {
  return CURRENT_THRESHOLD_LIMIT;
}
