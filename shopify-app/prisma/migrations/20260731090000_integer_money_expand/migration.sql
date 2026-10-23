-- Stage A expand: integer minor-unit money columns (legacy Float retained).
-- Forward-only. Do not drop Float columns in this migration.

ALTER TABLE "Campaign" ADD COLUMN "thresholdMinor" BIGINT;
ALTER TABLE "Campaign" ADD COLUMN "fixedDiscountAmountMinor" BIGINT;
ALTER TABLE "Campaign" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE "CampaignRewardTier" ADD COLUMN "thresholdMinor" BIGINT;

ALTER TABLE "AppSettings" ADD COLUMN "defaultThresholdMinor" BIGINT;
ALTER TABLE "AppSettings" ADD COLUMN "currencyCode" TEXT NOT NULL DEFAULT 'INR';
