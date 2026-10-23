import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import "./env.server";
import prisma from "./db.server";
import { authenticateLifecycleWebhook } from "./lib/webhook-auth.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

type AdminAuthentication = Awaited<
  ReturnType<typeof shopify.authenticate.admin>
>;

/*
 * React Router runs matched parent and child loaders for the same navigation.
 * Both the /app shell and its child route must remain authenticated, but calling
 * Shopify's authenticator twice repeats session-token validation and the session
 * storage lookup. Share the in-flight result only for the lifetime of the exact
 * Request object; the WeakMap cannot mix shops or survive into another request.
 */
const adminAuthenticationByRequest = new WeakMap<
  Request,
  Promise<AdminAuthentication>
>();

export function authenticateAdmin(request: Request) {
  const existing = adminAuthenticationByRequest.get(request);
  if (existing) return existing;

  const authentication = shopify.authenticate.admin(request);
  adminAuthenticationByRequest.set(request, authentication);
  return authentication;
}

export function authenticateWebhookLifecycle(request: Request) {
  return authenticateLifecycleWebhook(
    request,
    (webhookRequest) => shopify.authenticate.webhook(webhookRequest),
    process.env.SHOPIFY_API_SECRET || "",
  );
}

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
