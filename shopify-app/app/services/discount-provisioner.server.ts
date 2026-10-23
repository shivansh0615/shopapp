import type { ShopifyAdminClient } from "./shopify-admin.server";
import {
  DISCOUNT_CONFIG_METAFIELD_KEY,
  DISCOUNT_CONFIG_METAFIELD_NAMESPACE,
  DISCOUNT_FUNCTION_TITLE,
  MANAGED_DISCOUNT_TITLES,
  isManagedDiscountTitle,
} from "./discount-engine/discount-config.schema";
import {
  deleteShopDiscountByShop,
  findShopDiscountByShop,
  upsertShopDiscount,
} from "../repositories/shop-discount.repository";

export const FGPB_DISCOUNT_FUNCTION_HANDLE = "fgpb-discount";

type GraphQLUserError = {
  field: string[] | null;
  message: string;
};

type DiscountAutomaticAppNode = {
  id: string;
  discount: {
    title: string;
    status: string;
    discountClasses?: string[] | null;
    appDiscountType?: {
      functionId?: string | null;
      appKey?: string | null;
    } | null;
  } | null;
};

/**
 * The Function's first gate is `discountClasses.includes(PRODUCT)`. Without it
 * `cart.lines.discounts.generate.run` returns no operations and every tagged
 * gift is charged in full, with no allocation to explain why.
 */
export const REQUIRED_DISCOUNT_CLASSES = ["PRODUCT"];

function assertNoUserErrors(userErrors: GraphQLUserError[], context: string): void {
  if (userErrors.length === 0) return;
  throw new Error(`${context}: ${userErrors.map((error) => error.message).join(", ")}`);
}

export function toDiscountAutomaticNodeGid(id: string): string {
  const trimmed = id.trim();
  if (trimmed.startsWith("gid://shopify/DiscountAutomaticNode/")) {
    return trimmed;
  }
  return `gid://shopify/DiscountAutomaticNode/${trimmed}`;
}

async function executeGraphQL<T>(
  admin: ShopifyAdminClient,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await admin.graphql(query, variables ? { variables } : undefined);
  return (await response.json()) as T;
}

const DISCOUNT_NODE_QUERY = `#graphql
  query FgpbDiscountNode($id: ID!) {
    discountNode(id: $id) {
      id
      discount {
        ... on DiscountAutomaticApp {
          title
          status
          discountClasses
          appDiscountType {
            functionId
            appKey
          }
        }
      }
    }
  }
`;

const FIND_APP_DISCOUNTS_QUERY = `#graphql
  query FgpbFindAppDiscounts($query: String!) {
    discountNodes(first: 25, query: $query) {
      nodes {
        id
        discount {
          ... on DiscountAutomaticApp {
            title
            status
            discountClasses
            appDiscountType {
              functionId
              appKey
            }
          }
        }
      }
    }
  }
`;

