import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useLocation, useNavigation } from "react-router";
import { WidgetLivePreview } from "../components/campaigns/WidgetLivePreview";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { MerchantNoticeBanner } from "../components/ui/MerchantNoticeBanner";
import { PageStack, SectionLabel } from "../components/ui/PageStack";
import { formatAdminMoney } from "../lib/admin-money";
import { TEMPLATE_OPTIONS, normalizeHexColor } from "../lib/campaign-ui";
import { redirectWithNotice } from "../lib/merchant-notices";
import { authenticateAdmin } from "../shopify.server";
import { getSettings, updateSettings } from "../services/settings.server";
import { getShopCurrencyCode } from "../services/shopify-admin.server";
import {
  color,
  containerStyle,
  inputStyle,
  labelStyle,
  pageStyle,
} from "../styles/tokens";

const COLOR_PRESETS = [
  { id: "forest", label: "Forest", primaryColor: "#4b7d63", backgroundColor: "#f8fafc", textColor: "#111827" },
  { id: "ink", label: "Ink", primaryColor: "#111111", backgroundColor: "#fafafa", textColor: "#111111" },
  { id: "coral", label: "Coral", primaryColor: "#c45c4a", backgroundColor: "#fff8f6", textColor: "#1f1310" },
  { id: "ocean", label: "Ocean", primaryColor: "#2f6fed", backgroundColor: "#f5f8ff", textColor: "#0f172a" },
] as const;

