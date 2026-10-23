-- CreateIndex
-- Speeds expired-lease reclaim: status='claimed' AND leaseExpiresAt <= now()
CREATE INDEX "DiscountSyncJob_status_leaseExpiresAt_idx" ON "DiscountSyncJob"("status", "leaseExpiresAt");
