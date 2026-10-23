"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Gift, Lock, Plus, ShoppingBag } from "lucide-react";
import { useEffect, useRef } from "react";

interface ScrollCartProps {
  progress: number;
  reducedMotion: boolean;
  boosted: boolean;
  onBoost: () => void;
  interactive?: boolean;
  onUnlock?: () => void;
}

const THRESHOLD = 100;

const ITEMS = {
  adidas: { id: "adidas", name: "Adidas", price: 68, tone: "#3a342f" },
  nike: { id: "nike", name: "Nike", price: 24, tone: "#4a3f38" },
  reebok: { id: "reebok", name: "Reebok", price: 32, tone: "#5a4a40" },
} as const;

const TIERS = [50, 75, 100] as const;
const EASE = [0.16, 1, 0.3, 1] as const;

export function ScrollCart({
  progress,
  reducedMotion,
  boosted,
  onBoost,
  interactive = true,
  onUnlock,
}: ScrollCartProps) {
  const showAdidas = reducedMotion || (interactive && progress >= 0.02);
  const showNike = reducedMotion || (interactive && progress >= 0.28);
  const showReebok =
    reducedMotion || boosted || (interactive && progress >= 0.72);
  const wasUnlocked = useRef(false);

  const lines = [
    ...(showAdidas ? [ITEMS.adidas] : []),
    ...(showNike ? [ITEMS.nike] : []),
    ...(showReebok ? [ITEMS.reebok] : []),
  ];

  const total = lines.reduce((sum, item) => sum + item.price, 0);
  const unlocked = total >= THRESHOLD;
  const remaining = Math.max(0, THRESHOLD - total);
  const progressPct = Math.min(100, (total / THRESHOLD) * 100);

  useEffect(() => {
    if (!unlocked) return;

    if (!wasUnlocked.current) {
      wasUnlocked.current = true;
      if (interactive) onUnlock?.();
    }
  }, [unlocked, onUnlock, interactive]);

  return (
    <div className="relative w-full max-w-[380px]">
      <div
        className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e0e]"
        aria-label="Interactive cart — scroll or add an item to unlock the gift"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black">
              <ShoppingBag size={14} strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-[11px] tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
                Your cart
              </p>
              <p className="text-sm font-medium text-white">
                {lines.length} {lines.length === 1 ? "item" : "items"}
              </p>
            </div>
          </div>
          <span className="font-display text-xl tabular-nums text-white">
            ${total}
          </span>
        </div>

        <div className="min-h-[56px] space-y-3 px-5 py-4">
          <AnimatePresence initial={false}>
            {lines.length === 0 ? (
              <motion.p
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-3 text-center text-sm text-[var(--muted-foreground)]"
              >
                Scroll to add your first item
              </motion.p>
            ) : null}
            {lines.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 56 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="flex items-center gap-3 overflow-hidden"
              >
                <div
                  className="h-14 w-14 shrink-0 rounded-xl"
                  style={{
                    background: `linear-gradient(145deg, ${item.tone}, #050505)`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {item.name}
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Just added
                  </p>
                </div>
                <p className="text-sm tabular-nums text-white">${item.price}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="mx-5 mb-3 rounded-xl bg-[#161616] px-4 py-3.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[11px] tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
              Free gift at ${THRESHOLD}
            </p>
            <p className="text-[11px] font-medium tabular-nums text-[var(--accent)]">
              {unlocked ? "Unlocked" : `$${remaining} to go`}
            </p>
          </div>
          <div className="relative h-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-[var(--accent)]"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          </div>
          <div className="mt-2.5 flex justify-between">
            {TIERS.map((tier) => (
              <span
                key={tier}
                className={`text-[10px] tabular-nums transition-colors duration-200 ${
                  total >= tier
                    ? "text-[var(--accent)]"
                    : "text-[var(--muted-foreground)]"
                }`}
              >
                ${tier}
              </span>
            ))}
          </div>
        </div>

        <div className="mx-5 mb-5 min-h-[72px]">
          <AnimatePresence mode="wait" initial={false}>
            {unlocked ? (
              <motion.div
                key="gift"
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 72 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="overflow-hidden rounded-xl border border-[var(--accent)]/25 bg-[#1a1610]"
              >
                <div className="flex h-[72px] items-center gap-3 px-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#5c3340] text-[#f0d49a]">
                    <Gift size={16} strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] tracking-[0.12em] text-[var(--accent)] uppercase">
                      Free gift
                    </p>
                    <p className="font-display text-base leading-tight text-white">
                      Mystery reward added
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] tracking-[0.06em] text-black uppercase">
                    Free
                  </span>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="locked"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="flex h-[72px] items-center gap-3 rounded-xl border border-dashed border-white/10 bg-[#121212] px-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-[var(--muted-foreground)]">
                  <Lock size={15} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
                    Locked
                  </p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Spend ${remaining} more to unlock
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onBoost}
            disabled={boosted || showReebok || !interactive}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/12 text-sm font-medium text-white transition-colors hover:border-[var(--accent)]/45 hover:bg-[#1a1610] disabled:cursor-default disabled:opacity-40"
          >
            <Plus size={15} strokeWidth={2} />
            {boosted || showReebok ? "Added" : "Add Reebok"}
          </button>
          <div className="flex h-11 flex-[1.15] items-center justify-center rounded-full bg-white text-sm font-medium text-black">
            Checkout
          </div>
        </div>
      </div>
    </div>
  );
}
