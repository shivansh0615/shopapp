import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const rows = await p.campaign.findMany({
  orderBy: { updatedAt: "desc" },
  take: 5,
  select: {
    id: true,
    name: true,
    status: true,
    threshold: true,
    shop: true,
    widgetSettings: true,
    updatedAt: true,
  },
});
console.log(JSON.stringify(rows, null, 2));
await p.$disconnect();
