import type { CSSProperties } from "react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, Link, useLoaderData, useLocation, useNavigation } from "react-router";
import { SectionCard } from "../components/common/SectionCard";
import { PageHeader } from "../components/layout/PageHeader";
import { PrimaryButton } from "../components/common/PrimaryButton";
import { MerchantNoticeBanner } from "../components/ui/MerchantNoticeBanner";
import { PageStack, SectionLabel } from "../components/ui/PageStack";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticateAdmin(request);
  const settings = await getSettings(session.shop, await getShopCurrencyCode(admin));
  return { settings };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticateAdmin(request);
  const formData = await request.formData();

  await updateSettings(session.shop, {
    defaultThreshold: String(formData.get("defaultThreshold") || "999"),
    currencyCode: await getShopCurrencyCode(admin),
    defaultWidgetTemplate: String(formData.get("defaultWidgetTemplate") || "Premium"),
    primaryColor: String(formData.get("primaryColor") || "#4b7d63"),
    backgroundColor: String(formData.get("backgroundColor") || "#f8fafc"),
    textColor: String(formData.get("textColor") || "#111827"),
    autoAddGift: formData.get("autoAddGift") === "on",
  });

  return redirectWithNotice("/app/settings", request, "settings_saved");
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();
  const [colors, setColors] = useState({primaryColor: settings.primaryColor, backgroundColor: settings.backgroundColor, textColor: settings.textColor});
  const location = useLocation();
  const navigation = useNavigation();
  const saving = navigation.state === "submitting";

  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <PageHeader
          title="Settings"
          subtitle="Default campaign settings and storefront colors."
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
              <SectionLabel title="Campaign defaults" description="Starting values for new campaigns." />
              <SectionCard large>
                <div className="fgpb-settings-fields">
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Default threshold</span>
                    <span style={helpStyle}>Cart amount required before the gift unlocks.</span>
                    <input
                      className="fgpb-input"
                      type="number"
                      step="any"
                      name="defaultThreshold"
                      defaultValue={settings.defaultThreshold}
                      style={inputStyle}
                      min={0}
                    />
                  </label>
                  <label style={fieldStyle}>
                    <span style={labelStyle}>Default widget template</span>

                    <input
                      className="fgpb-input"
                      type="text"
                      name="defaultWidgetTemplate"
                      defaultValue={settings.defaultWidgetTemplate}
                      style={inputStyle}
                    />
                  </label>
                </div>
              </SectionCard>
            </section>

            <section>
              <SectionLabel title="Widget colors" description="Default colors for the progress bar." />
              <SectionCard large>
                <div className="fgpb-settings-colors">
                  {[
                    { name: "primaryColor", label: "Primary", value: colors.primaryColor },
                    { name: "backgroundColor", label: "Background", value: colors.backgroundColor },
                    { name: "textColor", label: "Text", value: colors.textColor },
                  ].map((item) => (
                    <label key={item.name} style={colorFieldStyle}>
                      <span style={labelStyle}>{item.label}</span>
                      <div style={colorRowStyle}>
                        <input
                          type="color"
                          name={item.name}
                          value={item.value}
                          onChange={(event) => setColors(prev => ({...prev, [item.name]: event.target.value}))}
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
              </SectionCard>
            </section>

            <section>
              <SectionLabel title="Gift automation" description="Control how gifts are added to the cart." />
              <SectionCard large>
                <label style={switchRowStyle}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 15 }}>Auto-add gift</p>
                    <p style={{ margin: "6px 0 0", fontSize: 13, color: color.textSecondary, maxWidth: 420 }}>
                      Automatically add the free gift when the cart reaches the threshold.
                    </p>
                  </div>
                  <input
                    className="fgpb-switch"
                    type="checkbox"
                    name="autoAddGift"
                    defaultChecked={settings.autoAddGift}
                    aria-label="Automatically add gift to cart when threshold is met"
                  />
                </label>
              </SectionCard>
            </section>


          </PageStack>
        </Form>
        <div className="ut-page-footer"><Link className="fgpb-text-link" to={{pathname:"/app/widgets",search:location.search}}>Theme setup</Link><Link className="fgpb-text-link" to={{pathname:"/app/help/accelerated-checkout",search:location.search}}>Checkout compatibility</Link></div>
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
