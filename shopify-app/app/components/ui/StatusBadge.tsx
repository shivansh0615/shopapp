import type { ReactNode } from "react";

type Status = "ACTIVE" | "DRAFT" | "PAUSED" | string;

const map: Record<string, string> = {
  ACTIVE: "fgpb-badge fgpb-badge--success",
  DRAFT: "fgpb-badge fgpb-badge--neutral",
  PAUSED: "fgpb-badge fgpb-badge--warning",
  ERROR: "fgpb-badge fgpb-badge--danger",
};

const labels: Record<string, string> = {
  ACTIVE: "Active",
  DRAFT: "Draft",
  PAUSED: "Paused",
  ERROR: "Attention",
};

export function StatusBadge({ status, children }: { status: Status; children?: ReactNode }) {
  const cls = map[status] || "fgpb-badge fgpb-badge--neutral";
  const label = children ?? labels[status] ?? status;
  return (
    <span className={cls}>
      <span className="fgpb-badge__dot" aria-hidden />
      {label}
    </span>
  );
}
