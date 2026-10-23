import type { CSSProperties, ReactNode } from "react";
import { Link, useLocation } from "react-router";

type PrimaryButtonProps = {
  children: ReactNode;
  style?: CSSProperties;
  href?: string;
  type?: "button" | "submit" | "reset";
  className?: string;
  disabled?: boolean;
  loading?: boolean;
  name?: string;
  value?: string;
  form?: string;
};

export function PrimaryButton({
  children,
  style,
  href,
  type = "button",
  className,
  disabled,
  loading,
  name,
  value,
  form,
}: PrimaryButtonProps) {
  const location = useLocation();
  const merged = style;
  const stateClass = loading ? "is-loading" : "";
  const cls = ["fgpb-btn", "fgpb-btn--primary", stateClass, className].filter(Boolean).join(" ");
  const isDisabled = Boolean(disabled || loading);

  if (href) {
    const isInternal = href.startsWith("/");
    if (isDisabled) {
      return (
        <span className={cls} style={merged} aria-disabled="true">
          {children}
        </span>
      );
    }
    return isInternal ? (
      <Link to={{ pathname: href, search: location.search }} className={cls} style={merged}>
        {children}
      </Link>
    ) : (
      <a href={href} className={cls} style={merged}>
        {children}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={cls}
      style={merged}
      disabled={isDisabled}
      name={name}
      value={value}
      form={form}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}
