import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCompatibilityDiagnostics } from "./compatibility-diagnostics.server";

type CampaignRow = {
  id: number;
  campaignType: string;
  threshold: number;
  thresholdMinor: bigint | null;
  giftVariantId: string | null;
  status: string;
  rewardTiers: Array<{
    giftVariantId: string;
    threshold: number;
    thresholdMinor: bigint | null;
  }>;
};

function createFakePrisma(opts: {
  campaigns?: CampaignRow[];
  discount?: {
    discountGid: string;
    syncStatus: string;
    lastSyncErrorCode: string | null;
    lastSyncedAt: Date | null;
  } | null;
  jobs?: Array<{ status: string; attemptCount: number; shop: string }>;
  integration?: { lastWidgetStateAt: Date | null } | null;
  otherShopCampaigns?: CampaignRow[];
  pingFail?: boolean;
  pingTimeout?: boolean;
}) {
  const shopCampaigns = opts.campaigns ?? [];
  const jobs = opts.jobs ?? [];
  return {
    async $queryRaw() {
      if (opts.pingTimeout) {
        await new Promise((r) => setTimeout(r, 50));
        return [{ ok: 1 }];
      }
      if (opts.pingFail) throw new Error("db down");
      return [{ ok: 1 }];
    },
    campaign: {
      findMany: async ({ where }: { where: { shop: string; status: string } }) => {
        assert.ok(where.shop, "shop filter required");
        // Simulate cross-shop: other shop data must never appear
        if (where.shop === "other.myshopify.com") return opts.otherShopCampaigns ?? [];
        return shopCampaigns.filter((c) => c.status === where.status);
      },
    },
    shopDiscount: {
      findUnique: async ({ where }: { where: { shop: string } }) => {
        assert.ok(where.shop);
        if (where.shop !== "demo.myshopify.com") return null;
        return opts.discount === undefined
          ? {
              discountGid: "gid://shopify/DiscountAutomaticNode/1",
              syncStatus: "active",
              lastSyncErrorCode: null,
              lastSyncedAt: new Date("2026-08-01T00:00:00.000Z"),
            }
          : opts.discount;
      },
    },
    discountSyncJob: {
      count: async ({
        where,
      }: {
        where: {
          shop: string;
          status?: string | { in: string[] };
          attemptCount?: { gt: number };
        };
      }) => {
        assert.equal(where.shop, "demo.myshopify.com");
        return jobs.filter((j) => {
          if (j.shop !== where.shop) return false;
          if (typeof where.status === "string") return j.status === where.status;
          if (where.status && "in" in where.status) {
            if (!where.status.in.includes(j.status)) return false;
          }
          if (where.attemptCount?.gt != null) {
            return j.attemptCount > where.attemptCount.gt;
          }
          return true;
        }).length;
      },
    },
    shopIntegrationStatus: {
      findUnique: async ({ where }: { where: { shop: string } }) => {
        assert.equal(where.shop, "demo.myshopify.com");
        return opts.integration === undefined
          ? { lastWidgetStateAt: new Date() }
          : opts.integration;
      },
    },
    session: {
      findFirst: async () => null,
    },
  };
}

const healthyCampaign: CampaignRow = {
  id: 1,
  campaignType: "Tiered Free Gifts",
  threshold: 1999,
  thresholdMinor: 199900n,
  giftVariantId: "gid://shopify/ProductVariant/1",
  status: "ACTIVE",
  rewardTiers: [
    {
      giftVariantId: "gid://shopify/ProductVariant/1",
      threshold: 1999,
      thresholdMinor: 199900n,
    },
  ],
};

const baseSession = {
  shop: "demo.myshopify.com",
  scope:
    "read_discounts,write_discounts,read_publications,read_products",
  hasAccessToken: true,
};

const baseEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgresql://fgpb:fgpb@127.0.0.1:5432/fgpb",
};

function byId(report: Awaited<ReturnType<typeof buildCompatibilityDiagnostics>>, id: string) {
  const c = report.checks.find((x) => x.id === id);
  assert.ok(c, `missing check ${id}`);
  return c;
}

