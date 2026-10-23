"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo } from "react";

interface GiftUnlockPopupProps {
  open: boolean;
  onClose: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

const PALETTE = [
  "#e8c9a0",
  "#d4a574",
  "#f0d49a",
  "#ffffff",
  "#c9a06a",
  "#f5e6d0",
] as const;

type Piece = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  rotate: number;
  color: string;
  drift: number;
  shape: "rect" | "bar" | "dot";
};

function buildPieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, i) => {
    const shapeRoll = i % 5;
    return {
      id: i,
      left: (i * 17.3) % 100,
      delay: (i % 12) * 0.05,
      duration: 2.4 + (i % 7) * 0.22,
      size: shapeRoll === 0 ? 3 : 4 + (i % 5),
      rotate: (i * 47) % 360,
      color: PALETTE[i % PALETTE.length],
      drift: ((i % 9) - 4) * 18,
      shape: shapeRoll === 0 ? "dot" : shapeRoll < 3 ? "bar" : "rect",
    };
  });
}

/**
 * Luxury champagne confetti celebration — no modal block.
 */
export function GiftUnlockPopup({ open, onClose }: GiftUnlockPopupProps) {
  const pieces = useMemo(() => buildPieces(28), []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(onClose, 3400);
    return () => window.clearTimeout(t);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[120] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          aria-live="polite"
          aria-label="Gift unlocked"
        >
          {/* Soft gold wash */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            style={{
              background:
                "radial-gradient(ellipse 55% 40% at 50% 35%, rgba(212,165,116,0.18), transparent 70%)",
            }}
          />

          {pieces.map((p) => (
            <motion.span
              key={p.id}
              className="absolute top-[-8%]"
              style={{
                left: `${p.left}%`,
                width: p.shape === "bar" ? p.size * 0.35 : p.size,
                height: p.shape === "bar" ? p.size * 2.2 : p.size,
                borderRadius: p.shape === "dot" ? 999 : 1,
                background: p.color,
                boxShadow:
                  p.color === "#ffffff"
                    ? "0 0 8px rgba(255,255,255,0.35)"
                    : "0 0 10px rgba(212,165,116,0.25)",
              }}
              initial={{
                y: "-10vh",
                x: 0,
                opacity: 0,
                rotate: p.rotate,
                scale: 0.6,
              }}
              animate={{
                y: "110vh",
                x: p.drift,
                opacity: [0, 1, 1, 0.85, 0],
                rotate: p.rotate + 180 + (p.id % 3) * 40,
                scale: 1,
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: [0.22, 0.05, 0.3, 1],
                opacity: {
                  duration: p.duration,
                  times: [0, 0.08, 0.55, 0.85, 1],
                },
              }}
            />
          ))}

          {/* Floating caption — not a card */}
          <motion.div
            className="absolute inset-x-0 top-[28%] flex justify-center px-6"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.7, delay: 0.12, ease: EASE }}
          >
            <p className="text-center font-display text-3xl tracking-[-0.03em] text-white md:text-4xl">
              Gift{" "}
              <span className="italic text-[var(--accent-deep)]">unlocked</span>
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
