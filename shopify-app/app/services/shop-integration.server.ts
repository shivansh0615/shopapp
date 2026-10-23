import db from "../db.server";

const RECENT_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type StorefrontIntegrationStatus = {
  shop: string;
  lastWidgetStateAt: string | null;
  /** True when widget-state was contacted recently (not proof the embed is enabled). */
  storefrontActivityDetected: boolean;
  /** Always true for this app: Theme API scopes are not requested. */
  embedVerificationUnavailable: true;
};

export async function touchWidgetStateSeen(shop: string): Promise<void> {
  const normalized = String(shop || "").trim();
  if (!normalized) return;
  const now = new Date();
  await db.shopIntegrationStatus.upsert({
    where: { shop: normalized },
    create: { shop: normalized, lastWidgetStateAt: now },
    update: { lastWidgetStateAt: now },
  });
}

export async function getStorefrontIntegrationStatus(
  shop: string,
): Promise<StorefrontIntegrationStatus> {
  const normalized = String(shop || "").trim();
  const row = normalized
    ? await db.shopIntegrationStatus.findUnique({ where: { shop: normalized } })
    : null;
  const last = row?.lastWidgetStateAt ?? null;
  const storefrontActivityDetected = Boolean(
    last && Date.now() - last.getTime() <= RECENT_MS,
  );
  return {
    shop: normalized,
    lastWidgetStateAt: last ? last.toISOString() : null,
    storefrontActivityDetected,
    embedVerificationUnavailable: true,
  };
}
