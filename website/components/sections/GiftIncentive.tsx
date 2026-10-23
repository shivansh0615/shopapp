"use client";

import { useRef } from "react";
import { GiftBox3D } from "@/components/three/GiftBox3D";
import { PinnedSection } from "@/components/motion/PinnedSection";
import {
  easeInOutCubic,
  lerp,
  usePinnedProgress,
} from "@/components/motion/usePinnedProgress";
import { usePrefersReducedMotion } from "@/components/three/hooks";
import { SITE } from "@/lib/constants";

const INCENTIVES = [
  "Free gifts",
  "Upsells",
  "Cross-sells",
  "Cart incentives",
  "Product recommendations",
] as const;

function GiftCopy() {
  return (
    <div className="relative z-20 w-full min-w-0 max-w-xl">
      <p className="text-[11px] font-medium tracking-[0.2em] text-[var(--highlight)] uppercase">
        Incentives
      </p>
      <h2 className="section-heading mt-5">
        Give Customers A Reason To Add More.
      </h2>
      <p className="section-lede mt-5">
        Merchants use UpsellTrix to reward bigger carts — free gifts, upsells,
        cross-sells, cart incentives, and product recommendations that feel
        natural at checkout.
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-3 sm:mt-10 sm:grid-cols-2">
        {INCENTIVES.map((item) => (
          <li
            key={item}
            className="border-t border-[var(--border)] pt-3 text-sm leading-[1.55] text-[var(--muted-foreground)]"
          >
            <span className="text-white">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GiftStatic() {
  return (
    <section
      id="incentives"
      className="relative overflow-x-clip border-t border-[var(--border)] bg-black py-[var(--section-y)] md:py-[var(--section-y-lg)]"
      aria-label={`${SITE.name} gift incentives`}
    >
      <div className="gift-atmos pointer-events-none absolute inset-0" />
      <div className="page-shell relative z-10 flex flex-col gap-10 lg:grid lg:grid-cols-[1fr_0.85fr] lg:items-center lg:gap-16">
        <GiftCopy />
        <div className="relative mx-auto aspect-square w-full max-w-[240px] lg:max-w-[420px]">
          <GiftBox3D className="h-full w-full" />
        </div>
      </div>
    </section>
  );
}

export function GiftIncentive() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const { progress, progressRef } = usePinnedProgress(sectionRef, {
    enabled: !reducedMotion,
  });

  const t = easeInOutCubic(progress);
  const lift = lerp(18, 0, t);
  const scale = lerp(0.72, 1, t);
  const glow = lerp(0.12, 0.32, t);

  if (reducedMotion) return <GiftStatic />;

  return (
    <PinnedSection
      id="incentives"
      sectionRef={sectionRef}
      heightClass="h-auto lg:h-[200vh]"
      stageClassName="max-lg:relative max-lg:h-auto max-lg:overflow-x-clip max-lg:overflow-y-visible"
      className="border-t border-[var(--border)] bg-black"
      ariaLabel={`${SITE.name} gift incentives`}
    >
      <div
        className="relative flex h-full flex-col gap-10 py-[var(--section-y)] lg:block lg:py-0"
        style={{
          ["--gift-lift" as string]: `${lift}vh`,
          ["--gift-scale" as string]: String(scale),
        }}
      >
        <div className="gift-atmos pointer-events-none absolute inset-0" />
        <div
          className="pointer-events-none absolute inset-0 hidden lg:block"
          aria-hidden
          style={{
            background: `radial-gradient(ellipse 48% 52% at 70% 55%, rgba(196,93,69,${glow}), transparent 66%)`,
          }}
        />

        <div className="page-shell relative z-20 lg:flex lg:h-full lg:items-center lg:py-8">
          <GiftCopy />
        </div>

        <div className="gift-visual" aria-hidden>
          <div className="aspect-square w-full">
            <GiftBox3D className="h-full w-full" progressRef={progressRef} />
          </div>
        </div>
      </div>
    </PinnedSection>
  );
}
