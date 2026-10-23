"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { FEATURES } from "@/lib/constants";
import { Section } from "@/components/ui/Section";
import { fadeInUp, staggerContainer, viewportOnce } from "@/lib/animations";
import { useIsDesktop } from "@/components/three/hooks";
import { cn } from "@/lib/utils";

export function Features() {
  const [open, setOpen] = useState(0);
  const isDesktop = useIsDesktop();

  return (
    <Section
      id="features"
      className="overflow-x-clip border-t border-[var(--border)] bg-[var(--surface-wine)]"
      title="Built as a platform"
      description="One promotion engine for Shopify — not a pile of single-feature discount apps."
    >
      <motion.ul
        variants={staggerContainer}
        initial={false}
        whileInView="visible"
        viewport={viewportOnce}
        className="mt-10 grid grid-cols-1 gap-4 border-t border-[var(--border)] pt-8 lg:mt-16 lg:grid-cols-3 lg:gap-0 lg:pt-0"
      >
        {FEATURES.map((feature, index) => {
          const active = open === index;
          return (
            <motion.li
              key={feature.title}
              variants={fadeInUp}
              className="min-w-0 rounded-2xl border border-[var(--border)] bg-black/20 lg:rounded-none lg:border-0 lg:border-r lg:border-b-0 lg:bg-transparent lg:last:border-r-0"
            >
              <button
                type="button"
                onClick={() => setOpen(index)}
                onMouseEnter={() => {
                  if (isDesktop) setOpen(index);
                }}
                className={cn(
                  "flex h-auto min-h-11 w-full flex-col px-5 py-6 text-left transition-colors duration-300 lg:px-8 lg:py-10 lg:first:pl-0 lg:last:pr-0",
                  isDesktop && !active ? "opacity-55 hover:opacity-80" : "opacity-100",
                )}
              >
                <span className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
                  0{index + 1}
                </span>
                <h3 className="mt-4 font-display text-xl tracking-[-0.02em] text-balance text-white sm:text-2xl md:text-[1.85rem]">
                  {feature.title}
                </h3>
                <p className="mt-3 text-[15px] leading-[1.55] text-[var(--muted-foreground)]">
                  {feature.description}
                </p>
                {isDesktop ? (
                  <AnimatePresence initial={false}>
                    {active ? (
                      <motion.p
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: "auto", marginTop: 14 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden text-sm leading-[1.55] text-[var(--accent-deep)]"
                      >
                        {feature.detail}
                      </motion.p>
                    ) : null}
                  </AnimatePresence>
                ) : (
                  <p className="mt-3.5 text-sm leading-[1.55] text-[var(--accent-deep)]">
                    {feature.detail}
                  </p>
                )}
              </button>
            </motion.li>
          );
        })}
      </motion.ul>
    </Section>
  );
}
