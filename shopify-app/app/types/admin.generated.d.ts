/* eslint-disable eslint-comments/disable-enable-pair */
/* eslint-disable eslint-comments/no-unlimited-disable */
/* eslint-disable */
import type * as AdminTypes from './admin.types.d.ts';

export type FgpbDiscountNodeQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type FgpbDiscountNodeQuery = { discountNode?: AdminTypes.Maybe<(
    Pick<AdminTypes.DiscountNode, 'id'>
    & { discount: (
      Pick<AdminTypes.DiscountAutomaticApp, 'title' | 'status'>
      & { appDiscountType: Pick<AdminTypes.AppDiscountType, 'functionId' | 'appKey'> }
    ) }
  )> };

export type FgpbFindAppDiscountsQueryVariables = AdminTypes.Exact<{
  query: AdminTypes.Scalars['String']['input'];
}>;


export type FgpbFindAppDiscountsQuery = { discountNodes: { nodes: Array<(
      Pick<AdminTypes.DiscountNode, 'id'>
      & { discount: (
        Pick<AdminTypes.DiscountAutomaticApp, 'title' | 'status'>
        & { appDiscountType: Pick<AdminTypes.AppDiscountType, 'functionId' | 'appKey'> }
      ) }
    )> } };

export type FgpbDiscountAutomaticAppCreateMutationVariables = AdminTypes.Exact<{
  automaticAppDiscount: AdminTypes.DiscountAutomaticAppInput;
}>;