describe("buildCompatibilityDiagnostics", () => {
  it("healthy server checks still require published-theme verification", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(report.shop, "demo.myshopify.com");
    assert.equal(byId(report, "backend_health").status, "pass");
    assert.equal(byId(report, "shopify_installation").status, "pass");
    assert.equal(byId(report, "campaign_readiness").status, "pass");
    assert.equal(byId(report, "theme_app_embed").status, "unable_to_verify");
    assert.match(byId(report, "theme_app_embed").explanation, /Unable to verify automatically/i);
    assert.equal(report.overall, "UNABLE_TO_VERIFY");
    assert.equal(JSON.stringify(report).includes("shpat_"), false);
    assert.equal(JSON.stringify(report).includes("accessToken"), false);
  });

  it("no active campaign → warn, not a red failure", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [] }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "campaign_readiness").status, "warn");
    assert.equal(report.overall, "UNABLE_TO_VERIFY");
  });

  it("active Spend X -> Free Gift campaign passes the supported-type check", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [{ ...healthyCampaign, campaignType: "Spend X -> Free Gift" }],
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    const readiness = byId(report, "campaign_readiness");
    assert.equal(readiness.status, "pass");
    assert.match(readiness.technicalDetails ?? "", /Spend X -> Free Gift/);
    assert.equal((readiness.merchantAction ?? "").includes("FREE_GIFT"), false);
  });

  it("active Tiered Free Gifts campaign passes the supported-type check", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "campaign_readiness").status, "pass");
  });

  it("percentage and fixed discount campaigns do not pass free-gift readiness", async () => {
    for (const campaignType of [
      "Spend X -> Percentage Discount",
      "Spend X -> Fixed Discount",
    ]) {
      const report = await buildCompatibilityDiagnostics({
        prisma: createFakePrisma({
          campaigns: [{ ...healthyCampaign, campaignType }],
        }) as never,
        session: baseSession,
        env: baseEnv,
      });
      const readiness = byId(report, "campaign_readiness");
      assert.equal(readiness.status, "fail", campaignType);
      assert.match(readiness.explanation, /none are a supported free-gift type/i);
      assert.equal(readiness.merchantAction, "Activate a Spend X → Free Gift or Tiered Free Gifts campaign.");
      assert.equal((readiness.merchantAction ?? "").includes("FREE_GIFT"), false);
    }
  });

  it("does not treat the FREE_GIFT registry key as a database campaign type", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [{ ...healthyCampaign, campaignType: "FREE_GIFT" }],
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    const readiness = byId(report, "campaign_readiness");
    assert.equal(readiness.status, "fail");
    assert.match(readiness.explanation, /none are a supported free-gift type/i);
    assert.equal((readiness.merchantAction ?? "").includes("FREE_GIFT"), false);
    assert.equal((readiness.technicalDetails ?? "").includes("FREE_GIFT"), false);
  });

  it("does not treat a fuzzy tiered name as a supported free-gift type", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [{ ...healthyCampaign, campaignType: "Custom Tiered Promo" }],
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "campaign_readiness").status, "fail");
  });

  it("lists the exact missing scopes in installation details", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: {
        shop: "demo.myshopify.com",
        scope: "read_products,read_discounts",
        hasAccessToken: true,
      },
      env: baseEnv,
    });
    const installation = byId(report, "shopify_installation");
    assert.equal(installation.status, "fail");
    assert.equal(installation.technicalDetails, "missing_scopes=write_discounts,read_publications");
    assert.match(installation.explanation, /missing one or more required Admin API scopes/i);
  });

  it("passes installation when write_discounts implies read_discounts", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: {
        shop: "demo.myshopify.com",
        scope: "write_discounts,read_publications,read_products",
        hasAccessToken: true,
      },
      env: baseEnv,
    });
    const installation = byId(report, "shopify_installation");
    assert.equal(installation.status, "pass");
    assert.equal((installation.technicalDetails ?? "").includes("missing_scopes"), false);
  });

  it("does not return tokens or secrets in diagnostics", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: {
        ...baseSession,
        scope: "read_discounts,write_discounts,read_publications,read_products",
      },
      env: {
        ...baseEnv,
        SHOPIFY_API_SECRET: "super-secret-value",
      },
    });
    const blob = JSON.stringify(report);
    assert.equal(blob.includes("accessToken"), false);
    assert.equal(blob.includes("shpat_"), false);
    assert.equal(blob.includes("super-secret-value"), false);
    assert.equal(blob.includes("SHOPIFY_API_SECRET"), false);
  });

  it("missing gift variant → fail campaign readiness", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [
          {
            ...healthyCampaign,
            giftVariantId: null,
            rewardTiers: [],
          },
        ],
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "campaign_readiness").status, "fail");
    assert.match(byId(report, "campaign_readiness").explanation, /gift variant/i);
  });

  it("stale / no storefront heartbeat", async () => {
    const none = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [healthyCampaign],
        integration: { lastWidgetStateAt: null },
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(none, "storefront_communication").status, "warn");
    assert.match(byId(none, "storefront_communication").explanation, /No storefront/i);

    const stale = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [healthyCampaign],
        integration: { lastWidgetStateAt: new Date("2020-01-01T00:00:00.000Z") },
      }) as never,
      session: baseSession,
      env: baseEnv,
      nowMs: Date.parse("2026-08-03T00:00:00.000Z"),
    });
    assert.equal(byId(stale, "storefront_communication").status, "warn");
    assert.match(byId(stale, "storefront_communication").explanation, /stale/i);
  });

  it("failed discount sync", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [healthyCampaign],
        discount: {
          discountGid: "gid://shopify/DiscountAutomaticNode/1",
          syncStatus: "failed",
          lastSyncErrorCode: "SHOPIFY_THROTTLED",
          lastSyncedAt: null,
        },
        jobs: [{ shop: "demo.myshopify.com", status: "failed", attemptCount: 8 }],
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "discount_function_readiness").status, "fail");
    assert.equal(byId(report, "campaign_readiness").status, "warn");
  });

  it("pending retry job", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [healthyCampaign],
        discount: {
          discountGid: "gid://shopify/DiscountAutomaticNode/1",
          syncStatus: "retry_scheduled",
          lastSyncErrorCode: null,
          lastSyncedAt: null,
        },
        jobs: [{ shop: "demo.myshopify.com", status: "pending", attemptCount: 2 }],
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "discount_function_readiness").status, "warn");
    assert.match(byId(report, "discount_function_readiness").explanation, /pending|retry/i);
  });

  it("missing discount mapping", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [healthyCampaign],
        discount: null,
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "campaign_readiness").status, "fail");
    assert.equal(byId(report, "discount_function_readiness").status, "fail");
  });

  it("no campaign and no discount mapping → warn, not fail", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({
        campaigns: [],
        discount: null,
      }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "discount_function_readiness").status, "warn");
    assert.equal(report.overall, "UNABLE_TO_VERIFY");
  });

  it("cross-shop isolation: queries use session shop only", async () => {
    const prisma = createFakePrisma({
      campaigns: [healthyCampaign],
      otherShopCampaigns: [
        {
          ...healthyCampaign,
          id: 99,
          giftVariantId: "gid://shopify/ProductVariant/OTHER",
        },
      ],
    });
    const report = await buildCompatibilityDiagnostics({
      prisma: prisma as never,
      session: baseSession,
      env: baseEnv,
    });
    // Technical details should not mention OTHER shop variant
    const blob = JSON.stringify(report);
    assert.equal(blob.includes("OTHER"), false);
    assert.equal(report.shop, "demo.myshopify.com");
  });

  it("database diagnostic failure", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ pingFail: true, campaigns: [healthyCampaign] }) as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "backend_health").status, "fail");
    assert.equal(report.overall, "ACTION_REQUIRED");
  });

  it("safe redaction in details", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: baseSession,
      env: baseEnv,
    });
    const blob = JSON.stringify(report);
    assert.equal(blob.includes("accessToken"), false);
    assert.equal(blob.includes("SHOPIFY_API_SECRET"), false);
  });

  it("accelerated-checkout limitation copy", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: baseSession,
      env: baseEnv,
    });
    const mode = byId(report, "storefront_compatibility_mode");
    assert.match(mode.explanation, /Accelerated checkout is not supported/i);
  });

  it("unknown drawer limitation copy", async () => {
    const report = await buildCompatibilityDiagnostics({
      prisma: createFakePrisma({ campaigns: [healthyCampaign] }) as never,
      session: baseSession,
      env: baseEnv,
    });
    const mode = byId(report, "storefront_compatibility_mode");
    assert.match(mode.explanation, /Unknown drawers may need custom integration/i);
    assert.match(mode.explanation, /upc-cart/i);
    assert.match(mode.explanation, /KwikCart/i);
    assert.match(mode.explanation, /Kwik Checkout UI is not integrated/i);
    assert.match(mode.explanation, /beta/i);
  });

  it("partial check failure does not crash the page", async () => {
    const prisma = createFakePrisma({ campaigns: [healthyCampaign] });
    (prisma as { campaign: { findMany: unknown } }).campaign.findMany = async () => {
      throw new Error("boom");
    };
    const report = await buildCompatibilityDiagnostics({
      prisma: prisma as never,
      session: baseSession,
      env: baseEnv,
    });
    assert.equal(byId(report, "campaign_readiness").status, "unable_to_verify");
    assert.ok(report.checks.length >= 8);
  });
});
