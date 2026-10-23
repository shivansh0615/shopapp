import { cn } from "@/lib/utils";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-linear-to-b from-[var(--accent-hover)] to-[var(--accent)] text-[var(--accent-foreground)] hover:from-[#ebc686] hover:to-[var(--accent-hover)] shadow-none",
  secondary:
    "border border-[var(--border-strong)] bg-transparent text-[var(--foreground)] hover:border-[var(--accent)] hover:text-white",
  ghost:
    "bg-transparent text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--surface)]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-11 h-11 px-4 text-[13px]",
  md: "min-h-11 h-11 px-5 text-sm",
  lg: "min-h-11 h-14 px-8 text-[15px]",
};

const baseClass =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-[-0.01em] transition-all duration-300 touch-manipulation disabled:pointer-events-none disabled:opacity-50";

interface SharedProps {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

type ButtonAsButton = SharedProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    href?: undefined;
  };

type ButtonAsLink = SharedProps &
  AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  href,
  ...props
}: ButtonProps) {
  const classes = cn(baseClass, variants[variant], sizes[size], className);

  if (href) {
    return (
      <a
        href={href}
        className={classes}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      className={classes}
      {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {children}
    </button>
  );
}
