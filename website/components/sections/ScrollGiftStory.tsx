"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { SITE } from "@/lib/constants";
import { CartEntrance } from "@/components/hero/CartEntrance";
import { GiftUnlockPopup } from "@/components/hero/GiftUnlockPopup";
import { ScrollCart } from "@/components/hero/ScrollCart";
import { SCROLL_STAGES, storyFromProgress } from "./scroll-gift/scroll-progress";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const media = window.matchMedia("(prefers-reduced-motion: reduce)");
      media.addEventListener("change", onStoreChange);
      return () => media.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const STAGE_COPY: Record<
  number,
  {
    kicker: string;
    lines: { text: string; accent?: boolean }[];
    detail: string;
  }
> = {
  0: {
    kicker: "Gift with purchase",
    lines: [
      { text: "Free gifts that" },
      { text: "grow your AOV.", accent: true },
    ],
    detail:
      "Scroll to fill the cart — or tap Add Reebok to cross $100 and unlock.",
  },
  1: {
    kicker: "Threshold",
    lines: [
      { text: "Spend climbs" },
      { text: "toward the gift.", accent: true },
    ],
    detail: "The gift stays locked until the cart hits $100.",
  },
  2: {
    kicker: "Reward",
    lines: [
      { text: "The gift" },
      { text: "unlocks in cart.", accent: true },
    ],
    detail: "Only at threshold does the free gift appear at checkout.",
  },
  3: {
    kicker: "Delight",
    lines: [
      { text: "Shoppers feel" },
      { text: "the reward.", accent: true },
    ],
    detail: "Clear unlock UX turns the cart into a moment worth completing.",
  },
  4: {
    kicker: "Outcome",
    lines: [
      { text: "Average order" },
      { text: "value rises.", accent: true },
    ],
    detail: "One engine. Stronger AOV. No discount-app pileup.",
  },
};

const STAGE_TARGETS = [0, 0.22, 0.48, 0.68, 0.9] as const;