function isTemplateOption(value: string): value is (typeof TEMPLATE_OPTIONS)[number] {
  return (TEMPLATE_OPTIONS as readonly string[]).includes(value);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticateAdmin(request);
  const currencyCode = await getShopCurrencyCode(admin);
  const settings = await getSettings(session.shop, currencyCode);
  return { settings, currencyCode };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticateAdmin(request);
  const formData = await request.formData();
  const currencyCode = await getShopCurrencyCode(admin);
  const templateRaw = String(formData.get("defaultWidgetTemplate") || "Premium").trim();
  const defaultWidgetTemplate = isTemplateOption(templateRaw) ? templateRaw : "Premium";

  try {
    await updateSettings(session.shop, {
      defaultThreshold: String(formData.get("defaultThreshold") || "999"),
      currencyCode,
      defaultWidgetTemplate,
      primaryColor: normalizeHexColor(formData.get("primaryColor"), "#4b7d63"),
      backgroundColor: normalizeHexColor(formData.get("backgroundColor"), "#f8fafc"),
      textColor: normalizeHexColor(formData.get("textColor"), "#111827"),
      autoAddGift: formData.get("autoAddGift") === "on",
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save settings.",
    };
  }

  return redirectWithNotice("/app/settings", request, "settings_saved");
};

export default function SettingsPage() {
  const { settings, currencyCode } = useLoaderData<typeof loader>();
  const [colors, setColors] = useState({
    primaryColor: normalizeHexColor(settings.primaryColor, "#4b7d63"),
    backgroundColor: normalizeHexColor(settings.backgroundColor, "#f8fafc"),
    textColor: normalizeHexColor(settings.textColor, "#111827"),
  });
  const [template, setTemplate] = useState(
    isTemplateOption(settings.defaultWidgetTemplate)
      ? settings.defaultWidgetTemplate
      : "Premium",
  );
  const [threshold, setThreshold] = useState(String(settings.defaultThreshold));
  const [autoAddGift, setAutoAddGift] = useState(settings.autoAddGift);
  const location = useLocation();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  const thresholdPreview = useMemo(() => {
    const amount = Number(threshold);
    if (!Number.isFinite(amount) || amount < 0) return formatAdminMoney(0, currencyCode);
    return formatAdminMoney(amount, currencyCode);
  }, [threshold, currencyCode]);

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <PageHeader
          title="Settings"
          subtitle="Store defaults for new campaigns and how gifts are added at checkout."
          actions={
            <PrimaryButton
              type="submit"
              form="fgpb-settings-form"
              disabled={saving}
              loading={saving}
            >
              {saving ? "Saving…" : "Save changes"}
            </PrimaryButton>
          }
        />

        <MerchantNoticeBanner />

        <Form id="fgpb-settings-form" method="post">
          <PageStack gap={24} className="ut-settings-layout">
            <section>
              <SectionLabel
                title="Storefront gift rules"
                description="These apply to every active campaign on this store."
              />
              <SectionCard large>
                <label style={switchRowStyle}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>Auto-add free gift</p>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: color.textSecondary, maxWidth: 480 }}>
                      When the cart reaches the campaign threshold, add the gift automatically.
                      Turn this off if you want shoppers to claim the gift themselves.
                    </p>
                  </div>
                  <input
                    className="fgpb-switch"
                    type="checkbox"
                    name="autoAddGift"
                    checked={autoAddGift}
                    onChange={(event) => setAutoAddGift(event.target.checked)}
                    aria-label="Automatically add gift to cart when threshold is met"
                  />
                </label>
                <div style={calloutStyle}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Only one campaign runs at a time</p>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: color.textSecondary }}>
                    Activating a campaign pauses any other active campaign. Manage offers on the
                    Campaigns page.
                  </p>
                  <Link
                    className="fgpb-text-link"
                    to={{ pathname: "/app/campaigns", search: location.search }}
                    style={{ marginTop: 10, display: "inline-block" }}
                  >
                    Open campaigns
                  </Link>
                </div>
              </SectionCard>
            </section>

            <section>
              <SectionLabel
                title="New campaign defaults"
                description="Used only when you create a campaign. Existing campaigns keep their own design."
              />
              <SectionCard large>
                <div className="fgpb-settings-fields">
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Default spend threshold</span>
                    <span style={helpStyle}>
                      Starting cart goal for new Spend X → Free Gift campaigns ({currencyCode}).
                    </span>
                    <div style={thresholdRowStyle}>
                      <input
                        className="fgpb-input"
                        type="number"
                        step="any"
                        name="defaultThreshold"
                        value={threshold}
                        onChange={(event) => setThreshold(event.target.value)}
                        style={inputStyle}
                        min={0}
                      />
                      <span style={thresholdHintStyle}>{thresholdPreview}</span>
                    </div>
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Default widget style</span>
                    <span style={helpStyle}>Layout used for new campaign previews and storefront cards.</span>
                    <select
                      className="fgpb-input"
                      name="defaultWidgetTemplate"
                      value={template}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (isTemplateOption(next)) setTemplate(next);
                      }}
                      style={inputStyle}
                    >
                      {TEMPLATE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </SectionCard>
            </section>

            <section>
              <SectionLabel
                title="Default look"
                description="Colors for new campaigns. Change a live campaign from its editor."
              />
              <SectionCard large>
                <div style={{ display: "grid", gap: 16 }}>
                  <div>
                    <p style={{ ...labelStyle, marginBottom: 8 }}>Quick palettes</p>
                    <div style={presetRowStyle}>
                      {COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          style={presetButtonStyle}
                          onClick={() =>
                            setColors({
                              primaryColor: preset.primaryColor,
                              backgroundColor: preset.backgroundColor,
                              textColor: preset.textColor,
                            })
                          }
                        >
                          <span
                            style={{
                              ...presetSwatchStyle,
                              background: `linear-gradient(135deg, ${preset.primaryColor} 0 40%, ${preset.backgroundColor} 40% 70%, ${preset.textColor} 70% 100%)`,
                            }}
                          />
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="fgpb-settings-colors">
                    {[
                      { name: "primaryColor", label: "Progress bar", value: colors.primaryColor },
                      { name: "backgroundColor", label: "Card background", value: colors.backgroundColor },
                      { name: "textColor", label: "Text", value: colors.textColor },
                    ].map((item) => (
                      <label key={item.name} style={colorFieldStyle}>
                        <span style={labelStyle}>{item.label}</span>
                        <div style={colorRowStyle}>
                          <input
                            type="color"
                            name={item.name}
                            value={item.value}
                            onChange={(event) =>
                              setColors((prev) => ({ ...prev, [item.name]: event.target.value }))
                            }
                            style={colorInputStyle}
                            aria-label={`${item.label} color`}
                          />
                          <span style={{ fontSize: 13, color: color.textMuted, fontFamily: "ui-monospace, monospace" }}>
                            {item.value}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>

                  <div style={previewWrapStyle}>
                    <p style={{ ...labelStyle, marginBottom: 10 }}>Preview</p>
                    <WidgetLivePreview
                      heading={`You are ${thresholdPreview} away from your free gift`}
                      description="Add more to your cart to unlock your gift."
                      template={template}
                      barColor={colors.primaryColor}
                      backgroundColor={colors.backgroundColor}
                      textColor={colors.textColor}
                      borderRadius={16}
                      progressHeight={12}
                      buttonText="Continue shopping"
                      progressPercent={62}
                      remainingLabel={`${thresholdPreview} remaining`}
                      giftTitle="Sample gift"
                    />
                  </div>
                </div>
              </SectionCard>
            </section>

            <section>
              <SectionLabel title="Store setup" description="Finish storefront setup so gifts can appear." />
              <SectionCard large>
                <div style={{ display: "grid", gap: 12 }}>
                  <Link className="fgpb-btn fgpb-btn--secondary" to={{ pathname: "/app/widgets", search: location.search }}>
                    Theme setup
                  </Link>
                  <Link
                    className="fgpb-btn fgpb-btn--secondary"
                    to={{ pathname: "/app/help/accelerated-checkout", search: location.search }}
                  >
                    Checkout compatibility
                  </Link>
                  <Link className="fgpb-btn fgpb-btn--secondary" to={{ pathname: "/app/compatibility", search: location.search }}>
                    Store health check
                  </Link>
                </div>
              </SectionCard>
            </section>
          </PageStack>
        </Form>
      </div>
    </main>
  );
}

const fieldStyle: CSSProperties = { display: "grid", gap: 8 };
const helpStyle: CSSProperties = { fontSize: 12, color: color.textMuted, fontWeight: 400 };
const colorFieldStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  padding: 16,
  borderRadius: 14,
  border: `1px solid ${color.border}`,
  background: color.bgMuted,
};
const colorRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const colorInputStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  border: `1px solid ${color.border}`,
  padding: 2,
  background: "#fff",
  cursor: "pointer",
};
const switchRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: 0,
};
const calloutStyle: CSSProperties = {
  marginTop: 20,
  padding: 16,
  borderRadius: 14,
  border: `1px solid ${color.border}`,
  background: color.bgMuted,
};
const thresholdRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
};
const thresholdHintStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: color.textSecondary,
  whiteSpace: "nowrap",
};
const presetRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};
const presetButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  height: 36,
  padding: "0 12px",
  borderRadius: 999,
  border: `1px solid ${color.border}`,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
};
const presetSwatchStyle: CSSProperties = {
  width: 18,
  height: 18,
  borderRadius: 999,
  border: `1px solid ${color.border}`,
};
const previewWrapStyle: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  border: `1px solid ${color.border}`,
  background: "#fff",
};
