"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { fadeInUp, viewportOnce } from "@/lib/animations";
import type { ReactNode } from "react";

interface SectionProps {
  id?: string;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  title?: string;
  description?: string;
  align?: "left" | "center";
}

export function Section({
  id,
  children,
  className,
  containerClassName,
  title,
  description,
  align = "left",
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "py-[var(--section-y)] md:py-[var(--section-y-lg)] overflow-x-clip",
        className,
      )}
    >
      <div className={cn("page-shell", containerClassName)}>
        {title ? (
          <motion.div
            variants={fadeInUp}
            initial={false}
            whileInView="visible"
            viewport={viewportOnce}
            className={cn(
              "min-w-0 max-w-3xl",
              align === "center" && "mx-auto text-center",
            )}
          >
            <h2 className="section-heading">{title}</h2>
            {description ? (
              <p
                className={cn(
                  "section-lede",
                  align === "center" && "mx-auto",
                )}
              >
                {description}
              </p>
            ) : null}
          </motion.div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
