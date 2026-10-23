import type { DiagnosticCheck, DiagnosticCheckStatus } from "./compatibility-diagnostics";
import { EMBED_STATUS_COPY, type EmbedCheckState } from "./published-theme-embed";

export const EMPTY_METRIC_VALUE = "—";
export const EMPTY_METRIC_CAPTION = "No activity yet";

export type OverviewHealthTone = "ready" | "attention" | "problem" | "unknown";

export type OverviewHealthItem = {
  id: string;
  title: string;
  tone: OverviewHealthTone;
  statusLabel: string;
  detail: string;
  blurb: string;
  actionLabel: string | null;
  actionTo: string | null;
};

export type OverviewMetricDisplay = {
  value: string;
  empty: boolean;
  caption: string | null;
};

export type LaunchStepId = "campaign" | "embed" | "storefront";

export type LaunchStep = {
  id: LaunchStepId;
  title: string;
  detail: string;
  href: string;
  external?: boolean;
};

const HEALTH_TITLES: Record<string, string> = {
  campaign_readiness: "Campaign",
  discount_function_readiness: "Shopify Function",
  app_proxy: "App Proxy",
  theme_app_embed: "Theme Embed",
};

export function hasStorefrontPerformance(input: {
  giftsUnlocked: number;
  giftsAdded: number;
  influencedOrders: number;
  revenueGenerated: number;
}): boolean {
  return (
    input.giftsUnlocked > 0 ||
    input.giftsAdded > 0 ||
    input.influencedOrders > 0 ||
    input.revenueGenerated > 0
  );
}

export function formatCountableMetric(count: number, hasEvents: boolean): OverviewMetricDisplay {
  if (!hasEvents) {
    return { value: EMPTY_METRIC_VALUE, empty: true, caption: EMPTY_METRIC_CAPTION };
  }
  return { value: String(count), empty: false, caption: null };
}

export function formatRevenueMetric(
  revenueGenerated: number,
  hasEvents: boolean,
  formatMoney: (amount: number) => string,
): OverviewMetricDisplay {
  if (!hasEvents) {
    return { value: EMPTY_METRIC_VALUE, empty: true, caption: EMPTY_METRIC_CAPTION };
  }
  return { value: formatMoney(revenueGenerated), empty: false, caption: null };
}

/**
 * Gift add rate from real storefront events: gifts added ÷ gifts unlocked.
 * Returns null when there are no unlocks to compute against.
 */
export function giftConversionPercent(giftsUnlocked: number, giftsAdded: number): number | null {
  if (!Number.isFinite(giftsUnlocked) || giftsUnlocked <= 0) return null;
  const added = Number.isFinite(giftsAdded) && giftsAdded > 0 ? giftsAdded : 0;
  return Math.round((added / giftsUnlocked) * 100);
}

export function formatConversionMetric(
  giftsUnlocked: number,
  giftsAdded: number,
): OverviewMetricDisplay {
  const percent = giftConversionPercent(giftsUnlocked, giftsAdded);
  if (percent == null) {
    return { value: EMPTY_METRIC_VALUE, empty: true, caption: EMPTY_METRIC_CAPTION };
  }
  return { value: `${percent}%`, empty: false, caption: null };
}

export function diagnosticTone(status: DiagnosticCheckStatus): OverviewHealthTone {
  switch (status) {
    case "pass":
      return "ready";
    case "warn":
      return "attention";
    case "fail":
      return "problem";
    default:
      return "unknown";
  }
}

export function statusLabelForTone(tone: OverviewHealthTone): string {
  switch (tone) {
    case "ready":
      return "Ready";
    case "attention":
      return "Needs attention";
    case "problem":
      return "Action needed";
    case "unknown":
      return "Not verified";
  }
}

function byId(checks: readonly DiagnosticCheck[], id: string): DiagnosticCheck | undefined {
  return checks.find((check) => check.id === id);
}

function actionForCheck(id: string, tone: OverviewHealthTone): { label: string; to: string } | null {
  if (tone === "ready") return null;
  switch (id) {
    case "campaign_readiness":
      return { label: "Fix campaign", to: "/app/campaigns" };
    case "discount_function_readiness":
      return { label: "Fix campaign", to: "/app/campaigns" };
    case "app_proxy":
      return { label: "View diagnostics", to: "/app/compatibility" };
    case "theme_app_embed":
      return { label: "Complete setup", to: "/app/widgets" };
    default:
      return { label: "Open Help", to: "/app/help" };
  }
}

