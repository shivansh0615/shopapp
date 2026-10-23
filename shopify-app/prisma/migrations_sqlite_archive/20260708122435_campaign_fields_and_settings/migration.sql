-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "giftProductTitle" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "giftProductImage" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "widgetSettings" JSON;

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "defaultThreshold" REAL NOT NULL DEFAULT 999,
    "defaultWidgetTemplate" TEXT NOT NULL DEFAULT 'Premium',
    "primaryColor" TEXT NOT NULL DEFAULT '#4b7d63',
    "backgroundColor" TEXT NOT NULL DEFAULT '#f8fafc',
    "textColor" TEXT NOT NULL DEFAULT '#111827',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_shop_key" ON "AppSettings"("shop");
