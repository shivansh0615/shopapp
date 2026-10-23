-- Repair invalid JSON columns introduced when new fields were added via db push.
UPDATE "Campaign"
SET "triggerProductIds" = '[]'
WHERE "triggerProductIds" IS NULL
   OR length(trim(CAST("triggerProductIds" AS TEXT))) = 0;

UPDATE "Campaign"
SET "triggerCollectionIds" = '[]'
WHERE "triggerCollectionIds" IS NULL
   OR length(trim(CAST("triggerCollectionIds" AS TEXT))) = 0;

UPDATE "Campaign"
SET "placements" = '[]'
WHERE "placements" IS NULL
   OR length(trim(CAST("placements" AS TEXT))) = 0;

UPDATE "Campaign"
SET "widgetSettings" = NULL
WHERE "widgetSettings" IS NULL
   OR length(trim(CAST("widgetSettings" AS TEXT))) = 0
   OR CAST("widgetSettings" AS TEXT) = '[]';
