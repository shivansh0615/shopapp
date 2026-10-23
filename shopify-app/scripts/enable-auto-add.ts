import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
await db.appSettings.updateMany({ data: { autoAddGift: true } });
console.log("autoAddGift enabled for all shops");
await db.$disconnect();
