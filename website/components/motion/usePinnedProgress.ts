"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

export function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function usePinnedProgress(
  sectionRef: RefObject<HTMLElement | null>,
  options?: { buckets?: number; enabled?: boolean },
) {
  const buckets = options?.buckets ?? 80;
  const enabled = options?.enabled ?? true;
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const lastBucket = useRef(-1);

  const read = useCallback(() => {
    const section = sectionRef.current;
    if (!section) return 0;
    const rect = section.getBoundingClientRect();
    const total = section.offsetHeight - window.innerHeight;
    const scrolled = -rect.top;
    return total > 0 ? clamp01(scrolled / total) : 0;
  }, [sectionRef]);

  useEffect(() => {
    if (!enabled) {
      progressRef.current = 0;
      lastBucket.current = 0;
      setProgress(0);
      return;
    }

    let frame = 0;
    const update = () => {
      const p = read();
      progressRef.current = p;
      const bucket = Math.round(p * buckets) / buckets;
      if (bucket !== lastBucket.current) {
        lastBucket.current = bucket;
        setProgress(bucket);
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
  }, [buckets, enabled, read]);

  const scrollToProgress = useCallback(
    (t: number, behavior: ScrollBehavior = "smooth") => {
      const section = sectionRef.current;
      if (!section) return;
      const total = Math.max(section.offsetHeight - window.innerHeight, 0);
      const top =
        section.getBoundingClientRect().top + window.scrollY + clamp01(t) * total;
      window.scrollTo({ top, behavior });
    },
    [sectionRef],
  );

  return { progress, progressRef, scrollToProgress };
}
