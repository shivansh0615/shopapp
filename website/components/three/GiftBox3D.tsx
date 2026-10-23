"use client";

import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";

const ModelViewer = dynamic(
  () => import("@/components/three/ModelViewer").then((m) => m.ModelViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[220px] w-full items-center justify-center">
        <p className="text-[11px] tracking-[0.18em] text-[var(--muted-foreground)] uppercase">
          Loading model…
        </p>
      </div>
    ),
  },
);

export function GiftBox3D({
  className,
  progressRef,
}: {
  className?: string;
  progressRef?: MutableRefObject<number>;
}) {
  return (
    <ModelViewer
      model="/models/gift-box.glb"
      variant="feature"
      scrollMotion="gift"
      glow="terracotta"
      progressRef={progressRef}
      label="3D gift box"
      className={className}
    />
  );
}
