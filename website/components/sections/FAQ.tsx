"use client";

import { motion } from "framer-motion";
import { FAQ_ITEMS } from "@/lib/constants";
import { Section } from "@/components/ui/Section";
import { fadeInUp, viewportOnce } from "@/lib/animations";

export function FAQ() {
  return (
    <Section
      id="faq"
      className="overflow-x-clip border-t border-[var(--border)] bg-[var(--surface-wine)]"
      title="FAQ"
    >
      <motion.div
        variants={fadeInUp}
        initial={false}
        whileInView="visible"
        viewport={viewportOnce}
        className="mt-10 divide-y divide-[var(--border)] border-y border-[var(--border)] md:mt-16"
      >
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="group py-4 md:py-7">
            <summary className="cursor-pointer list-none marker:content-none">
              <span className="flex min-h-11 items-center justify-between gap-4">
                <span className="min-w-0 font-display text-lg tracking-[-0.02em] text-balance text-white md:text-2xl">
                  {item.question}
                </span>
                <span
                  aria-hidden
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-[var(--muted-foreground)] transition-transform duration-300 group-open:rotate-45"
                >
                  +
                </span>
              </span>
            </summary>
            <p className="mt-3 max-w-2xl text-sm leading-[1.55] text-[var(--muted-foreground)] md:mt-4 md:text-base">
              {item.answer}
            </p>
          </details>
        ))}
      </motion.div>
    </Section>
  );
}