function fromCheck(
  check: DiagnosticCheck,
  title: string,
  toneOverride?: OverviewHealthTone,
  detailOverride?: string,
): OverviewHealthItem {
  const tone = toneOverride ?? diagnosticTone(check.status);
  const action = actionForCheck(check.id, tone);
  return {
    id: check.id,
    title,
    tone,
    statusLabel: statusLabelForTone(tone),
    detail: detailOverride ?? check.explanation,
    blurb: "",
    actionLabel: action?.label ?? null,
    actionTo: action?.to ?? null,
  };
}

function themeEmbedHealth(
  theme: DiagnosticCheck | undefined,
): OverviewHealthItem {
  const fallback: DiagnosticCheck = theme ?? {
    id: "theme_app_embed",
    label: "Theme app embed",
    status: "unable_to_verify",
    explanation: "Theme embed status is unavailable.",
    merchantAction: "Open Theme setup and enable UpsellTrix on the theme you are testing.",
    technicalDetails: null,
  };

  return fromCheck(fallback, HEALTH_TITLES.theme_app_embed, "unknown",
    "Published-theme activation must be checked in Shopify. Storefront activity does not establish activation.");
}

export function buildOverviewHealth(checks: readonly DiagnosticCheck[]): OverviewHealthItem[] {
  const campaign = byId(checks, "campaign_readiness");
  const discountFn = byId(checks, "discount_function_readiness");
  const proxy = byId(checks, "app_proxy");
  const theme = byId(checks, "theme_app_embed");

  const items: OverviewHealthItem[] = [];

  if (campaign) {
    const item = fromCheck(campaign, HEALTH_TITLES.campaign_readiness);
    if (item.tone !== "ready" && campaign.status === "warn" && /no active campaign/i.test(campaign.explanation)) {
      items.push({
        ...item,
        actionLabel: "Complete setup",
        actionTo: "/app/campaigns/new",
      });
    } else {
      items.push(item);
    }
  }

  if (discountFn) items.push(fromCheck(discountFn, HEALTH_TITLES.discount_function_readiness));
  if (proxy) items.push(fromCheck(proxy, HEALTH_TITLES.app_proxy));
  items.push(themeEmbedHealth(theme));

  return items.map((item) => ({
    ...item,
    blurb: merchantHealthBlurb(item.id, item.tone, item.detail),
  }));
}

export function merchantHealthBlurb(
  id: string,
  tone: OverviewHealthTone,
  explanation: string,
): string {
  if (id === "campaign_readiness") {
    if (tone === "ready") return "An active campaign is configured.";
    if (/no active campaign/i.test(explanation)) return "No campaign is live yet.";
    if (tone === "problem") return "The live campaign needs a gift or threshold.";
    return "Campaign setup still needs attention.";
  }
  if (id === "discount_function_readiness") {
    if (tone === "ready") return "Gift discounts can sync at checkout.";
    if (tone === "problem") return "Gift discounts are not syncing.";
    return "Discount sync is still finishing.";
  }
  if (id === "app_proxy") {
    if (tone === "ready") return "Storefront proxy is configured.";
    return "The storefront proxy needs a check.";
  }
  if (id === "theme_app_embed") {
    if (tone === "ready") return "Enabled on the published theme.";
    if (tone === "attention") return "Enable the theme embed and preview a cart.";
    return "Theme embed is not verified yet.";
  }
  return "Needs a closer look.";
}

export type OverviewHealthSummary = {
  tone: OverviewHealthTone;
  statusLabel: string;
  headline: string;
  actionLabel: string | null;
  actionTo: string | null;
  items: OverviewHealthItem[];
};

export function summarizeOverviewHealth(items: OverviewHealthItem[]): OverviewHealthSummary {
  const tone: OverviewHealthTone = items.some((item) => item.tone === "problem")
    ? "problem"
    : items.some((item) => item.tone === "attention")
      ? "attention"
      : items.some((item) => item.tone === "unknown")
        ? "unknown"
        : "ready";

  const recommended =
    items.find((item) => item.tone === "problem" && item.actionTo) ??
    items.find((item) => item.tone === "attention" && item.actionTo) ??
    items.find((item) => item.tone !== "ready" && item.actionTo) ??
    null;

  const headline =
    tone === "ready"
      ? "Promotions look ready to run."
      : tone === "problem"
        ? "Something needs to be fixed before gifts run reliably."
        : tone === "attention"
          ? "A few setup items still need attention."
          : "Some checks could not be verified yet.";

  return {
    tone,
    statusLabel: statusLabelForTone(tone),
    headline,
    actionLabel: recommended?.actionLabel ?? null,
    actionTo: recommended?.actionTo ?? null,
    items,
  };
}

