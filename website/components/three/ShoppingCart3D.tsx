"use client";

import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";

const ModelViewer = dynamic(
  () => import("@/components/three/ModelViewer").then((m) => m.ModelViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[240px] w-full items-center justify-center">
        <p className="text-[11px] tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
          Loading model…
        </p>
      </div>
    ),
  },
);

export function ShoppingCart3D({
  className,
  progressRef,
}: {
  className?: string;
  progressRef?: MutableRefObject<number>;
}) {
  return (
    <ModelViewer
      model="/models/shopping-cart.glb"
      variant="hero"
      scrollMotion="hero"
      glow="gold"
      progressRef={progressRef}
      label="3D shopping cart"
      className={className}
    />
  );
}
