import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { authenticateLifecycleWebhook } from "./webhook-auth.server";

const secret = "test-webhook-secret";

function signedRequest(
  body: string,
  options?: { hmac?: string; shop?: string | null; topic?: string | null },
) {
  const hmac =
    options?.hmac ??
    createHmac("sha256", secret).update(Buffer.from(body)).digest("base64");
  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Shopify-Hmac-Sha256": hmac,
  });

  if (options?.shop !== null) {
    headers.set("X-Shopify-Shop-Domain", options?.shop ?? "demo.myshopify.com");
  }
  if (options?.topic !== null) {
    headers.set("X-Shopify-Topic", options?.topic ?? "app/uninstalled");
  }

  return new Request("https://app.example.com/webhooks/app/uninstalled", {
    method: "POST",
    headers,
    body,
  });
}

function sdkFailure(status: number) {
  return async (_request: Request) => {
    throw new Response("SDK authentication failed", { status });
  };
}

describe("lifecycle webhook authentication", () => {
  it("returns the SDK result unchanged when normal authentication succeeds", async () => {
    const expected = {
      shop: "demo.myshopify.com",
      topic: "APP_UNINSTALLED",
      session: { id: "offline_demo.myshopify.com" },
    };

    const result = await authenticateLifecycleWebhook(
      signedRequest("{}"),
      async () => expected,
      secret,
    );

    assert.equal(result, expected);
  });

  it("uses signed headers after the SDK token-refresh path throws 500", async () => {
    const body = JSON.stringify({ myshopify_domain: "demo.myshopify.com" });
    const result = await authenticateLifecycleWebhook(
      signedRequest(body, { topic: "shop/redact" }),
      sdkFailure(500),
      secret,
    );

    assert.deepEqual(result, {
      shop: "demo.myshopify.com",
      topic: "shop/redact",
      session: undefined,
    });
  });

  it("never bypasses non-500 authentication failures", async () => {
    await assert.rejects(
      () =>
        authenticateLifecycleWebhook(
          signedRequest("{}"),
          sdkFailure(401),
          secret,
        ),
      (error: unknown) => error instanceof Response && error.status === 401,
    );
  });

  it("rejects an invalid HMAC during the sessionless fallback", async () => {
    await assert.rejects(
      () =>
        authenticateLifecycleWebhook(
          signedRequest("{}", { hmac: "not-a-valid-signature" }),
          sdkFailure(500),
          secret,
        ),
      (error: unknown) => error instanceof Response && error.status === 401,
    );
  });

  it("rejects fallback when the app secret is unavailable", async () => {
    await assert.rejects(
      () =>
        authenticateLifecycleWebhook(
          signedRequest("{}"),
          sdkFailure(500),
          "",
        ),
      (error: unknown) => error instanceof Response && error.status === 401,
    );
  });

  it("rejects a signed payload whose shop differs from the signed header", async () => {
    const body = JSON.stringify({ shop_domain: "other.myshopify.com" });
    await assert.rejects(
      () =>
        authenticateLifecycleWebhook(
          signedRequest(body),
          sdkFailure(500),
          secret,
        ),
      (error: unknown) => error instanceof Response && error.status === 401,
    );
  });

  it("preserves the SDK 500 when signed identity headers are missing", async () => {
    await assert.rejects(
      () =>
        authenticateLifecycleWebhook(
          signedRequest("{}", { shop: null }),
          sdkFailure(500),
          secret,
        ),
      (error: unknown) => error instanceof Response && error.status === 500,
    );

    await assert.rejects(
      () =>
        authenticateLifecycleWebhook(
          signedRequest("{}", { topic: null }),
          sdkFailure(500),
          secret,
        ),
      (error: unknown) => error instanceof Response && error.status === 500,
    );
  });

  it("rejects a signed but invalid shop domain", async () => {
    await assert.rejects(
      () =>
        authenticateLifecycleWebhook(
          signedRequest("{}", { shop: "attacker.example.com" }),
          sdkFailure(500),
          secret,
        ),
      (error: unknown) => error instanceof Response && error.status === 500,
    );
  });
});