export type FgpbDiscountAutomaticAppCreateMutation = { discountAutomaticAppCreate?: AdminTypes.Maybe<{ automaticAppDiscount?: AdminTypes.Maybe<Pick<AdminTypes.DiscountAutomaticApp, 'discountId'>>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message'>> }> };

export type FgpbDiscountAutomaticAppUpdateMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  automaticAppDiscount: AdminTypes.DiscountAutomaticAppInput;
}>;


export type FgpbDiscountAutomaticAppUpdateMutation = { discountAutomaticAppUpdate?: AdminTypes.Maybe<{ automaticAppDiscount?: AdminTypes.Maybe<Pick<AdminTypes.DiscountAutomaticApp, 'discountId'>>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message'>> }> };

export type FgpbDiscountAutomaticActivateMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type FgpbDiscountAutomaticActivateMutation = { discountAutomaticActivate?: AdminTypes.Maybe<{ automaticDiscountNode?: AdminTypes.Maybe<Pick<AdminTypes.DiscountAutomaticNode, 'id'>>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message'>> }> };

export type FgpbDiscountAutomaticDeactivateMutationVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type FgpbDiscountAutomaticDeactivateMutation = { discountAutomaticDeactivate?: AdminTypes.Maybe<{ automaticDiscountNode?: AdminTypes.Maybe<Pick<AdminTypes.DiscountAutomaticNode, 'id'>>, userErrors: Array<Pick<AdminTypes.DiscountUserError, 'field' | 'message'>> }> };

export type FgpbMetafieldsSetMutationVariables = AdminTypes.Exact<{
  metafields: Array<AdminTypes.MetafieldsSetInput> | AdminTypes.MetafieldsSetInput;
}>;


export type FgpbMetafieldsSetMutation = { metafieldsSet?: AdminTypes.Maybe<{ metafields?: AdminTypes.Maybe<Array<Pick<AdminTypes.Metafield, 'id'>>>, userErrors: Array<Pick<AdminTypes.MetafieldsSetUserError, 'field' | 'message'>> }> };

export type FgpbShopCurrencyQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type FgpbShopCurrencyQuery = { shop: Pick<AdminTypes.Shop, 'currencyCode'> };

export type FgpbPublicationsQueryVariables = AdminTypes.Exact<{ [key: string]: never; }>;


export type FgpbPublicationsQuery = { publications: { nodes: Array<(
      Pick<AdminTypes.Publication, 'id'>
      & { catalog?: AdminTypes.Maybe<Pick<AdminTypes.AppCatalog, 'title'> | Pick<AdminTypes.CompanyLocationCatalog, 'title'> | Pick<AdminTypes.MarketCatalog, 'title'>> }
    )> } };

export type ShopifyAdminGetProductQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type ShopifyAdminGetProductQuery = { product?: AdminTypes.Maybe<(
    Pick<AdminTypes.Product, 'id' | 'title' | 'handle'>
    & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, variants: { nodes: Array<(
        Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price' | 'sku' | 'availableForSale' | 'inventoryQuantity' | 'inventoryPolicy'>
        & { image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>> }
      )> } }
  )> };

export type ShopifyAdminSearchProductsQueryVariables = AdminTypes.Exact<{
  query: AdminTypes.Scalars['String']['input'];
  onlineStorePublicationId: AdminTypes.Scalars['ID']['input'];
}>;


export type ShopifyAdminSearchProductsQuery = { products: { nodes: Array<(
      Pick<AdminTypes.Product, 'id' | 'title' | 'status' | 'publishedOnPublication'>
      & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, variants: { nodes: Array<Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price' | 'compareAtPrice' | 'availableForSale' | 'inventoryQuantity' | 'inventoryPolicy'>> } }
    )> } };

export type ShopifyAdminSearchProductsFallbackQueryVariables = AdminTypes.Exact<{
  query: AdminTypes.Scalars['String']['input'];
}>;


export type ShopifyAdminSearchProductsFallbackQuery = { products: { nodes: Array<(
      Pick<AdminTypes.Product, 'id' | 'title' | 'status'>
      & { featuredImage?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, variants: { nodes: Array<Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price' | 'compareAtPrice' | 'availableForSale' | 'inventoryQuantity' | 'inventoryPolicy'>> } }
    )> } };

export type ShopifyAdminGetVariantQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
  onlineStorePublicationId: AdminTypes.Scalars['ID']['input'];
}>;


export type ShopifyAdminGetVariantQuery = { productVariant?: AdminTypes.Maybe<(
    Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price' | 'sku' | 'availableForSale' | 'inventoryQuantity' | 'inventoryPolicy'>
    & { image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, product: Pick<AdminTypes.Product, 'id' | 'title' | 'status' | 'publishedOnPublication'> }
  )> };

export type ShopifyAdminGetVariantFallbackQueryVariables = AdminTypes.Exact<{
  id: AdminTypes.Scalars['ID']['input'];
}>;


export type ShopifyAdminGetVariantFallbackQuery = { productVariant?: AdminTypes.Maybe<(
    Pick<AdminTypes.ProductVariant, 'id' | 'title' | 'price' | 'sku' | 'availableForSale' | 'inventoryQuantity' | 'inventoryPolicy'>
    & { image?: AdminTypes.Maybe<Pick<AdminTypes.Image, 'url' | 'altText'>>, product: Pick<AdminTypes.Product, 'id' | 'title' | 'status'> }
  )> };

interface GeneratedQueryTypes {
  "#graphql\n  query FgpbDiscountNode($id: ID!) {\n    discountNode(id: $id) {\n      id\n      discount {\n        ... on DiscountAutomaticApp {\n          title\n          status\n          appDiscountType {\n            functionId\n            appKey\n          }\n        }\n      }\n    }\n  }\n": {return: FgpbDiscountNodeQuery, variables: FgpbDiscountNodeQueryVariables},
  "#graphql\n  query FgpbFindAppDiscounts($query: String!) {\n    discountNodes(first: 25, query: $query) {\n      nodes {\n        id\n        discount {\n          ... on DiscountAutomaticApp {\n            title\n            status\n            appDiscountType {\n              functionId\n              appKey\n            }\n          }\n        }\n      }\n    }\n  }\n": {return: FgpbFindAppDiscountsQuery, variables: FgpbFindAppDiscountsQueryVariables},
  "#graphql\n  query FgpbShopCurrency {\n    shop {\n      currencyCode\n    }\n  }\n": {return: FgpbShopCurrencyQuery, variables: FgpbShopCurrencyQueryVariables},
  "#graphql\n  query FgpbPublications {\n    publications(first: 20) {\n      nodes {\n        id\n        catalog {\n          title\n        }\n      }\n    }\n  }\n": {return: FgpbPublicationsQuery, variables: FgpbPublicationsQueryVariables},
  "#graphql\n  query ShopifyAdminGetProduct($id: ID!) {\n    product(id: $id) {\n      id\n      title\n      handle\n      featuredImage {\n        url\n        altText\n      }\n      variants(first: 100) {\n        nodes {\n          id\n          title\n          price\n          sku\n          availableForSale\n          inventoryQuantity\n          inventoryPolicy\n          image {\n            url\n            altText\n          }\n        }\n      }\n    }\n  }\n": {return: ShopifyAdminGetProductQuery, variables: ShopifyAdminGetProductQueryVariables},
  "#graphql\n  query ShopifyAdminSearchProducts(\n    $query: String!\n    $onlineStorePublicationId: ID!\n  ) {\n    products(first: 20, query: $query) {\n      nodes {\n        id\n        title\n        status\n        publishedOnPublication(publicationId: $onlineStorePublicationId)\n        featuredImage {\n          url\n          altText\n        }\n        variants(first: 100) {\n          nodes {\n            id\n            title\n            price\n            compareAtPrice\n            availableForSale\n            inventoryQuantity\n            inventoryPolicy\n          }\n        }\n      }\n    }\n  }\n": {return: ShopifyAdminSearchProductsQuery, variables: ShopifyAdminSearchProductsQueryVariables},
  "#graphql\n  query ShopifyAdminSearchProductsFallback($query: String!) {\n    products(first: 20, query: $query) {\n      nodes {\n        id\n        title\n        status\n        featuredImage {\n          url\n          altText\n        }\n        variants(first: 100) {\n          nodes {\n            id\n            title\n            price\n            compareAtPrice\n            availableForSale\n            inventoryQuantity\n            inventoryPolicy\n          }\n        }\n      }\n    }\n  }\n": {return: ShopifyAdminSearchProductsFallbackQuery, variables: ShopifyAdminSearchProductsFallbackQueryVariables},
  "#graphql\n  query ShopifyAdminGetVariant(\n    $id: ID!\n    $onlineStorePublicationId: ID!\n  ) {\n    productVariant(id: $id) {\n      id\n      title\n      price\n      sku\n      availableForSale\n      inventoryQuantity\n      inventoryPolicy\n      image {\n        url\n        altText\n      }\n      product {\n        id\n        title\n        status\n        publishedOnPublication(publicationId: $onlineStorePublicationId)\n      }\n    }\n  }\n": {return: ShopifyAdminGetVariantQuery, variables: ShopifyAdminGetVariantQueryVariables},
  "#graphql\n  query ShopifyAdminGetVariantFallback($id: ID!) {\n    productVariant(id: $id) {\n      id\n      title\n      price\n      sku\n      availableForSale\n      inventoryQuantity\n      inventoryPolicy\n      image {\n        url\n        altText\n      }\n      product {\n        id\n        title\n        status\n      }\n    }\n  }\n": {return: ShopifyAdminGetVariantFallbackQuery, variables: ShopifyAdminGetVariantFallbackQueryVariables},
}

interface GeneratedMutationTypes {
  "#graphql\n  mutation FgpbDiscountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {\n    discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {\n      automaticAppDiscount {\n        discountId\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: FgpbDiscountAutomaticAppCreateMutation, variables: FgpbDiscountAutomaticAppCreateMutationVariables},
  "#graphql\n  mutation FgpbDiscountAutomaticAppUpdate(\n    $id: ID!\n    $automaticAppDiscount: DiscountAutomaticAppInput!\n  ) {\n    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $automaticAppDiscount) {\n      automaticAppDiscount {\n        discountId\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: FgpbDiscountAutomaticAppUpdateMutation, variables: FgpbDiscountAutomaticAppUpdateMutationVariables},
  "#graphql\n  mutation FgpbDiscountAutomaticActivate($id: ID!) {\n    discountAutomaticActivate(id: $id) {\n      automaticDiscountNode {\n        id\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: FgpbDiscountAutomaticActivateMutation, variables: FgpbDiscountAutomaticActivateMutationVariables},
  "#graphql\n  mutation FgpbDiscountAutomaticDeactivate($id: ID!) {\n    discountAutomaticDeactivate(id: $id) {\n      automaticDiscountNode {\n        id\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: FgpbDiscountAutomaticDeactivateMutation, variables: FgpbDiscountAutomaticDeactivateMutationVariables},
  "#graphql\n  mutation FgpbMetafieldsSet($metafields: [MetafieldsSetInput!]!) {\n    metafieldsSet(metafields: $metafields) {\n      metafields {\n        id\n      }\n      userErrors {\n        field\n        message\n      }\n    }\n  }\n": {return: FgpbMetafieldsSetMutation, variables: FgpbMetafieldsSetMutationVariables},
}
declare module '@shopify/admin-api-client' {
  type InputMaybe<T> = AdminTypes.InputMaybe<T>;
  interface AdminQueries extends GeneratedQueryTypes {}
  interface AdminMutations extends GeneratedMutationTypes {}
}
