-- AlterTable
ALTER TABLE "ShopDiscount" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE "ShopDiscount" ADD COLUMN "lastSyncErrorCode" TEXT;
ALTER TABLE "ShopDiscount" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DiscountSyncJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" INTEGER,
    "desiredAction" TEXT NOT NULL,
    "desiredMode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessageSafe" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DiscountSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscountSyncJob_dedupeKey_key" ON "DiscountSyncJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "DiscountSyncJob_status_nextAttemptAt_idx" ON "DiscountSyncJob"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "DiscountSyncJob_shop_status_idx" ON "DiscountSyncJob"("shop", "status");
