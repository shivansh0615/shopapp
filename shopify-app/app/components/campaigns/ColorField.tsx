import type { CSSProperties } from "react";

const PRESETS = ["#111111", "#E11D48", "#16A34A", "#2563EB", "#D97706", "#7C3AED", "#FAFAFA"];

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  /** Hide the preset swatch row — use when many colors sit on one screen. */
  compact?: boolean;
};

export function ColorField({ label, value, onChange, compact = false }: ColorFieldProps) {
  const hex = /^#[0-9a-fA-F]{6}$/i.test(value) ? value.toUpperCase() : "#111111";

  return (
    <label style={compact ? compactLabelStyle : labelStyle}>
      <span style={compact ? compactLabelTextStyle : undefined}>{label}</span>
      <div style={compact ? compactRowStyle : rowStyle}>
        <div style={{ ...(compact ? compactSwatchStyle : swatchStyle), backgroundColor: hex }} title={hex} />
        {!compact ? (
          <div style={presetsStyle}>
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={preset}
                onClick={() => onChange(preset)}
                style={{
                  ...presetBtnStyle,
                  backgroundColor: preset,
                  outline:
                    hex.toLowerCase() === preset.toLowerCase() ? "2px solid #111" : "1px solid #E8E8E8",
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
        ) : null}
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
          style={compact ? compactNativeColorStyle : nativeColorStyle}
          title="Custom color"
        />
        {!compact ? <code style={hexLabelStyle}>{hex}</code> : null}
      </div>
    </label>
  );
}

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  fontSize: 13,
  color: "#111",
  fontWeight: 600,
};

const compactLabelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  color: "#444",
  fontWeight: 600,
};

const compactLabelTextStyle: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const compactRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const swatchStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 10,
  border: "1px solid #E8E8E8",
  flexShrink: 0,
};

const compactSwatchStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "1px solid #E8E8E8",
  flexShrink: 0,
};

const presetsStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  alignItems: "center",
};

const presetBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 8,
  border: "none",
  padding: 0,
  cursor: "pointer",
};

const nativeColorStyle: CSSProperties = {
  width: 36,
  height: 36,
  padding: 0,
  border: "1px solid #E8E8E8",
  borderRadius: 8,
  cursor: "pointer",
  background: "transparent",
};

const compactNativeColorStyle: CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  border: "1px solid #E8E8E8",
  borderRadius: 8,
  cursor: "pointer",
  background: "transparent",
};

const hexLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#666",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
};