/** Overlay current Shopify evidence and recalculate overall readiness. */
export function withPublishedThemeEmbedStatus(
  summary: OverviewHealthSummary,
  status: EmbedCheckState,
): OverviewHealthSummary {
  const tone: OverviewHealthTone = status === "active" ? "ready"
    : status === "available" ? "attention"
    : status === "missing" || status === "unavailable" ? "problem" : "unknown";
  const item: OverviewHealthItem = {
    id: "theme_app_embed", title: HEALTH_TITLES.theme_app_embed,
    tone, statusLabel: status === "checking" ? "Checking" : statusLabelForTone(tone),
    detail: EMBED_STATUS_COPY[status], blurb: EMBED_STATUS_COPY[status],
    actionLabel: status === "active" ? null : "Check theme setup",
    actionTo: status === "active" ? null : "/app/widgets",
  };
  const items = summary.items.filter((existing) => existing.id !== "theme_app_embed");
  return summarizeOverviewHealth([...items, item]);
}

export function isThemeEmbedReady(items: readonly OverviewHealthItem[]): boolean {
  return items.some((item) => item.id === "theme_app_embed" && item.tone === "ready");
}

export function overviewStatusSentence(input: {
  activeCampaigns: number;
  totalCampaigns: number;
  giftsClaimed: number;
  hasEvents: boolean;
  healthTone: OverviewHealthTone;
}): string {
  const { activeCampaigns, totalCampaigns, giftsClaimed, hasEvents, healthTone } = input;

  if (totalCampaigns === 0) {
    return "No promotions yet. Create a free-gift campaign to start.";
  }

  if (healthTone === "problem") {
    if (activeCampaigns === 1) {
      return "1 campaign is live, but something needs a fix before gifts run reliably.";
    }
    if (activeCampaigns > 1) {
      return `${activeCampaigns} campaigns are live, but something needs a fix before gifts run reliably.`;
    }
    return "A campaign needs a fix before gifts can run.";
  }

  if (activeCampaigns === 0) {
    return totalCampaigns === 1
      ? "1 campaign is saved, but none are live yet."
      : `${totalCampaigns} campaigns are saved, but none are live yet.`;
  }

  const liveLabel = activeCampaigns === 1 ? "1 live campaign" : `${activeCampaigns} live campaigns`;

  if (hasEvents) {
    const giftLabel = giftsClaimed === 1 ? "1 gift" : `${giftsClaimed} gifts`;
    return `${liveLabel}. Shoppers have claimed ${giftLabel}.`;
  }

  if (healthTone === "attention" || healthTone === "unknown") {
    return `${liveLabel}. Storefront setup still needs a check.`;
  }

  return `${liveLabel}. Gift claims will appear after storefront activity.`;
}

export function incompleteLaunchSteps(input: {
  totalCampaigns: number;
  activeCampaigns: number;
  themeReady: boolean;
  storePreviewHref: string;
}): LaunchStep[] {
  const steps: LaunchStep[] = [];

  if (input.activeCampaigns === 0) {
    steps.push({
      id: "campaign",
      title: "Create a supported free-gift campaign",
      detail:
        input.totalCampaigns === 0
          ? "Choose Spend X → Free Gift or Tiered Free Gifts, then save and activate."
          : "Activate a Spend X → Free Gift or Tiered Free Gifts campaign.",
      href: input.totalCampaigns === 0 ? "/app/campaigns/new" : "/app/campaigns",
    });
  }

  if (!input.themeReady) {
    steps.push({
      id: "embed",
      title: "Enable the theme app embed",
      detail: "Turn it on for the theme you are testing, then save.",
      href: "/app/widgets",
    });
    steps.push({
      id: "storefront",
      title: "Test the storefront",
      detail: "Add a product to the cart and confirm the progress bar appears.",
      href: input.storePreviewHref,
      external: true,
    });
  }

  return steps;
}

export function overviewSecondaryAction(input: {
  totalCampaigns: number;
  themeReady: boolean;
}): { label: string; to: string } | null {
  if (input.totalCampaigns > 0 && !input.themeReady) {
    return { label: "Open Theme setup", to: "/app/widgets" };
  }
  return null;
}

export function healthFocusItemId(summary: OverviewHealthSummary): string | null {
  if (!summary.actionTo) return null;
  const recommended =
    summary.items.find((item) => item.tone === "problem" && item.actionTo === summary.actionTo) ??
    summary.items.find((item) => item.tone === "attention" && item.actionTo === summary.actionTo) ??
    summary.items.find((item) => item.actionTo === summary.actionTo);
  return recommended?.id ?? null;
}