export function ScrollGiftStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [introDone, setIntroDone] = useState(reducedMotion);
  const [stage, setStage] = useState(0);
  const [progress, setProgress] = useState(0);
  const [boosted, setBoosted] = useState(false);
  const [giftPopupOpen, setGiftPopupOpen] = useState(false);

  const handleIntroComplete = useCallback(() => {
    setIntroDone(true);
  }, []);

  const handleUnlock = useCallback(() => {
    setGiftPopupOpen(true);
  }, []);

  const handleClosePopup = useCallback(() => {
    setGiftPopupOpen(false);
  }, []);

  useEffect(() => {
    if (introDone || reducedMotion) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.scrollTo({ top: 0, behavior: "auto" });
    return () => {
      document.body.style.overflow = prev;
    };
  }, [introDone, reducedMotion]);

  useEffect(() => {
    if (!introDone) return;

    if (reducedMotion) {
      setProgress(1);
      setStage(4);
      return;
    }

    const section = sectionRef.current;
    if (!section) return;

    let frame = 0;
    let lastStage = -1;
    let lastBucket = -1;

    const update = () => {
      const rect = section.getBoundingClientRect();
      const total = section.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const p = total > 0 ? Math.min(1, Math.max(0, scrolled / total)) : 0;

      // Bucket progress so we don't re-render every pixel of scroll
      const bucket = Math.round(p * 50) / 50;
      if (bucket !== lastBucket) {
        lastBucket = bucket;
        setProgress(bucket);
      }

      const story = storyFromProgress(p);
      if (story.stage !== lastStage) {
        lastStage = story.stage;
        setStage(story.stage);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [introDone, reducedMotion]);

  const jumpToStage = (index: number) => {
    if (!introDone) return;
    const section = sectionRef.current;
    if (!section) return;
    const total = section.offsetHeight - window.innerHeight;
    const target = STAGE_TARGETS[index] ?? 0;
    const top =
      section.getBoundingClientRect().top +
      window.scrollY +
      target * Math.max(total, 0);
    window.scrollTo({ top, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const copy = STAGE_COPY[stage] ?? STAGE_COPY[0];
  const indexLabel = `${String(stage + 1).padStart(2, "0")} / ${String(SCROLL_STAGES.length).padStart(2, "0")}`;
  const progressPct = Math.round(progress * 100);

  return (
    <section
      ref={sectionRef}
      id="top"
      className={
        introDone
          ? "relative h-[260vh] md:h-[300vh]"
          : "relative h-[calc(100svh-var(--nav-height))]"
      }
      aria-label={`${SITE.name} gift unlock story`}
    >
      <div className="sticky top-[var(--nav-height)] h-[calc(100svh-var(--nav-height))] overflow-hidden bg-black">
        <div className="hero-atmos pointer-events-none absolute inset-0" />

        <div className="page-shell relative z-10 grid h-full items-center gap-10 py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 xl:gap-24">
          {/* Copy — brand first */}
          <motion.div
            className="order-2 flex flex-col justify-center lg:order-1"
            initial={reducedMotion ? false : { opacity: 0, y: 16 }}
            animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="hero-brand">{SITE.name}</p>

            <div className="mt-10 md:mt-14">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stage}
                  initial={
                    reducedMotion || !introDone ? false : { opacity: 0, y: 12 }
                  }
                  animate={{ opacity: 1, y: 0 }}
                  exit={
                    reducedMotion || !introDone
                      ? undefined
                      : { opacity: 0, y: -8 }
                  }
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="mb-4 flex items-center gap-3">
                    <span className="hero-kicker">{copy.kicker}</span>
                    <span className="hero-index" aria-hidden>
                      {indexLabel}
                    </span>
                  </div>

                  <h1 className="hero-display">
                    {copy.lines.map((line) => (
                      <span
                        key={line.text}
                        className={`block ${line.accent ? "hero-display-accent" : ""}`}
                      >
                        {line.text}
                      </span>
                    ))}
                  </h1>

                  <p className="hero-detail mt-5">{copy.detail}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-9 flex items-center gap-2">
              {SCROLL_STAGES.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  aria-label={`Go to stage ${i + 1}`}
                  aria-current={stage === i ? "step" : undefined}
                  disabled={!introDone}
                  onClick={() => jumpToStage(i)}
                  className={`h-1.5 rounded-full transition-all duration-300 disabled:opacity-30 ${
                    stage === i
                      ? "w-8 bg-white"
                      : "w-1.5 bg-[var(--border-strong)] hover:bg-[var(--muted-foreground)]"
                  }`}
                />
              ))}
            </div>

            {introDone && (stage === 0 || stage === 4) ? (
              <a
                href="#pricing"
                className="mt-9 inline-flex w-fit items-center gap-2 text-sm font-medium text-white transition-colors hover:text-[var(--accent)]"
              >
                {SITE.primaryCta}
                <ArrowUpRight size={16} strokeWidth={1.75} />
              </a>
            ) : (
              <div className="mt-9 h-5" aria-hidden />
            )}

            <div className="mt-10 flex items-center gap-4">
              <div className="h-px w-24 overflow-hidden bg-[var(--border)]">
                <div
                  className="h-full bg-white transition-[width] duration-200 ease-out"
                  style={{ width: introDone ? `${progressPct}%` : "0%" }}
                />
              </div>
              {introDone ? (
                <span className="text-[11px] tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
                  Scroll
                </span>
              ) : null}
            </div>
          </motion.div>

          {/* Cart visual */}
          <div className="order-1 flex justify-center lg:order-2 lg:justify-end">
            <CartEntrance
              reducedMotion={reducedMotion}
              onComplete={handleIntroComplete}
            >
              <ScrollCart
                progress={progress}
                reducedMotion={reducedMotion}
                boosted={boosted}
                onBoost={() => setBoosted(true)}
                interactive={introDone}
                onUnlock={handleUnlock}
              />
            </CartEntrance>
          </div>
        </div>
      </div>

      <GiftUnlockPopup open={giftPopupOpen} onClose={handleClosePopup} />
    </section>
  );
}