const CREATE_AUTOMATIC_APP_DISCOUNT_MUTATION = `#graphql
  mutation FgpbDiscountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const UPDATE_AUTOMATIC_APP_DISCOUNT_MUTATION = `#graphql
  mutation FgpbDiscountAutomaticAppUpdate(
    $id: ID!
    $automaticAppDiscount: DiscountAutomaticAppInput!
  ) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ACTIVATE_AUTOMATIC_DISCOUNT_MUTATION = `#graphql
  mutation FgpbDiscountAutomaticActivate($id: ID!) {
    discountAutomaticActivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DEACTIVATE_AUTOMATIC_DISCOUNT_MUTATION = `#graphql
  mutation FgpbDiscountAutomaticDeactivate($id: ID!) {
    discountAutomaticDeactivate(id: $id) {
      automaticDiscountNode {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const SET_DISCOUNT_METAFIELDS_MUTATION = `#graphql
  mutation FgpbMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function isFgpbManagedDiscount(node: DiscountAutomaticAppNode): boolean {
  const discount = node.discount;
  if (!discount) return false;
  return isManagedDiscountTitle(discount.title);
}

async function loadDiscountNode(
  admin: ShopifyAdminClient,
  discountGid: string,
): Promise<DiscountAutomaticAppNode | null> {
  const payload = await executeGraphQL<{
    data?: { discountNode?: DiscountAutomaticAppNode | null };
  }>(admin, DISCOUNT_NODE_QUERY, { id: toDiscountAutomaticNodeGid(discountGid) });

  return payload.data?.discountNode ?? null;
}

async function findExistingFgpbDiscountInShopify(
  admin: ShopifyAdminClient,
): Promise<string | null> {
  for (const title of MANAGED_DISCOUNT_TITLES) {
    const payload = await executeGraphQL<{
      data?: { discountNodes?: { nodes: DiscountAutomaticAppNode[] } };
    }>(admin, FIND_APP_DISCOUNTS_QUERY, {
      query: `type:app title:${JSON.stringify(title)}`,
    });

    const match = (payload.data?.discountNodes?.nodes ?? []).find(isFgpbManagedDiscount);
    if (match?.id) return toDiscountAutomaticNodeGid(match.id);
  }

  return null;
}

export async function resolveShopDiscountGid(
  admin: ShopifyAdminClient,
  shop: string,
): Promise<string | null> {
  const stored = await findShopDiscountByShop(shop);
  if (stored?.discountGid) {
    const node = await loadDiscountNode(admin, stored.discountGid);
    if (node?.discount) {
      return toDiscountAutomaticNodeGid(stored.discountGid);
    }
  }

  const discovered = await findExistingFgpbDiscountInShopify(admin);
  if (discovered) {
    await upsertShopDiscount(shop, discovered);
    return discovered;
  }

  return null;
}

export async function createAutomaticAppDiscount(
  admin: ShopifyAdminClient,
  shop: string,
  configJson: string,
): Promise<string> {
  const existingGid = await resolveShopDiscountGid(admin, shop);
  if (existingGid) {
    return existingGid;
  }

  const startsAt = new Date().toISOString();
  try {
    const payload = await executeGraphQL<{
      data?: {
        discountAutomaticAppCreate?: {
          automaticAppDiscount?: { discountId?: string | null } | null;
          userErrors: GraphQLUserError[];
        };
      };
    }>(admin, CREATE_AUTOMATIC_APP_DISCOUNT_MUTATION, {
      automaticAppDiscount: {
        title: DISCOUNT_FUNCTION_TITLE,
        functionHandle: FGPB_DISCOUNT_FUNCTION_HANDLE,
        discountClasses: ["PRODUCT"],
        startsAt,
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: true,
        },
        metafields: [
          {
            namespace: DISCOUNT_CONFIG_METAFIELD_NAMESPACE,
            key: DISCOUNT_CONFIG_METAFIELD_KEY,
            type: "json",
            value: configJson,
          },
        ],
      },
    });

    const result = payload.data?.discountAutomaticAppCreate;
    assertNoUserErrors(result?.userErrors ?? [], "discountAutomaticAppCreate");

    const discountId = result?.automaticAppDiscount?.discountId;
    if (!discountId) {
      throw new Error("discountAutomaticAppCreate did not return a discount ID.");
    }

    const discountGid = toDiscountAutomaticNodeGid(discountId);
    await upsertShopDiscount(shop, discountGid);
    return discountGid;
  } catch (error) {
    // Concurrent activate/sync may have created the shop discount first.
    const raced = await resolveShopDiscountGid(admin, shop);
    if (raced) {
      await updateAutomaticAppDiscountConfig(admin, raced, configJson);
      return raced;
    }
    throw error;
  }
}

export async function updateAutomaticAppDiscountConfig(
  admin: ShopifyAdminClient,
  discountGid: string,
  configJson: string,
): Promise<void> {
  const normalizedGid = toDiscountAutomaticNodeGid(discountGid);

  const updatePayload = await executeGraphQL<{
    data?: {
      discountAutomaticAppUpdate?: {
        userErrors: GraphQLUserError[];
      };
    };
  }>(admin, UPDATE_AUTOMATIC_APP_DISCOUNT_MUTATION, {
    id: normalizedGid,
    automaticAppDiscount: {
      // Restated on every sync, not just at creation. A node created by an
      // earlier build, or adopted by title from the shop, can otherwise sit
      // permanently without the PRODUCT class: the config stays perfectly in
      // sync while the Function never runs. Converging here self-heals it.
      // Title is restated so an existing "Free Gift Progress Bar" discount
      // is renamed in place instead of leaving a second automatic discount.
      title: DISCOUNT_FUNCTION_TITLE,
      discountClasses: REQUIRED_DISCOUNT_CLASSES,
      metafields: [
        {
          namespace: DISCOUNT_CONFIG_METAFIELD_NAMESPACE,
          key: DISCOUNT_CONFIG_METAFIELD_KEY,
          type: "json",
          value: configJson,
        },
      ],
    },
  });

  const updateErrors = updatePayload.data?.discountAutomaticAppUpdate?.userErrors ?? [];
  if (updateErrors.length === 0) {
    return;
  }

  const setPayload = await executeGraphQL<{
    data?: {
      metafieldsSet?: {
        userErrors: GraphQLUserError[];
      };
    };
  }>(admin, SET_DISCOUNT_METAFIELDS_MUTATION, {
    metafields: [
      {
        ownerId: normalizedGid,
        namespace: DISCOUNT_CONFIG_METAFIELD_NAMESPACE,
        key: DISCOUNT_CONFIG_METAFIELD_KEY,
        type: "json",
        value: configJson,
      },
    ],
  });

  assertNoUserErrors(
    setPayload.data?.metafieldsSet?.userErrors ?? [],
    "metafieldsSet discount_config",
  );
}

export async function activateAutomaticAppDiscount(
  admin: ShopifyAdminClient,
  discountGid: string,
): Promise<void> {
  const payload = await executeGraphQL<{
    data?: {
      discountAutomaticActivate?: {
        userErrors: GraphQLUserError[];
      };
    };
  }>(admin, ACTIVATE_AUTOMATIC_DISCOUNT_MUTATION, {
    id: toDiscountAutomaticNodeGid(discountGid),
  });

  assertNoUserErrors(
    payload.data?.discountAutomaticActivate?.userErrors ?? [],
    "discountAutomaticActivate",
  );
}

export async function deactivateAutomaticAppDiscount(
  admin: ShopifyAdminClient,
  discountGid: string,
): Promise<void> {
  const payload = await executeGraphQL<{
    data?: {
      discountAutomaticDeactivate?: {
        userErrors: GraphQLUserError[];
      };
    };
  }>(admin, DEACTIVATE_AUTOMATIC_DISCOUNT_MUTATION, {
    id: toDiscountAutomaticNodeGid(discountGid),
  });

  assertNoUserErrors(
    payload.data?.discountAutomaticDeactivate?.userErrors ?? [],
    "discountAutomaticDeactivate",
  );
}

export async function ensureShopAutomaticDiscount(
  admin: ShopifyAdminClient,
  shop: string,
  configJson: string,
): Promise<string> {
  const existingGid = await resolveShopDiscountGid(admin, shop);
  if (existingGid) {
    await updateAutomaticAppDiscountConfig(admin, existingGid, configJson);
    return existingGid;
  }

  return createAutomaticAppDiscount(admin, shop, configJson);
}

export async function clearShopDiscountRecord(shop: string): Promise<number> {
  return deleteShopDiscountByShop(shop);
}
