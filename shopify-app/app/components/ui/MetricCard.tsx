import type { CSSProperties } from "react";
import { cardStyle, color, fonts } from "../../styles/tokens";

type MetricCardProps = {
  label: string;
  value: string;
  icon?: React.ReactNode;
  hint?: string;
};

export function MetricCard({ label, value, icon, hint }: MetricCardProps) {
  return (
    <article
      style={{
        ...cardStyle,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        minHeight: 140,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 500,
            color: color.textMuted,
          }}
        >
          {label}
        </p>
        {icon ? (
          <span
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: color.bgMuted,
              border: `1px solid ${color.border}`,
              display: "grid",
              placeItems: "center",
              color: color.text,
              flexShrink: 0,
            }}
            aria-hidden
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p
        style={{
          margin: "18px 0 0",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "-0.04em",
          fontFamily: fonts.body,
          color: color.text,
          lineHeight: 1,
        }}
      >
        {value}
      </p>
      {hint ? (
        <p style={{ margin: "auto 0 0", paddingTop: 14, fontSize: 12, color: color.textMuted } as CSSProperties}>
          {hint}
        </p>
      ) : null}
    </article>
  );
}
