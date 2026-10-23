export type ScrollProgressRef = { current: number };

/**
 * Scroll 0–1 story beats.
 * Cart unlock (socks / $100) is gated in ScrollCart to spend ≈ 1.
 */
export function storyFromProgress(p: number) {
  const clamped = Math.min(1, Math.max(0, p));
  return {
    products: smoothstep(0.05, 0.28, clamped),
    spend: smoothstep(0.12, 0.78, clamped),
    unlock: smoothstep(0.62, 0.82, clamped),
    celebrate: smoothstep(0.8, 0.96, clamped),
    stage:
      clamped < 0.16
        ? 0
        : clamped < 0.38
          ? 1
          : clamped < 0.58
            ? 2
            : clamped < 0.78
              ? 3
              : 4,
  };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export const SCROLL_STAGES = [
  { title: "Free gifts that grow your AOV.", isHero: true },
  { title: "Spend climbs toward the gift.", isHero: false },
  { title: "The gift unlocks in cart.", isHero: false },
  { title: "Shoppers feel the reward.", isHero: false },
  { title: "Average order value rises.", isHero: false },
] as const;
