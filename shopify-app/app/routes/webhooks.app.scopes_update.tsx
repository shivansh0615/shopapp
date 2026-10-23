import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);
  const current = payload.current as string[];

  if (session) {
    await db.session.updateMany({
      where: { id: session.id, shop: session.shop },
      data: { scope: current.toString() },
    });
  }

  return new Response();
};
