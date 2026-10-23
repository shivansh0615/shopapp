export const easeLuxury = [0.16, 1, 0.3, 1] as const;

export const fadeInUp = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.6, ease: easeLuxury },
  },
};

export const staggerContainer = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.14,
      delayChildren: 0.12,
    },
  },
};

export const viewportOnce = {
  once: true,
  amount: 0.05,
} as const;
