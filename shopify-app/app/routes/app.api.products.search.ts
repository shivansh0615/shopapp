import type { LoaderFunctionArgs } from "react-router";
import { authenticateAdmin } from "../shopify.server";
import { searchProducts, getGiftVariantPage } from "../services/shopify-admin.server";

const emptyPage = { hasNextPage: false, endCursor: null };

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticateAdmin(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const browse = url.searchParams.get("browse") === "1";
  const after = url.searchParams.get("after");
  const productId = url.searchParams.get("productId");

  if (!productId && !browse && query.trim().length < 2) {
    return Response.json(
      {
        products: [],
        publicationWarning: false,
        status: "ok",
        message: null,
        pageInfo: emptyPage,
      },
      { status: 200 },
    );
  }

  try {
    const result = productId
      ? await getGiftVariantPage(admin, session.shop, productId, after)
      : await searchProducts(admin, session.shop, query, { browse, after });
    const statusCode =
      result.status === "permission_required" ? 403 : result.status === "load_failed" ? 502 : 200;
    return Response.json(result, { status: statusCode });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[app.api.products.search] loader failed:", error);
    return Response.json(
      {
        products: [],
        publicationWarning: false,
        status: "load_failed",
        message: "Could not load products. Try again.",
        pageInfo: emptyPage,
      },
      { status: 502 },
    );
  }
};
