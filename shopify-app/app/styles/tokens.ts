import type { CSSProperties } from "react";

/** UpsellTrix admin tokens — Shopify-native structure + restrained brand. */

export const color = {
  bg: "#FFFFFF",
  bgMuted: "#F6F6F8",
  card: "#FFFFFF",
  border: "#E4E3E9",
  text: "#252329",
  textSecondary: "#68636F",
  textMuted: "#716B78",
  accent: "#6651D8",
  primary: "#6651D8",
  primaryHover: "#5240B4",
  primarySoft: "#F4F2FF",
  primaryBorder: "#E4E0FF",
  success: "#16A36A",
  successBg: "#E8F7EF",
  warning: "#D99000",
  warningBg: "#FFF6E5",
  danger: "#D83B3B",
  dangerBg: "#FDECEC",
  hover: "#F6F6F7",
  focus: "rgba(109, 93, 251, 0.28)",
} as const;

export const fonts = {
  body: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
} as const;

export const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 16,
} as const;

export const shadow = {
  card: "none",
  hover: "none",
} as const;

export const pageStyle: CSSProperties = {
  minHeight: "100%",
  padding: "28px clamp(16px, 3vw, 32px) 40px",
  background: color.bgMuted,
  fontFamily: fonts.body,
  color: color.text,
};

export const containerStyle: CSSProperties = {
  maxWidth: 1180,
  margin: "0 auto",
  width: "100%",
};

export const cardStyle: CSSProperties = {
  borderRadius: radius.lg,
  padding: 20,
  border: `1px solid ${color.border}`,
  background: color.card,
  boxShadow: "0 1px 2px rgba(25, 20, 40, 0.035)",
};

export const sectionCardStyle: CSSProperties = {
  ...cardStyle,
  padding: 24,
};

export const cardTitleStyle: CSSProperties = {
  margin: "0 0 20px",
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: "-0.01em",
  color: color.text,
};

export const heroTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: "clamp(28px, 3.5vw, 36px)",
  fontWeight: 700,
  letterSpacing: "-0.04em",
  lineHeight: 1.15,
  color: color.text,
};

export const heroSubtitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  lineHeight: 1.55,
  color: color.textSecondary,
  maxWidth: 520,
};

export const eyebrowStyle: CSSProperties = {
  margin: "0 0 10px",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: color.primaryHover,
};

export const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 40,
  padding: "0 16px",
  borderRadius: radius.md,
  border: "1px solid transparent",
  background: color.primary,
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 600,
  fontFamily: fonts.body,
  textDecoration: "none",
  cursor: "pointer",
  transition: "background 160ms ease",
};

export const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 40,
  padding: "0 16px",
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.text,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: fonts.body,
  textDecoration: "none",
  cursor: "pointer",
  transition: "background 160ms ease, border-color 160ms ease",
};

export const inputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  boxSizing: "border-box",
  padding: "0 14px",
  borderRadius: radius.md,
  border: `1px solid ${color.border}`,
  background: color.bg,
  color: color.text,
  fontSize: 14,
  fontFamily: fonts.body,
  outline: "none",
};

export const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 8,
  fontSize: 13,
  fontWeight: 600,
  color: color.text,
};

export const emptyStateBoxStyle: CSSProperties = {
  borderRadius: radius.lg,
  padding: "48px 32px",
  border: `1px dashed ${color.border}`,
  background: color.bgMuted,
  textAlign: "center",
};

export const emptyStateTitleStyle: CSSProperties = {
  margin: "0 0 8px",
  fontSize: 16,
  fontWeight: 600,
  color: color.text,
};

export const emptyStateTextStyle: CSSProperties = {
  margin: "0 auto",
  maxWidth: 360,
  fontSize: 14,
  lineHeight: 1.5,
  color: color.textSecondary,
};
