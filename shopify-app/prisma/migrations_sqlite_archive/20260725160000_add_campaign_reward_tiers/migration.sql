-- CreateTable
CREATE TABLE "CampaignRewardTier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" INTEGER NOT NULL,
    "threshold" REAL NOT NULL,
    "giftProductId" TEXT,
    "giftProductTitle" TEXT,
    "giftProductImage" TEXT,
    "giftVariantId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignRewardTier_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CampaignRewardTier_campaignId_idx" ON "CampaignRewardTier"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRewardTier_campaignId_position_key" ON "CampaignRewardTier"("campaignId", "position");
