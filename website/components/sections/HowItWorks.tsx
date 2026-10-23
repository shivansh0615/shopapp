"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { HOW_IT_WORKS } from "@/lib/constants";
import { PinnedSection } from "@/components/motion/PinnedSection";
import { usePinnedProgress } from "@/components/motion/usePinnedProgress";
import { useIsDesktop, usePrefersReducedMotion } from "@/components/three/hooks";
import { Section } from "@/components/ui/Section";
import { cn } from "@/lib/utils";

function stepFromProgress(progress: number) {
  return Math.min(HOW_IT_WORKS.length - 1, Math.floor(progress * HOW_IT_WORKS.length));
}

function HowItWorksStatic() {
  const [active, setActive] = useState(0);
  const current = HOW_IT_WORKS[active] ?? HOW_IT_WORKS[0];

  return (
    <Section
      id="how-it-works"
      className="overflow-x-clip border-t border-[var(--border)] bg-[var(--surface-wine)]"
      title="How it works"
      description="Four steps from threshold to measured lift — no discount-app maze."
    >
      <div className="mt-10 grid grid-cols-1 gap-8 border-t border-[var(--border)] pt-10 md:mt-16 md:grid-cols-[0.85fr_1.15fr] md:gap-16 md:pt-16">
        <ul className="flex min-w-0 flex-col" role="tablist" aria-label="How UpsellTrix works">
          {HOW_IT_WORKS.map((item, index) => {
            const selected = index === active;
            return (
              <li key={item.step} className="border-b border-[var(--border)]">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActive(index)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-4 py-4 text-left transition-colors duration-300",
                    selected ? "text-white" : "text-[var(--muted-foreground)] hover:text-white",
                  )}
                >
                  <span
                    className={cn(
                      "font-display text-lg tabular-nums",
                      selected ? "text-[var(--accent)]" : "",
                    )}
                  >
                    {item.step}
                  </span>
                  <span className="min-w-0 font-display text-lg tracking-[-0.02em] sm:text-xl md:text-2xl">
                    {item.title}
                  </span>
                </button>
                {selected ? (
                  <p className="pb-4 text-sm leading-[1.55] text-[var(--muted-foreground)] md:hidden">
                    {item.description}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="hidden min-w-0 flex-col justify-center md:flex" role="tabpanel">
          <p className="hero-kicker">Step {current.step}</p>
          <h3 className="mt-4 font-display text-3xl tracking-[-0.02em] text-balance text-white md:text-4xl">
            {current.title}
          </h3>
          <p className="mt-5 max-w-md text-[15px] leading-[1.55] text-[var(--muted-foreground)] md:text-base">
            {current.description}
          </p>
        </div>
      </div>
    </Section>
  );
}

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const isDesktop = useIsDesktop();
  const pin = isDesktop && !reducedMotion;
  const { progress, scrollToProgress } = usePinnedProgress(sectionRef, {
    enabled: pin,
    buckets: 100,
  });

  if (!pin) return <HowItWorksStatic />;

  const active = stepFromProgress(progress);
  const current = HOW_IT_WORKS[active] ?? HOW_IT_WORKS[0];
  const stepCount = HOW_IT_WORKS.length;

  return (
    <PinnedSection
      id="how-it-works"
      sectionRef={sectionRef}
      heightClass="h-[400vh]"
      className="border-t border-[var(--border)]"
      stageClassName="bg-[var(--surface-wine)]"
      ariaLabel="How UpsellTrix works"
    >
      <div className="how-atmos pointer-events-none absolute inset-0" />

      <div
        className="pointer-events-none absolute top-1/2 right-8 z-0 -translate-y-1/2 select-none font-display text-[min(42vw,18rem)] leading-none text-white/[0.04]"
        aria-hidden
      >
        {current.step}
      </div>

      <div className="page-shell relative z-10 flex h-full flex-col py-10">
        <div className="min-w-0">
          <p className="hero-kicker">How it works</p>
          <h2 className="section-heading mt-3">Four steps. One engine.</h2>
        </div>

        <div className="mt-10 grid min-h-0 flex-1 grid-cols-[0.78fr_1.22fr] items-center gap-16">
          <ul
            className="flex min-w-0 flex-col"
            role="tablist"
            aria-label="How UpsellTrix works"
          >
            {HOW_IT_WORKS.map((item, index) => {
              const selected = index === active;
              return (
                <li key={item.step}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() =>
                      scrollToProgress((index + 0.12) / stepCount)
                    }
                    className={cn(
                      "flex min-h-11 w-full items-baseline gap-5 py-5 text-left transition-colors duration-300",
                      selected
                        ? "text-white"
                        : "text-[var(--muted-foreground)] hover:text-white",
                    )}
                  >
                    <span
                      className={cn(
                        "font-display text-lg tabular-nums",
                        selected ? "text-[var(--highlight)]" : "",
                      )}
                    >
                      {item.step}
                    </span>
                    <span className="font-display text-2xl tracking-[-0.02em]">
                      {item.title}
                    </span>
                  </button>
                  <div className="h-px w-full overflow-hidden bg-[var(--border)]">
                    <div
                      className="h-full origin-left bg-[var(--highlight)] transition-[transform] duration-300"
                      style={{
                        transform: `scaleX(${selected ? 1 : 0})`,
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="relative min-h-[14rem]" role="tabpanel">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.step}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 flex flex-col justify-center"
              >
                <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--sage)] uppercase">
                  Step {current.step} of {String(stepCount).padStart(2, "0")}
                </p>
                <h3 className="mt-4 font-display text-5xl tracking-[-0.02em] text-white">
                  {current.title}
                </h3>
                <p className="mt-5 max-w-md text-lg leading-[1.55] text-[var(--muted-foreground)]">
                  {current.description}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-auto pt-6">
          <div className="h-px w-full overflow-hidden bg-[var(--border)]">
            <div
              className="h-full bg-linear-to-r from-[var(--highlight)] to-[var(--accent)]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      </div>
    </PinnedSection>
  );
}
