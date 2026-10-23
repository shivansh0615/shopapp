import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const JSON_ARRAY_COLUMNS = ["placements", "triggerProductIds", "triggerCollectionIds"] as const;

async function main() {
  const rows = await db.$queryRawUnsafe<
    Array<{
      id: number;
      placements: string | null;
      widgetSettings: string | null;
      triggerProductIds: string | null;
      triggerCollectionIds: string | null;
    }>
  >(
    `SELECT id,
      CAST(placements AS TEXT) as placements,
      CAST(widgetSettings AS TEXT) as widgetSettings,
      CAST(triggerProductIds AS TEXT) as triggerProductIds,
      CAST(triggerCollectionIds AS TEXT) as triggerCollectionIds
     FROM Campaign`,
  );

  console.log("Before:", rows);

  for (const col of JSON_ARRAY_COLUMNS) {
    await db.$executeRawUnsafe(
      `UPDATE Campaign SET ${col} = '[]' WHERE ${col} IS NULL OR length(trim(CAST(${col} AS TEXT))) = 0`,
    );
  }

  await db.$executeRawUnsafe(
    `UPDATE Campaign SET widgetSettings = NULL WHERE widgetSettings IS NULL OR length(trim(CAST(widgetSettings AS TEXT))) = 0 OR CAST(widgetSettings AS TEXT) = '[]'`,
  );

  const after = await db.campaign.findMany();
  console.log(
    "After:",
    after.map((c) => ({
      id: c.id,
      placements: c.placements,
      triggerProductIds: c.triggerProductIds,
      triggerCollectionIds: c.triggerCollectionIds,
      widgetSettings: c.widgetSettings,
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
