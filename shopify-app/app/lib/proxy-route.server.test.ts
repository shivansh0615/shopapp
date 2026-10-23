import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { describe, it } from "node:test";
import {
  handleProxyRouteFailure,
  logProxyRouteError,
  proxyDisabledPayload,
  serializeProxyRouteError,
} from "../lib/proxy-route.server";

describe("proxy route error handling", () => {
  it("does not expose raw errors or sensitive request fields in public responses or logs", async () => {
    const original = console.error;
    const logged: unknown[] = [];
    console.error = (...args) => { logged.push(args); };
    try {
      const response = handleProxyRouteFailure("widget-state", new Error("private database detail"), {
        request: new Request("https://example.com/?signature=private-signature&logged_in_customer_id=private-customer"),
        requestBody: { token: "private-token" },
      });
      const publicText = await response.text();
      assert.equal(response.status, 500);
      for (const value of ["private database detail", "private-signature", "private-customer", "private-token"]) {
        assert.equal(publicText.includes(value), false);
        assert.equal(JSON.stringify(logged).includes(value), false);
      }
    } finally { console.error = original; }
  });
  it("serializes prisma unique constraint errors with code and meta", () => {
    const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "6.16.3",
      meta: { target: ["shop"] },
    });

    const serialized = serializeProxyRouteError(error);

    assert.equal(serialized.type, "PrismaClientKnownRequestError");
    assert.equal(serialized.prismaCode, "P2002");
    assert.deepEqual(serialized.prismaMeta, { target: ["shop"] });
  });

  it("logs response errors from app proxy auth without throwing", () => {
    const response = new Response(undefined, {
      status: 500,
      statusText: "Internal Server Error",
    });

    const serialized = logProxyRouteError("evaluate-cart", response, {
      shop: "demo.myshopify.com",
      campaignId: null,
      request: new Request(
        "https://example.com/apps/proxy/evaluate-cart?shop=demo.myshopify.com&cartSubtotal=100",
      ),
    });

    assert.equal(serialized.type, "Response");
    assert.equal(serialized.status, 500);
  });

  it("returns disabled JSON instead of throwing for route failures", async () => {
    const response = handleProxyRouteFailure(
      "widget-state",
      new Error("boom"),
      {
        shop: "demo.myshopify.com",
        campaignId: 1,
      },
    );

    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.enabled, false);
    assert.equal(body.error, "Storefront request failed. Please try again.");
    assert.equal(body.code, "PROXY_REQUEST_FAILED");
  });

  it("returns stable disabled payloads", () => {
    const widget = proxyDisabledPayload("widget-state");
    const evaluate = proxyDisabledPayload("evaluate-cart");

    assert.equal(widget.enabled, false);
    assert.equal(widget.campaignId, null);
    assert.equal(evaluate.enabled, false);
    assert.equal(evaluate.action, "NONE");
  });
});
