import type { CSSProperties } from "react";

export type WidgetTemplateId =
  | "Minimal"
  | "Premium"
  | "Gradient"
  | "Cart Drawer"
  | "Mobile Compact"
  | "Celebration";

export function templateSlug(template: string): string {
  return String(template || "Premium")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

/** Distinct card chrome for each merchant template (admin preview + shared contract). */
export function cardStyleForTemplate(
  template: string,
  opts: {
    backgroundColor: string;
    barColor: string;
    textColor: string;
    borderRadius: number;
    padding: number;
    gap: number;
  },
): CSSProperties {
  const { backgroundColor: bg, barColor: bar, textColor, borderRadius, padding, gap } = opts;
  const base: CSSProperties = {
    width: "100%",
    padding: `${padding}px`,
    color: textColor,
    display: "grid",
    gap,
    boxSizing: "border-box",
  };

  switch (template) {
    case "Minimal":
      return {
        ...base,
        background: bg,
        border: "1px solid rgba(17, 24, 39, 0.06)",
        borderRadius: Math.min(Math.max(0, borderRadius), 8),
        boxShadow: "none",
      };
    case "Gradient":
      return {
        ...base,
        background: `linear-gradient(135deg, ${bg} 0%, ${bar}33 100%)`,
        border: "1px solid rgba(17, 24, 39, 0.08)",
        borderRadius: Math.max(borderRadius, 8),
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
      };
    case "Cart Drawer":
      return {
        ...base,
        background: bg,
        border: "none",
        borderBottom: "1px solid rgba(17, 24, 39, 0.1)",
        borderRadius: 0,
        boxShadow: "none",
      };
    case "Mobile Compact":
      return {
        ...base,
        gap: Math.max(4, Math.round(gap * 0.75)),
        padding: `${Math.max(2, Math.round(padding * 0.85))}px`,
        background: bg,
        border: "1px solid rgba(17, 24, 39, 0.08)",
        borderRadius: Math.max(Math.min(borderRadius, 12), 6),
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.05)",
      };
    case "Celebration":
      return {
        ...base,
        background: `linear-gradient(160deg, ${bg} 0%, ${bar}28 52%, ${bg} 100%)`,
        border: `1px solid ${bar}55`,
        borderRadius: Math.max(borderRadius, 14),
        boxShadow: `0 10px 28px ${bar}2a`,
      };
    case "Premium":
    default:
      return {
        ...base,
        background: bg,
        border: "1px solid rgba(17, 24, 39, 0.08)",
        borderRadius: Math.max(borderRadius, 8),
        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
      };
  }
}

export function fillStyleForTemplate(
  template: string,
  barColor: string,
  trackH: number,
  fillWidth: number,
): CSSProperties {
  const base: CSSProperties = {
    width: `${fillWidth}%`,
    height: `${trackH}px`,
    minHeight: `${trackH}px`,
    borderRadius: 999,
    display: "block",
  };

  if (template === "Celebration") {
    return {
      ...base,
      backgroundImage: `linear-gradient(90deg, ${barColor}cc, ${barColor}, ${barColor}aa)`,
      backgroundColor: barColor,
      boxShadow: `0 0 10px ${barColor}66`,
    };
  }

  if (template === "Minimal") {
    return {
      ...base,
      backgroundColor: barColor,
      backgroundImage: "none",
    };
  }

  if (template === "Gradient") {
    return {
      ...base,
      backgroundColor: barColor,
      backgroundImage: `linear-gradient(90deg, ${barColor}dd, ${barColor})`,
    };
  }

  return {
    ...base,
    backgroundColor: barColor,
    backgroundImage: `linear-gradient(${barColor}, ${barColor})`,
  };
}
