"use client";

import { type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";

export function PinnedSection({
  id,
  sectionRef,
  heightClass,
  className,
  stageClassName,
  ariaLabel,
  children,
}: {
  id?: string;
  sectionRef?: Ref<HTMLElement | null>;
  heightClass: string;
  className?: string;
  stageClassName?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  return (
    <section
      ref={sectionRef}
      id={id}
      className={cn("relative", heightClass, className)}
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          "sticky top-[var(--nav-height)] h-[calc(100svh-var(--nav-height))] overflow-hidden",
          stageClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
