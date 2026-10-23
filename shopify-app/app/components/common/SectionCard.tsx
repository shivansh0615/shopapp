import type { CSSProperties, ReactNode } from "react";
import { cardStyle, cardTitleStyle, color, sectionCardStyle } from "../../styles/tokens";

type SectionCardProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  as?: "article" | "section" | "aside" | "div";
  cardStyle?: CSSProperties;
  titleStyle?: CSSProperties;
  large?: boolean;
  headerRight?: ReactNode;
};

export function SectionCard({
  title,
  description,
  children,
  as = "article",
  cardStyle: override,
  titleStyle: titleOverride,
  large,
  headerRight,
}: SectionCardProps) {
  const Tag = as;
  return (
    <Tag style={{ ...(large ? sectionCardStyle : cardStyle), ...override }}>
      {title || headerRight ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: description || title ? 20 : 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title ? <h2 style={{ ...cardTitleStyle, marginBottom: description ? 6 : 0, ...titleOverride }}>{title}</h2> : null}
            {description ? (
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: color.textSecondary, maxWidth: 560 }}>
                {description}
              </p>
            ) : null}
          </div>
          {headerRight}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
