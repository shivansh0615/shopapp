/**
 * Compatibility diagnostics service — authenticated shop only.
 * No Shopify mutations. No cart mutations. No request-controlled shop param.
 */

import type { PrismaClient } from "@prisma/client";
import {
  APP_PROXY_BACKEND_PATH,
  APP_PROXY_STOREFRONT_PATH,
  APP_WEBHOOK_TOPICS,
  COMPLIANCE_WEBHOOK_TOPICS,
  EXPECTED_APP_SCOPES,
  type CompatibilityDiagnosticsReport,
  type DiagnosticCheck,
  aggregateOverallState,
  classifyStorefrontContact,
  missingScopes,
  redactTechnicalDetails,
} from "../lib/compatibility-diagnostics";
import { STOREFRONT_ASSET_MANIFEST } from "../lib/storefront-asset-manifest";
import {
  hasRequiredRuntimeConfig,
  withTimeout,
  READY_CHECK_TIMEOUT_MS,
} from "../lib/health.server";
import { buildThemeAppEmbedDeepLink } from "../lib/theme-embed-deeplink";
import { logOperationalError } from "../lib/errors.server";
import {
  isFreeGiftCampaignType,
  isTieredFreeGiftsCampaignType,
} from "./promotion-engine/campaign-types";

export type DiagnosticsSession = {
  shop: string;
  scope?: string | null;
  /** Present when a session row exists; never return the token. */
  hasAccessToken: boolean;
};

export type CompatibilityDiagnosticsDeps = {
  prisma: Pick<
    PrismaClient,
    | "$queryRaw"
    | "campaign"
    | "shopDiscount"
    | "discountSyncJob"
    | "shopIntegrationStatus"
    | "session"
  >;
  session: DiagnosticsSession;
  env?: NodeJS.ProcessEnv;
  nowMs?: number;
  pingTimeoutMs?: number;
};

function check(
  partial: Omit<DiagnosticCheck, "technicalDetails"> & {
    technicalDetails?: string | null;
  },
): DiagnosticCheck {
  return {
    ...partial,
    technicalDetails: redactTechnicalDetails(partial.technicalDetails ?? null),
  };
}

async function safeCheck(
  id: string,
  label: string,
  run: () => Promise<DiagnosticCheck>,
): Promise<DiagnosticCheck> {
  try {
    return await run();
  } catch (error) {
    logOperationalError("compatibility-diagnostics", error, { checkId: id });
    return check({
      id,
      label,
      status: "unable_to_verify",
      explanation: "This check failed unexpectedly. Other checks may still be valid.",
      merchantAction: "Refresh diagnostics. If the issue persists, contact support.",
      technicalDetails: error instanceof Error ? error.name : "unknown_error",
    });
  }
}

