import type { CSSProperties } from "react";
import { cardStyleForTemplate, fillStyleForTemplate } from "../../lib/widget-templates";

export type WidgetLivePreviewProps = {
  heading: string;
  description: string;
  template: string;
  barColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number;
  progressHeight: number;
  widgetPadding?: number;
  buttonText: string;
  progressPercent: number;
  remainingLabel: string;
  giftTitle: string;
  giftImageUrl?: string | null;
  unlocked?: boolean;
};

function hex6(value: string, fallback: string) {
  const v = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/i.test(v)) return v.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/i.test(v)) return `#${v.toLowerCase()}`;
  return fallback;
}

export function WidgetLivePreview({
  heading,
  description,
  template,
  barColor,
  backgroundColor,
  textColor,
  borderRadius,
  progressHeight,
  widgetPadding = 16,
  buttonText,
  progressPercent,
  remainingLabel,
  giftTitle,
  giftImageUrl,
  unlocked = false,
}: WidgetLivePreviewProps) {
  const fillWidth = Math.max(0, Math.min(100, unlocked ? 100 : progressPercent));
  const safeBar = hex6(barColor, "#111111");
  const safeBg = hex6(backgroundColor, "#FAFAFA");
  const safeText = hex6(textColor, "#111111");
  const trackH = Math.max(4, Math.min(40, Number(progressHeight) || 12));
  const pad = Math.max(2, Math.min(32, Number(widgetPadding) || 16));
  const gap = Math.max(4, Math.round(pad * 0.65));
  const radius = Math.max(0, Number(borderRadius) || 0);
  const compact = template === "Mobile Compact" || pad <= 8;
  const headingSize = compact ? 13 : pad >= 24 ? 18 : 16;
  const bodySize = compact ? 11 : 13;
  const thumb = compact ? 32 : 40;
  const showButton = template !== "Minimal" && template !== "Cart Drawer";

  const trackStyle: CSSProperties = {
    width: "100%",
    height: `${trackH}px`,
    minHeight: `${trackH}px`,
    borderRadius: 999,
    background: template === "Celebration" ? `${safeBar}22` : "rgba(17,24,39,0.12)",
    overflow: "hidden",
  };

  const cardStyle = cardStyleForTemplate(template, {
    backgroundColor: safeBg,
    barColor: safeBar,
    textColor: safeText,
    borderRadius: radius,
    padding: pad,
    gap,
  });

  return (
    <div style={cardStyle} data-fgpb-pad={pad} data-fg-tpl={template}>
      <p
        style={{
          margin: 0,
          fontSize: headingSize,
          fontWeight: template === "Minimal" ? 600 : 700,
          lineHeight: 1.35,
          color: safeText,
        }}
      >
        {heading}
      </p>

      <div style={trackStyle}>
        <div style={fillStyleForTemplate(template, safeBar, trackH, fillWidth)} />
      </div>

      <p style={{ margin: 0, fontSize: bodySize, lineHeight: 1.4, color: safeText, opacity: 0.72 }}>
        {description}
      </p>

      {template !== "Minimal" ? (
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 10 }}>
          {giftImageUrl ? (
            <img
              src={giftImageUrl}
              alt=""
              style={{ width: thumb, height: thumb, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
            />
          ) : (
            <div
              style={{
                width: thumb,
                height: thumb,
                borderRadius: 8,
                background: "rgba(17,24,39,0.12)",
                flexShrink: 0,
              }}
            />
          )}
          <p style={{ margin: 0, fontSize: bodySize, color: safeText, opacity: 0.85 }}>
            Gift: {giftTitle}
          </p>
        </div>
      ) : null}

      {showButton ? (
        <button
          type="button"
          style={{
            width: "100%",
            border: `1px solid ${safeText}`,
            borderRadius: template === "Celebration" ? 999 : 10,
            backgroundColor: template === "Celebration" ? safeBar : safeText,
            color: safeBg,
            padding: compact ? "8px 10px" : "10px 12px",
            fontSize: compact ? 13 : 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {buttonText}
        </button>
      ) : null}

      <p style={{ margin: 0, fontSize: 12, color: "#999", lineHeight: 1.45 }}>{remainingLabel}</p>
    </div>
  );
}
