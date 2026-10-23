"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { PROMOTION_TYPES } from "@/lib/constants";
import { Section } from "@/components/ui/Section";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { cn } from "@/lib/utils";

export function PromotionTypes() {
  const [active, setActive] = useState(0);
  const current = PROMOTION_TYPES[active] ?? PROMOTION_TYPES[0];

  return (
    <Section
      id="promotions"
      className="overflow-x-clip border-t border-[var(--border)] bg-[var(--surface-wine)]"
      title="Every promotion type"
      description="Pick a campaign type to see how it shows up for shoppers."
    >
      <div className="mt-10 grid grid-cols-1 gap-8 border-t border-[var(--border)] pt-8 lg:mt-16 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14 lg:pt-16">
        <motion.ul
          variants={staggerContainer}
          initial={false}
          whileInView="visible"
          viewport={viewportOnce}
          className="grid min-w-0 grid-cols-1 gap-0 lg:grid-cols-2"
        >
          {PROMOTION_TYPES.map((promo, index) => {
            const selected = index === active;
            return (
              <motion.li
                key={promo.title}
                variants={fadeInUp}
                className="min-w-0 border-b border-[var(--border)] lg:odd:border-r"
              >
                <button
                  type="button"
                  onClick={() => setActive(index)}
                  className={cn(
                    "min-h-11 w-full px-0 py-5 text-left transition-colors duration-300 lg:px-5 lg:odd:pl-0 lg:even:pr-0",
                    selected
                      ? "text-white"
                      : "text-[var(--muted-foreground)] hover:text-white",
                  )}
                >
                  <h3 className="font-display text-lg tracking-[-0.02em] text-balance sm:text-xl md:text-2xl">
                    {promo.title}
                  </h3>
                  <p className="mt-2 text-sm leading-[1.55] text-[var(--muted-foreground)]">
                    {promo.description}
                  </p>
                </button>
              </motion.li>
            );
          })}
        </motion.ul>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-w-0 flex-col justify-between border border-[var(--accent)]/25 bg-black/30 px-5 py-7 md:min-h-[280px] md:px-8 md:py-8"
          >
            <div className="min-w-0">
              <p className="hero-kicker">Example</p>
              <p className="mt-4 font-display text-2xl tracking-[-0.02em] text-balance text-white md:text-4xl">
                {current.title}
              </p>
              <p className="mt-4 text-[15px] leading-[1.55] text-[var(--muted-foreground)]">
                {current.description}
              </p>
            </div>
            <div className="mt-8 border-t border-[var(--border)] pt-5">
              <p className="text-[11px] tracking-[0.12em] text-[var(--muted-foreground)] uppercase">
                Shopper sees
              </p>
              <p className="mt-2 font-display text-lg tracking-[-0.02em] text-[var(--accent-deep)] md:text-2xl">
                {current.example}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </Section>
  );
}
