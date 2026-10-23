import type { CSSProperties } from "react";
import { useEffect, useId, useState } from "react";
import type { CelebrationPopupStyle } from "../../lib/widget-settings";

export type CelebrationPopupPreviewProps = {
  style: CelebrationPopupStyle;
  heading: string;
  description: string;
  tierHeading?: string;
  tierDescription?: string;
  buttonText: string;
  borderRadius: number;
  drawerSizePercent?: number;
  cardBackgroundColor: string;
  titleColor: string;
  descriptionColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  iconBackgroundColor: string;
  showIcon: boolean;
  showConfetti: boolean;
  /** When true, offer 1st / last tier unlock toggle. */
  allowTierMode?: boolean;
  /** Optional chip labels for tiered preview modes. */
  tierPreviewLabels?: { first: string; last: string };
};

const GIFT_ICON = (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
    <path
      fill="currentColor"
      d="M20 7h-2.18A3 3 0 0 0 15 4a3 3 0 0 0-2.82 2H11.8A3 3 0 0 0 9 4a3 3 0 0 0-2.82 3H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1ZM9 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm6 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM3 12v7a2 2 0 0 0 2 2h6v-9H3Zm10 9h6a2 2 0 0 0 2-2v-7h-8v9Z"
    />
  </svg>
);

function PopupCard({
  style,
  heading,
  description,
  buttonText,
  borderRadius,
  cardBackgroundColor,
  titleColor,
  descriptionColor,
  buttonBackgroundColor,
  buttonTextColor,
  iconBackgroundColor,
  showIcon,
  showConfetti,
  compact = false,
}: {
  style: CelebrationPopupStyle;
  heading: string;
  description: string;
  buttonText: string;
  borderRadius: number;
  cardBackgroundColor: string;
  titleColor: string;
  descriptionColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  iconBackgroundColor: string;
  showIcon: boolean;
  showConfetti: boolean;
  compact?: boolean;
}) {
  const isToast = style === "toast";
  const isBold = style === "bold";
  const isMinimal = style === "minimal";
  const isSoft = style === "soft";
  const cardBg = isBold ? "#111111" : cardBackgroundColor;
  const title = isBold ? "#ffffff" : titleColor;
  const desc = isBold ? "#cfcfcf" : descriptionColor;

  const cardStyle: CSSProperties = isToast
    ? {
        display: "flex",
        alignItems: "center",
        gap: 12,
        textAlign: "left",
        width: "100%",
        maxWidth: compact ? 320 : 420,
        padding: compact ? "12px 12px" : "14px 16px",
        borderRadius,
        background: cardBg,
        boxShadow: "0 12px 32px rgba(15,23,42,.22)",
        position: "relative",
        overflow: "hidden",
      }
    : {
        width: "100%",
        maxWidth: compact ? 260 : 320,
        margin: "0 auto",
        padding: isMinimal ? (compact ? "14px 12px 12px" : "18px 16px 14px") : compact ? "20px 16px 14px" : "28px 22px 20px",
        borderRadius,
        background: cardBg,
        textAlign: "center",
        boxShadow: isSoft ? "0 16px 40px rgba(15,23,42,.12)" : "0 18px 50px rgba(15,23,42,.28)",
        position: "relative",
        overflow: "hidden",
      };

  const confettiDots =
    showConfetti && style !== "minimal"
      ? Array.from({ length: style === "confetti" ? 18 : 10 }).map((_, i) => {
          const colors = ["#f59e0b", "#ef4444", "#22c55e", "#3b82f6", "#a855f7", "#111"];
          return (
            <span
              key={i}
              style={{
                position: "absolute",
                top: `${8 + ((i * 17) % 70)}%`,
                left: `${6 + ((i * 29) % 88)}%`,
                width: 5 + (i % 4),
                height: 7 + (i % 5),
                borderRadius: i % 3 === 0 ? 999 : 2,
                background: colors[i % colors.length],
                opacity: 0.55,
                pointerEvents: "none",
              }}
            />
          );
        })
      : null;

  const icon = showIcon ? (
    <div
      style={{
        width: isToast || isMinimal || compact ? 40 : 52,
        height: isToast || isMinimal || compact ? 40 : 52,
        borderRadius: 999,
        margin: isToast ? 0 : compact ? "0 auto 10px" : "0 auto 12px",
        flex: isToast ? "0 0 auto" : undefined,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: iconBackgroundColor,
        color: "#fff",
      }}
    >
      {GIFT_ICON}
    </div>
  ) : null;

  const copy = (
    <div style={isToast ? { flex: 1, minWidth: 0 } : undefined}>
      <p
        style={{
          margin: 0,
          fontSize: isToast || isMinimal || compact ? 15 : 20,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          lineHeight: 1.25,
          color: title,
        }}
      >
        {heading}
      </p>
      {description ? (
        <p
          style={{
            margin: isToast ? "4px 0 0" : "8px 0 0",
            fontSize: isToast || compact ? 12 : 14,
            lineHeight: 1.4,
            color: desc,
          }}
        >
          {description}
        </p>
      ) : null}
    </div>
  );

  const button = (
    <button
      type="button"
      tabIndex={-1}
      style={{
        marginTop: isToast ? 0 : compact ? 12 : 18,
        appearance: "none",
        border: "none",
        borderRadius: 999,
        background: buttonBackgroundColor,
        color: buttonTextColor,
        fontSize: isToast || compact ? 12 : 14,
        fontWeight: 700,
        padding: isToast || compact ? "9px 14px" : "11px 22px",
        cursor: "default",
        flex: isToast ? "0 0 auto" : undefined,
      }}
    >
      {buttonText}
    </button>
  );

  return (
    <div style={cardStyle}>
      {confettiDots}
      {isToast ? (
        <>
          {icon}
          {copy}
          {button}
        </>
      ) : (
        <>
          {icon}
          {copy}
          {button}
        </>
      )}
    </div>
  );
}

