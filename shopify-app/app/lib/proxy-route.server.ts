import { Prisma } from "@prisma/client";

export type ProxyRouteName = "widget-state" | "evaluate-cart" | "track-event";

export type ProxyRouteLogContext = {
  shop?: string | null;
  campaignId?: number | null;
  request?: Request;
  requestBody?: unknown;
  graphqlResponse?: unknown;
};

type SerializedError = {
  type: string;
  message: string;
  stack?: string;
  status?: number;
  statusText?: string;
  prismaCode?: string;
  prismaMeta?: unknown;
  graphqlResponse?: unknown;
  body?: unknown;
  cause?: unknown;
};

export function serializeProxyRouteError(
  error: unknown,
  context: ProxyRouteLogContext = {},
): SerializedError {
  if (error instanceof Response) {
    return {
      type: "Response",
      message: `HTTP ${error.status} ${error.statusText}`,
      status: error.status,
      statusText: error.statusText,
    };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return {
      type: "PrismaClientKnownRequestError",
      message: error.message,
      stack: error.stack,
      prismaCode: error.code,
      prismaMeta: error.meta,
    };
  }

  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return {
      type: "PrismaClientUnknownRequestError",
      message: error.message,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    const enriched = error as Error & {
      status?: number;
      body?: unknown;
      graphQLErrors?: unknown;
      response?: { body?: unknown };
    };

    return {
      type: error.name || "Error",
      message: error.message,
      stack: error.stack,
      status: enriched.status,
      body: enriched.body,
      graphqlResponse:
        context.graphqlResponse ??
        enriched.graphQLErrors ??
        enriched.response?.body ??
        undefined,
      cause: enriched.cause,
    };
  }

  return {
    type: typeof error,
    message: String(error),
    graphqlResponse: context.graphqlResponse,
  };
}

export function logProxyRouteError(
  route: ProxyRouteName,
  error: unknown,
  context: ProxyRouteLogContext = {},
): SerializedError {
  const serialized = serializeProxyRouteError(error, context);
  console.error(`[FGPB Proxy ${route}]`, {
    route,
    shop: context.shop ?? null,
    campaignId: context.campaignId ?? null,
    // Only bounded identifiers/status codes; never URLs, query values or raw errors.
    error: { type: error instanceof Prisma.PrismaClientKnownRequestError ? "database" : error instanceof Response ? "http" : "internal", status: serialized.status, prismaCode: serialized.prismaCode },
  });

  return serialized;
}

export type ProxyDisabledEvaluatePayload = {
  enabled: false;
  eligible: false;
  action: "NONE";
  threshold: null;
  progress: 0;
  remaining: 0;
  rewardType: null;
  gift: null;
  campaign: null;
};

export type ProxyDisabledWidgetPayload = {
  enabled: false;
  campaignId: null;
  threshold: null;
  heading: null;
  description: null;
  progress: null;
  remaining: null;
  eligible: false;
  gift: null;
  colors: null;
  widgetSettings: null;
  template: null;
  autoAddGift: false;
};

export function proxyDisabledPayload(
  route: "evaluate-cart",
): ProxyDisabledEvaluatePayload;
export function proxyDisabledPayload(
  route: "widget-state" | "track-event",
): ProxyDisabledWidgetPayload;
export function proxyDisabledPayload(
  route: ProxyRouteName,
): ProxyDisabledEvaluatePayload | ProxyDisabledWidgetPayload;
export function proxyDisabledPayload(
  route: ProxyRouteName,
): ProxyDisabledEvaluatePayload | ProxyDisabledWidgetPayload {
  if (route === "evaluate-cart") {
    return {
      enabled: false,
      eligible: false,
      action: "NONE",
      threshold: null,
      progress: 0,
      remaining: 0,
      rewardType: null,
      gift: null,
      campaign: null,
    };
  }

  return {
    enabled: false,
    campaignId: null,
    threshold: null,
    heading: null,
    description: null,
    progress: null,
    remaining: null,
    eligible: false,
    gift: null,
    colors: null,
    widgetSettings: null,
    template: null,
    autoAddGift: false,
  };
}

export function handleProxyRouteFailure(
  route: ProxyRouteName,
  error: unknown,
  context: ProxyRouteLogContext = {},
): Response {
  logProxyRouteError(route, error, context);

  if (error instanceof Response) {
    if (error.status === 400) {
      return Response.json(proxyDisabledPayload(route), { status: 400 });
    }
    return Response.json(
      {
        ...proxyDisabledPayload(route),
        error: "Storefront request failed. Please try again.",
        code: "PROXY_REQUEST_FAILED",
      },
      { status: error.status },
    );
  }

  return Response.json(
    {
      ...proxyDisabledPayload(route),
      error: "Storefront request failed. Please try again.",
      code: "PROXY_REQUEST_FAILED",
    },
    { status: 500 },
  );
}

export function readProxyShop(
  request: Request,
  sessionShop?: string | null,
): string {
  return sessionShop ?? new URL(request.url).searchParams.get("shop") ?? "";
}
