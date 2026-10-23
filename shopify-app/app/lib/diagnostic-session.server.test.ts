import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  offlineSessionId,
  resolveDiagnosticSession,
  type DiagnosticSessionSnapshot,
  type DiagnosticSessionStore,
} from "./diagnostic-session.server";

const SHOP = "demo.myshopify.com";
const FULL_SCOPES = "read_discounts,write_discounts,read_publications,read_products";
const STALE_SCOPES = "read_products";

type SessionRow = {
  id: string;
  shop: string;
  scope: string | null;
  accessToken: string | null;
};

function createStore(rows: SessionRow[]): DiagnosticSessionStore & { lookups: string[] } {
  const lookups: string[] = [];
  return {
    lookups,
    session: {
      findUnique: async ({ where }) => {
        lookups.push(where.id);
        const row = rows.find((candidate) => candidate.id === where.id) ?? null;
        if (!row) return null;
        return { shop: row.shop, scope: row.scope, accessToken: row.accessToken };
      },
    },
  };
}

function assertSnapshotShape(snapshot: DiagnosticSessionSnapshot) {
  assert.deepEqual(Object.keys(snapshot).sort(), ["hasAccessToken", "scope", "shop"]);
  assert.equal("accessToken" in snapshot, false);
}

describe("resolveDiagnosticSession", () => {
  it("prefers the canonical offline session over stale online/session rows", async () => {
    const store = createStore([
      {
        id: "aaa-online-older-looking",
        shop: SHOP,
        scope: STALE_SCOPES,
        accessToken: "shpat_staleOnlineToken",
      },
      {
        id: offlineSessionId(SHOP),
        shop: SHOP,
        scope: FULL_SCOPES,
        accessToken: "shpat_offlineToken",
      },
    ]);

    const snapshot = await resolveDiagnosticSession({
      prisma: store,
      authenticated: {
        shop: SHOP,
        scope: STALE_SCOPES,
        accessToken: "shpat_onlineRequestToken",
      },
    });

    assert.deepEqual(store.lookups, [offlineSessionId(SHOP)]);
    assert.equal(snapshot.shop, SHOP);
    assert.equal(snapshot.scope, FULL_SCOPES);
    assert.equal(snapshot.hasAccessToken, true);
    assertSnapshotShape(snapshot);
    assert.equal(JSON.stringify(snapshot).includes("shpat_"), false);
    assert.equal(JSON.stringify(snapshot).includes("offlineToken"), false);
  });

  it("uses the authenticated session when the offline row does not exist", async () => {
    const store = createStore([
      {
        id: "online_1",
        shop: SHOP,
        scope: STALE_SCOPES,
        accessToken: "shpat_otherRow",
      },
    ]);

    const snapshot = await resolveDiagnosticSession({
      prisma: store,
      authenticated: {
        shop: SHOP,
        scope: FULL_SCOPES,
        accessToken: "shpat_authenticatedToken",
      },
    });

    assert.deepEqual(store.lookups, [offlineSessionId(SHOP)]);
    assert.equal(snapshot.scope, FULL_SCOPES);
    assert.equal(snapshot.hasAccessToken, true);
    assertSnapshotShape(snapshot);
    assert.equal(JSON.stringify(snapshot).includes("shpat_authenticatedToken"), false);
    assert.equal(JSON.stringify(snapshot).includes("accessToken"), false);
  });

  it("ignores an offline id that belongs to a different shop", async () => {
    const store = createStore([
      {
        id: offlineSessionId(SHOP),
        shop: "other.myshopify.com",
        scope: STALE_SCOPES,
        accessToken: "shpat_otherShop",
      },
    ]);

    const snapshot = await resolveDiagnosticSession({
      prisma: store,
      authenticated: {
        shop: SHOP,
        scope: FULL_SCOPES,
        accessToken: "shpat_ok",
      },
    });

    assert.equal(snapshot.shop, SHOP);
    assert.equal(snapshot.scope, FULL_SCOPES);
    assert.equal(JSON.stringify(snapshot).includes("shpat_"), false);
  });
});
