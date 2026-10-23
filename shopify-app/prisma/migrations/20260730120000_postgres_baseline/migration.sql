-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN,
    "emailVerified" BOOLEAN,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "campaignType" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "giftProductId" TEXT NOT NULL,
    "giftProductTitle" TEXT,
    "giftProductImage" TEXT,
    "giftVariantId" TEXT,
    "giftQuantity" INTEGER NOT NULL,
    "discountPercentage" DOUBLE PRECISION,
    "fixedDiscountAmount" DOUBLE PRECISION,
    "placements" JSONB NOT NULL,
    "widgetSettings" JSONB,
    "status" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL DEFAULT 'SPEND_THRESHOLD',
    "triggerQuantity" INTEGER NOT NULL DEFAULT 1,
    "triggerProductIds" JSONB NOT NULL DEFAULT '[]',
    "triggerCollectionIds" JSONB NOT NULL DEFAULT '[]',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "allowCustomerChoice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftOption" (
    "id" SERIAL NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "productImage" TEXT,
    "variantId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GiftOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRewardTier" (
    "id" TEXT NOT NULL,
    "campaignId" INTEGER NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL,
    "giftProductId" TEXT,
    "giftProductTitle" TEXT,
    "giftProductImage" TEXT,
    "giftVariantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRewardTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" INTEGER,
    "eventType" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopDiscount" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "discountGid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "defaultThreshold" DOUBLE PRECISION NOT NULL DEFAULT 999,
    "defaultWidgetTemplate" TEXT NOT NULL DEFAULT 'Premium',
    "primaryColor" TEXT NOT NULL DEFAULT '#4b7d63',
    "backgroundColor" TEXT NOT NULL DEFAULT '#f8fafc',
    "textColor" TEXT NOT NULL DEFAULT '#111827',
    "autoAddGift" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopIntegrationStatus" (
    "shop" TEXT NOT NULL,
    "lastWidgetStateAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopIntegrationStatus_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE INDEX "Campaign_shop_createdAt_idx" ON "Campaign"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_shop_status_priority_idx" ON "Campaign"("shop", "status", "priority");

-- CreateIndex
CREATE INDEX "GiftOption_campaignId_idx" ON "GiftOption"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignRewardTier_campaignId_idx" ON "CampaignRewardTier"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRewardTier_campaignId_position_key" ON "CampaignRewardTier"("campaignId", "position");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_shop_createdAt_idx" ON "AnalyticsEvent"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_shop_eventType_idx" ON "AnalyticsEvent"("shop", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "ShopDiscount_shop_key" ON "ShopDiscount"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");

-- AddForeignKey
ALTER TABLE "GiftOption" ADD CONSTRAINT "GiftOption_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardTier" ADD CONSTRAINT "CampaignRewardTier_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
