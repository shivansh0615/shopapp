import { PrismaClient } from "@prisma/client";
import { getStorefrontWidgetState } from "../app/services/widget.server.ts";

const p = new PrismaClient();
const shop = "newish-app-test.myshopify.com";
const req = new Request(
  `https://example.com/apps/free-gift/widget-state?shop=${shop}&cartSubtotal=1200&currency=INR`,
);
const state = await getStorefrontWidgetState(shop, req);
console.log(
  JSON.stringify(
    {
      enabled: state.enabled,
      heading: state.heading,
      description: state.description,
      remaining: state.remaining,
      eligible: state.eligible,
      colors: state.colors,
      widgetSettings: state.widgetSettings,
    },
    null,
    2,
  ),
);
await p.$disconnect();
