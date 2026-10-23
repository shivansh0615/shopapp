import type { ReactNode } from "react";
import { color } from "../../styles/tokens";

type SectionLabelProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
};

/** Small section divider used above groups of cards */
export function SectionLabel({ title, description, action, id }: SectionLabelProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      <div>
        <h2
          id={id}
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 600,
            color: color.text,
          }}
        >
          {title}
        </h2>
        {description ? (
          <p style={{ margin: "6px 0 0", fontSize: 13, color: color.textSecondary, maxWidth: 520 }}>
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

type PageStackProps = {
  children: ReactNode;
  gap?: number;
  className?: string;
};

export function PageStack({ children, gap = 24, className }: PageStackProps) {
  return <div className={className} style={{ display: "grid", gap }}>{children}</div>;
}