export function CelebrationPopupPreview(props: CelebrationPopupPreviewProps) {
  const [mode, setMode] = useState<"full" | "tier">("full");
  const [overlayOpen, setOverlayOpen] = useState(false);
  const titleId = useId();

  const heading =
    mode === "tier"
      ? props.tierHeading || "You've unlocked a free gift!"
      : props.heading || "You've unlocked your free gift!";
  const description =
    mode === "tier"
      ? props.tierDescription || "Keep shopping to unlock more tier gifts."
      : props.description || "Your free gift has been added to the cart.";

  useEffect(() => {
    if (!overlayOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOverlayOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayOpen]);

  const shared = {
    style: props.style,
    heading,
    description,
    buttonText: props.buttonText || "Awesome",
    borderRadius: props.borderRadius,
    cardBackgroundColor: props.cardBackgroundColor,
    titleColor: props.titleColor,
    descriptionColor: props.descriptionColor,
    buttonBackgroundColor: props.buttonBackgroundColor,
    buttonTextColor: props.buttonTextColor,
    iconBackgroundColor: props.iconBackgroundColor,
    showIcon: props.showIcon,
    showConfetti: props.showConfetti,
  };

  const drawerScale = Math.max(30, Math.min(100, props.drawerSizePercent ?? 52)) / 100;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#111" }}>Popup preview</p>
        {props.allowTierMode ? (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={() => setMode("full")}
              style={modeChip(mode === "full")}
            >
              {props.tierPreviewLabels?.last ?? "Full unlock"}
            </button>
            <button
              type="button"
              onClick={() => setMode("tier")}
              style={modeChip(mode === "tier")}
            >
              {props.tierPreviewLabels?.first ?? "Mid-tier"}
            </button>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setOverlayOpen(true)}
          style={{
            marginLeft: "auto",
            appearance: "none",
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            borderRadius: 8,
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open full preview
        </button>
      </div>

      <div
        style={{
          position: "relative",
          borderRadius: 14,
          border: "1px solid #e5e5e5",
          overflow: "hidden",
          background:
            "linear-gradient(160deg, #e8ecf1 0%, #f7f7f8 45%, #dde3ea 100%)",
          minHeight: props.style === "toast" ? 160 : 280,
          display: "flex",
          alignItems: props.style === "toast" ? "flex-start" : "center",
          justifyContent: "center",
          padding: props.style === "toast" ? "16px 14px" : "24px 16px",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(15,23,42,.38)",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, width: "100%" }}>
          <p
            style={{
              margin: "0 0 8px",
              fontSize: 11,
              fontWeight: 600,
              color: "rgba(255,255,255,.85)",
            }}
          >
            Cart drawer size ({Math.round(drawerScale * 100)}%)
          </p>
          <div
            style={{
              zoom: drawerScale,
              width: "100%",
            }}
          >
            <PopupCard {...shared} compact />
          </div>
        </div>
      </div>

      {overlayOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483000,
            display: "flex",
            alignItems: props.style === "toast" ? "flex-start" : "center",
            justifyContent: "center",
            padding: props.style === "toast" ? "24px 16px" : 16,
          }}
        >
          <button
            type="button"
            aria-label="Close celebration preview"
            onClick={() => setOverlayOpen(false)}
            style={{
              position: "absolute",
              inset: 0,
              border: 0,
              padding: 0,
              margin: 0,
              background: "rgba(15,23,42,.45)",
              cursor: "pointer",
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: props.style === "toast" ? 440 : 360,
            }}
          >
            <p
              id={titleId}
              style={{
                margin: "0 0 10px",
                textAlign: "center",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                opacity: 0.9,
              }}
            >
              Admin preview — click outside or press Esc to close
            </p>
            <PopupCard {...shared} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function modeChip(active: boolean): CSSProperties {
  return {
    appearance: "none",
    border: active ? "1px solid #111" : "1px solid #ddd",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#333",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  };
}
