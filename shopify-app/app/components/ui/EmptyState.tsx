import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { PrimaryButton } from "../common/PrimaryButton";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  icon?: ReactNode;
};

const defaultIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
    <path d="M12 5v3" />
    <path d="M8 8h8l1.2 3H6.8L8 8z" />
    <path d="M7 11v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7" />
  </svg>
);

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
  icon,
}: EmptyStateProps) {
  const location = useLocation();

  return (
    <div className="fgpb-empty">
      <span className="fgpb-empty__icon" aria-hidden>
        {icon ?? defaultIcon}
      </span>
      <h3 className="fgpb-empty__title">{title}</h3>
      <p className="fgpb-empty__text">{description}</p>
      {actionLabel && actionHref ? (
        <PrimaryButton href={actionHref}>{actionLabel}</PrimaryButton>
      ) : null}
      {secondaryLabel && secondaryHref ? (
        <p className="fgpb-empty__secondary">
          <Link to={{ pathname: secondaryHref, search: location.search }}>{secondaryLabel}</Link>
        </p>
      ) : null}
    </div>
  );
}
