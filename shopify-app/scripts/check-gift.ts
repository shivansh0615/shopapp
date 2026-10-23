import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const c = await db.campaign.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { id: "desc" },
  });
  const s = await db.appSettings.findFirst();
  console.log(
    JSON.stringify(
      {
        campaign: {
          id: c?.id,
          threshold: c?.threshold,
          giftVariantId: c?.giftVariantId,
          giftProductId: c?.giftProductId,
          giftTitle: c?.giftProductTitle,
          status: c?.status,
        },
        settings: { autoAddGift: s?.autoAddGift, shop: s?.shop },
      },
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