async function backendHealthCheck(
  deps: CompatibilityDiagnosticsDeps,
): Promise<DiagnosticCheck> {
  const env = deps.env ?? process.env;
  const configOk = hasRequiredRuntimeConfig(env);
  if (!configOk) {
    return check({
      id: "backend_health",
      label: "Backend health",
      status: "fail",
      explanation: "Required runtime configuration is incomplete on this host.",
      merchantAction:
        "Ask your developer or hosting provider to finish environment setup, then refresh.",
      technicalDetails: "configuration_incomplete",
    });
  }

  try {
    await withTimeout(
      Promise.resolve(deps.prisma.$queryRaw`SELECT 1`),
      deps.pingTimeoutMs ?? READY_CHECK_TIMEOUT_MS,
      new Error("timeout"),
    );
    return check({
      id: "backend_health",
      label: "Backend health",
      status: "pass",
      explanation:
        "Liveness and readiness signals are healthy: configuration is loaded and the database responds.",
      merchantAction: null,
      technicalDetails: "live=ok ready=ok database=ok",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.message === "timeout";
    return check({
      id: "backend_health",
      label: "Backend health",
      status: "fail",
      explanation: timedOut
        ? "The database did not respond in time."
        : "The database could not be reached.",
      merchantAction:
        "Wait a moment and refresh. If this continues, check Neon/Postgres status with your operator.",
      technicalDetails: timedOut ? "database_timeout" : "database_unreachable",
    });
  }
}

async function shopifyInstallationCheck(
  deps: CompatibilityDiagnosticsDeps,
): Promise<DiagnosticCheck> {
  const shop = String(deps.session.shop || "").trim();
  if (!shop) {
    return check({
      id: "shopify_installation",
      label: "Shopify installation",
      status: "fail",
      explanation: "No authenticated shop was available for this request.",
      merchantAction: "Re-open the app from Shopify admin.",
      technicalDetails: "missing_shop",
    });
  }

  const missing = missingScopes(deps.session.scope, EXPECTED_APP_SCOPES);
  if (!deps.session.hasAccessToken) {
    return check({
      id: "shopify_installation",
      label: "Shopify installation",
      status: "fail",
      explanation: "No offline session is stored for this shop.",
      merchantAction: "Reinstall or re-open the app to complete authentication.",
      technicalDetails: "session_missing",
    });
  }

  if (missing.length) {
    return check({
      id: "shopify_installation",
      label: "Shopify installation",
      status: "fail",
      explanation: "The app is missing one or more required Admin API scopes.",
      merchantAction: "Update app permissions when prompted, or reinstall the app.",
      technicalDetails: `missing_scopes=${missing.join(",")}`,
    });
  }

  return check({
    id: "shopify_installation",
    label: "Shopify installation",
    status: "pass",
    explanation:
      "Authenticated shop session is present with required scopes. Compliance and app webhooks are declared in app config.",
    merchantAction: null,
    technicalDetails: `webhooks=${[...APP_WEBHOOK_TOPICS, ...COMPLIANCE_WEBHOOK_TOPICS].join("|")}`,
  });
}

async function campaignReadinessCheck(
  deps: CompatibilityDiagnosticsDeps,
): Promise<DiagnosticCheck> {
  const shop = deps.session.shop;
  const active = await deps.prisma.campaign.findMany({
    where: { shop, status: "ACTIVE" },
    select: {
      id: true,
      campaignType: true,
      threshold: true,
      thresholdMinor: true,
      giftVariantId: true,
      status: true,
      rewardTiers: {
        select: { giftVariantId: true, threshold: true, thresholdMinor: true },
      },
    },
    orderBy: { id: "desc" },
    take: 20,
  });

  const supportedActive = active.filter((c) => {
    const t = String(c.campaignType || "");
    return isFreeGiftCampaignType(t) || isTieredFreeGiftsCampaignType(t);
  });

  const discount = await deps.prisma.shopDiscount.findUnique({
    where: { shop },
    select: {
      discountGid: true,
      syncStatus: true,
      lastSyncErrorCode: true,
      lastSyncedAt: true,
    },
  });

  const pendingJobs = await deps.prisma.discountSyncJob.count({
    where: {
      shop,
      status: { in: ["pending", "claimed"] },
    },
  });
  const failedJobs = await deps.prisma.discountSyncJob.count({
    where: { shop, status: "failed" },
  });
  const retryJobs = await deps.prisma.discountSyncJob.count({
    where: {
      shop,
      status: "pending",
      attemptCount: { gt: 0 },
    },
  });

  if (active.length === 0) {
    return check({
      id: "campaign_readiness",
      label: "Campaign readiness",
      status: "warn",
      explanation: "There is no active campaign for this shop yet.",
      merchantAction: "Create and activate a Classic Free Gift or Tiered Free Gifts campaign.",
      technicalDetails: `active=0 discountSync=${discount?.syncStatus ?? "none"} pendingJobs=${pendingJobs}`,
    });
  }

  if (supportedActive.length === 0) {
    return check({
      id: "campaign_readiness",
      label: "Campaign readiness",
      status: "fail",
      explanation: "Active campaigns exist, but none are a supported free-gift type.",
      merchantAction: "Activate a Spend X → Free Gift or Tiered Free Gifts campaign.",
      technicalDetails: `active=${active.length} supported=0`,
    });
  }

  const primary = supportedActive[0];
  const giftOk =
    Boolean(primary.giftVariantId && String(primary.giftVariantId).trim()) ||
    (primary.rewardTiers || []).some((t) => t.giftVariantId && String(t.giftVariantId).trim());

  if (!giftOk) {
    return check({
      id: "campaign_readiness",
      label: "Campaign readiness",
      status: "fail",
      explanation: "The active campaign is missing a gift variant.",
      merchantAction: "Edit the campaign and select a gift product variant.",
      technicalDetails: `campaignId=${primary.id}`,
    });
  }

  const thresholdOk =
    (primary.thresholdMinor != null && Number(primary.thresholdMinor) > 0) ||
    (typeof primary.threshold === "number" && primary.threshold > 0) ||
    (primary.rewardTiers || []).some(
      (t) =>
        (t.thresholdMinor != null && Number(t.thresholdMinor) > 0) ||
        (typeof t.threshold === "number" && t.threshold > 0),
    );

  if (!thresholdOk) {
    return check({
      id: "campaign_readiness",
      label: "Campaign readiness",
      status: "fail",
      explanation: "The active campaign threshold is missing or invalid.",
      merchantAction: "Set a positive spend threshold (and tiers, if applicable).",
      technicalDetails: `campaignId=${primary.id}`,
    });
  }

  if (!discount?.discountGid) {
    return check({
      id: "campaign_readiness",
      label: "Campaign readiness",
      status: "fail",
      explanation: "No automatic discount mapping is stored for this shop yet.",
      merchantAction:
        "Save or re-enable a campaign to queue discount sync, then wait for the worker.",
      technicalDetails: `pendingJobs=${pendingJobs} failedJobs=${failedJobs}`,
    });
  }

  if (failedJobs > 0 || discount.syncStatus === "failed") {
    return check({
      id: "campaign_readiness",
      label: "Campaign readiness",
      status: "warn",
      explanation: "Campaign data looks present, but discount sync has failures.",
      merchantAction:
        "Open campaign settings, save again, and allow the discount sync worker to retry.",
      technicalDetails: `syncStatus=${discount.syncStatus} failedJobs=${failedJobs} errorCode=${discount.lastSyncErrorCode ?? "none"}`,
    });
  }

  if (pendingJobs > 0 || discount.syncStatus === "pending" || discount.syncStatus === "retry_scheduled") {
    return check({
      id: "campaign_readiness",
      label: "Campaign readiness",
      status: "warn",
      explanation: "Campaign is configured; discount sync still has pending or retrying jobs.",
      merchantAction: "Wait for sync to finish, then refresh diagnostics.",
      technicalDetails: `syncStatus=${discount.syncStatus} pendingJobs=${pendingJobs} retryJobs=${retryJobs}`,
    });
  }

  return check({
    id: "campaign_readiness",
    label: "Campaign readiness",
    status: "pass",
    explanation: `Active supported campaign ready (count=${supportedActive.length}). Discount mapping present.`,
    merchantAction: null,
    technicalDetails: `type=${primary.campaignType} syncStatus=${discount.syncStatus} pendingJobs=${pendingJobs}`,
  });
}

async function storefrontCommunicationCheck(
  deps: CompatibilityDiagnosticsDeps,
): Promise<DiagnosticCheck> {
  const row = await deps.prisma.shopIntegrationStatus.findUnique({
    where: { shop: deps.session.shop },
    select: { lastWidgetStateAt: true },
  });
  const klass = classifyStorefrontContact(row?.lastWidgetStateAt ?? null, deps.nowMs);
  if (klass === "recent") {
    return check({
      id: "storefront_communication",
      label: "Storefront communication",
      status: "pass",
      explanation:
        "Recent storefront contact via widget-state. This does not definitively prove the live-theme embed is enabled.",
      merchantAction:
        "If customers still miss gifts, confirm the embed on the live theme (draft ≠ live).",
      technicalDetails: `contact=recent last=${row?.lastWidgetStateAt?.toISOString() ?? "null"}`,
    });
  }
  if (klass === "stale") {
    return check({
      id: "storefront_communication",
      label: "Storefront communication",
      status: "warn",
      explanation:
        "Storefront contact is stale. The embed may be off on the theme you are testing, or traffic is low.",
      merchantAction:
        "Enable the theme app embed on the intended theme, preview it, then refresh diagnostics.",
      technicalDetails: `contact=stale last=${row?.lastWidgetStateAt?.toISOString() ?? "null"}`,
    });
  }
  return check({
    id: "storefront_communication",
    label: "Storefront communication",
    status: "warn",
    explanation:
      "No storefront widget-state contact recorded yet. This does not definitively prove the live-theme embed state.",
    merchantAction:
      "Enable the theme app embed, open a product or cart page on that theme, then refresh.",
    technicalDetails: "contact=none",
  });
}

function themeEmbedGuidanceCheck(shop: string): DiagnosticCheck {
  let deepLink: string | null = null;
  try {
    deepLink = buildThemeAppEmbedDeepLink({
      shop,
      apiKey: process.env.SHOPIFY_API_KEY || "",
    });
  } catch {
    deepLink = null;
  }
  return check({
    id: "theme_app_embed",
    label: "Theme app embed",
    status: "unable_to_verify",
    explanation:
      "Unable to verify automatically. Theme API evidence is unavailable; draft-theme preview is separate from live-theme activation.",
    merchantAction: deepLink
      ? "Use Enable theme app embed, turn on UpsellTrix, save, and repeat per theme (including live)."
      : "Open Theme settings → App embeds and enable UpsellTrix on each theme you use.",
    technicalDetails: deepLink ? `deeplink_available=true` : "deeplink_unavailable",
  });
}

function appProxyCheck(): DiagnosticCheck {
  return check({
    id: "app_proxy",
    label: "App Proxy",
    status: "pass",
    explanation: `Storefront proxy path is ${APP_PROXY_STOREFRONT_PATH} (backend ${APP_PROXY_BACKEND_PATH}). Configuration is taken from app config — storefronts are not scraped.`,
    merchantAction:
      "If widget-state fails in the browser network tab, confirm the app is installed and the CLI/production proxy URL is current.",
    technicalDetails: `storefrontPath=${APP_PROXY_STOREFRONT_PATH}`,
  });
}

function storefrontCompatibilityModeCheck(): DiagnosticCheck {
  return check({
    id: "storefront_compatibility_mode",
    label: "Storefront compatibility mode",
    status: "info",
    explanation:
      "SERVER KNOWS (static): Core mode is verified on Dawn and Savor. Optional third-party cart compatibility (beta) can load adapters for KwikCart, #upc-cart, and limited cart-popup when enabled in the theme embed (default off). This admin check does not observe the live storefront — which adapter activated, confidence, refresh results, and failure codes are browser-only via window.__fgpbDrawerCompat.getStatus() when the optional asset is loaded. Unknown drawers may need custom integration. Kwik Checkout UI is not integrated. Accelerated checkout is not supported for Ajax gift insertion.",
    merchantAction:
      "Use standard Add to cart → cart/drawer → checkout. Leave optional compatibility off unless you have a supported third-party drawer. For runtime adapter status, inspect the storefront console (getStatus), not this server report.",
    technicalDetails: `adapters=${STOREFRONT_ASSET_MANIFEST.optionalAdapters.join(",")} defaultEnabled=${STOREFRONT_ASSET_MANIFEST.optionalCompatDefaultEnabled} runtimeEvidence=browser-only`,
  });
}

function storefrontAssetStateCheck(): DiagnosticCheck {
  const m = STOREFRONT_ASSET_MANIFEST;
  if (m.coreExceedsThemeCheckLimit) {
    return check({
      id: "storefront_asset_state",
      label: "Storefront asset state",
      status: "warn",
      explanation: `Theme Check warns that core app-block JS (${m.coreAppBlockJs}) is ${m.coreAppBlockJsBytes} B, above the ${m.themeCheckAppBlockJsLimitBytes} B guideline. Optional compat asset is separate (${m.optionalCompatJsBytes} B) and default-off. Core does not include third-party adapters.`,
      merchantAction: "No merchant action required. Developers track the Theme Check size warning separately.",
      technicalDetails: `coreBytes=${m.coreAppBlockJsBytes} compatBytes=${m.optionalCompatJsBytes} adaptersInCore=${m.coreIncludesThirdPartyAdapters}`,
    });
  }
  return check({
    id: "storefront_asset_state",
    label: "Storefront asset state",
    status: "pass",
    explanation: "Core app-block JavaScript is within the Theme Check size guideline.",
    merchantAction: null,
    technicalDetails: `coreBytes=${m.coreAppBlockJsBytes}`,
  });
}

async function discountFunctionReadinessCheck(
  deps: CompatibilityDiagnosticsDeps,
): Promise<DiagnosticCheck> {
  const shop = deps.session.shop;
  const discount = await deps.prisma.shopDiscount.findUnique({
    where: { shop },
    select: {
      discountGid: true,
      syncStatus: true,
      lastSyncErrorCode: true,
      lastSyncedAt: true,
    },
  });
  const pending = await deps.prisma.discountSyncJob.count({
    where: { shop, status: { in: ["pending", "claimed"] } },
  });
  const failed = await deps.prisma.discountSyncJob.count({
    where: { shop, status: "failed" },
  });

  if (!discount?.discountGid) {
    const active = await deps.prisma.campaign.findMany({
      where: { shop, status: "ACTIVE" },
      select: { id: true },
      take: 1,
    });
    const setupIncomplete = active.length === 0;
    return check({
      id: "discount_function_readiness",
      label: "Discount Function readiness",
      status: setupIncomplete ? "warn" : "fail",
      explanation: setupIncomplete
        ? "No discount mapping yet. That is expected until you activate a campaign."
        : "No shop discount GID/mapping is stored. Checkout free-gift targeting cannot sync.",
      merchantAction: setupIncomplete
        ? "Create and activate a campaign. Discount sync runs after you save it."
        : "Save an active campaign to enqueue discount provisioning (no Admin mutations are run from this page).",
      technicalDetails: `pending=${pending} failed=${failed} activeCampaigns=${active.length}`,
    });
  }

  if (failed > 0 || discount.syncStatus === "failed") {
    return check({
      id: "discount_function_readiness",
      label: "Discount Function readiness",
      status: "fail",
      explanation: "Discount sync is in a failed state.",
      merchantAction: "Retry by saving the campaign; operators can inspect the durable sync queue.",
      technicalDetails: `syncStatus=${discount.syncStatus} failed=${failed} code=${discount.lastSyncErrorCode ?? "none"}`,
    });
  }

  if (pending > 0 || discount.syncStatus === "pending" || discount.syncStatus === "retry_scheduled" || discount.syncStatus === "syncing") {
    return check({
      id: "discount_function_readiness",
      label: "Discount Function readiness",
      status: "warn",
      explanation: "Discount Function mapping exists; sync is pending or retrying.",
      merchantAction: "Wait for the worker, then refresh diagnostics.",
      technicalDetails: `syncStatus=${discount.syncStatus} pending=${pending}`,
    });
  }

  return check({
    id: "discount_function_readiness",
    label: "Discount Function readiness",
    status: "pass",
    explanation: "Discount mapping and sync status look healthy (read-only check; no Admin mutations).",
    merchantAction: null,
    technicalDetails: `syncStatus=${discount.syncStatus} lastSyncedAt=${discount.lastSyncedAt?.toISOString() ?? "null"}`,
  });
}

/**
 * Build a full diagnostics report for the authenticated shop only.
 */
export async function buildCompatibilityDiagnostics(
  deps: CompatibilityDiagnosticsDeps,
): Promise<CompatibilityDiagnosticsReport & { embedDeepLink: string | null }> {
  const shop = String(deps.session.shop || "").trim();

  const checks = await Promise.all([
    safeCheck("backend_health", "Backend health", () => backendHealthCheck(deps)),
    safeCheck("shopify_installation", "Shopify installation", () =>
      shopifyInstallationCheck(deps),
    ),
    safeCheck("campaign_readiness", "Campaign readiness", () =>
      campaignReadinessCheck(deps),
    ),
    safeCheck("storefront_communication", "Storefront communication", () =>
      storefrontCommunicationCheck(deps),
    ),
    safeCheck("theme_app_embed", "Theme app embed", async () =>
      themeEmbedGuidanceCheck(shop),
    ),
    safeCheck("app_proxy", "App Proxy", async () => appProxyCheck()),
    safeCheck("storefront_compatibility_mode", "Storefront compatibility mode", async () =>
      storefrontCompatibilityModeCheck(),
    ),
    safeCheck("storefront_asset_state", "Storefront asset state", async () =>
      storefrontAssetStateCheck(),
    ),
    safeCheck("discount_function_readiness", "Discount Function readiness", () =>
      discountFunctionReadinessCheck(deps),
    ),
  ]);

  const { overall, explanation } = aggregateOverallState(checks);

  let embedDeepLink: string | null = null;
  try {
    embedDeepLink = buildThemeAppEmbedDeepLink({
      shop,
      apiKey: process.env.SHOPIFY_API_KEY || "",
    });
  } catch {
    embedDeepLink = null;
  }

  // Attach deeplink into theme check merchant action already; also return for UI button.
  const themeIdx = checks.findIndex((c) => c.id === "theme_app_embed");
  if (themeIdx >= 0 && embedDeepLink) {
    checks[themeIdx] = {
      ...checks[themeIdx],
      technicalDetails: redactTechnicalDetails(
        `${checks[themeIdx].technicalDetails || ""};deeplink=available`,
      ),
    };
  }

  return {
    shop,
    generatedAt: new Date(deps.nowMs ?? Date.now()).toISOString(),
    overall,
    overallExplanation: explanation,
    checks,
    embedDeepLink,
  };
}
