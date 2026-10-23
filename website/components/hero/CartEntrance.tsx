"use client";

import { motion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";

type Phase = "seed" | "grow" | "fill" | "done";

interface CartEntranceProps {
  children: ReactNode;
  reducedMotion: boolean;
  onComplete: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Brief entrance: small rect → enlarge → reveal cart → unlock scroll.
 */
export function CartEntrance({
  children,
  reducedMotion,
  onComplete,
}: CartEntranceProps) {
  const [phase, setPhase] = useState<Phase>(reducedMotion ? "done" : "seed");

  useEffect(() => {
    if (reducedMotion) {
      onComplete();
      return;
    }

    const grow = window.setTimeout(() => setPhase("grow"), 280);
    const fill = window.setTimeout(() => setPhase("fill"), 980);
    const done = window.setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 1450);

    return () => {
      window.clearTimeout(grow);
      window.clearTimeout(fill);
      window.clearTimeout(done);
    };
  }, [reducedMotion, onComplete]);

  const expanded = phase !== "seed";
  const showContent = phase === "fill" || phase === "done";

  return (
    <div className="relative w-full max-w-[380px]">
      <motion.div
        className="origin-center"
        initial={false}
        animate={{
          scale: expanded ? 1 : 0.14,
          opacity: 1,
        }}
        transition={{
          duration: 0.7,
          ease: EASE,
        }}
      >
        <div className="relative overflow-hidden rounded-2xl">
          <motion.div
            initial={false}
            animate={{
              opacity: showContent ? 1 : 0,
              y: showContent ? 0 : 10,
            }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {children}
          </motion.div>

          <motion.div
            className="pointer-events-none absolute inset-0 rounded-2xl border border-white/10 bg-[#141414]"
            initial={false}
            animate={{ opacity: showContent ? 0 : 1 }}
            transition={{ duration: 0.35, ease: EASE }}
            aria-hidden
          />
        </div>
      </motion.div>
    </div>
  );
}
