/**
 * Resolve the shop session used by compatibility diagnostics.
 * Prefers the canonical Shopify offline session. Never returns the token.
 */

export type DiagnosticSessionSnapshot = {
  shop: string;
  scope: string | null;
  hasAccessToken: boolean;
};

export type AuthenticatedShopifySession = {
  shop: string;
  scope?: string | null;
  accessToken?: string | null;
};

export type DiagnosticSessionStore = {
  session: {
    findUnique: (args: {
      where: { id: string };
      select: { shop: true; scope: true; accessToken: true };
    }) => Promise<{
      shop: string;
      scope: string | null;
      accessToken: string | null;
    } | null>;
  };
};

export function offlineSessionId(shop: string): string {
  return `offline_${shop}`;
}

function fromAuthenticated(authenticated: AuthenticatedShopifySession, shop: string): DiagnosticSessionSnapshot {
  return {
    shop,
    scope: authenticated.scope ?? null,
    hasAccessToken: Boolean(authenticated.accessToken),
  };
}

/**
 * Select diagnostic session fields for the authenticated shop only.
 * Does not delete or rewrite session rows.
 */
export async function resolveDiagnosticSession(input: {
  prisma: DiagnosticSessionStore;
  authenticated: AuthenticatedShopifySession;
}): Promise<DiagnosticSessionSnapshot> {
  const shop = String(input.authenticated.shop || "").trim();
  if (!shop) {
    return { shop: "", scope: null, hasAccessToken: false };
  }

  const offline = await input.prisma.session.findUnique({
    where: { id: offlineSessionId(shop) },
    select: { shop: true, scope: true, accessToken: true },
  });

  if (offline && offline.shop === shop) {
    return {
      shop,
      scope: offline.scope ?? null,
      hasAccessToken: Boolean(offline.accessToken),
    };
  }

  return fromAuthenticated(input.authenticated, shop);
}
