/**
 * PR-2 — Qualifying subtotal resolve hardening.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { proxyDisabledPayload } from "../../lib/proxy-route.server";
import { parseProxyCartLines } from "../../lib/cart-lines.server";
import {
  canCalculateQualifyingSubtotalFromLines,
  resolveEvaluationSubtotal,
} from "./resolve-subtotal";

describe("PR-2 — resolveEvaluationSubtotal hardening", () => {
  it("1. complete lines → calculated qualifying subtotal used", () => {
    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 600,
      lines: [
        { variantId: "1", quantity: 1, price: 600, properties: {} },
        {
          variantId: "11",
          quantity: 1,
          price: 100,
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "8" },
        },
      ],
    });
    assert.equal(resolved.source, "calculated_from_cart_lines");
    assert.equal(resolved.subtotal, 600);
    assert.equal(resolved.diagnostic, undefined);
  });

  it("2. incomplete lines (no properties) → caller subtotal", () => {
    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 800,
      lines: [{ variantId: "1", quantity: 1, price: 500 }],
    });
    assert.equal(resolved.source, "legacy_caller_subtotal");
    assert.equal(resolved.subtotal, 800);
    assert.equal(canCalculateQualifyingSubtotalFromLines([{ variantId: "1", quantity: 1, price: 500 }]), false);
  });

  it("3. missing price → fallback to caller; never treat as zero-complete", () => {
    const lines = [{ variantId: "1", quantity: 1, properties: {} }];
    assert.equal(canCalculateQualifyingSubtotalFromLines(lines), false);

    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 750,
      lines,
    });
    assert.equal(resolved.source, "legacy_caller_subtotal");
    assert.equal(resolved.subtotal, 750);
    assert.equal(resolved.diagnostic, undefined);
  });

  it("3b. parseProxyCartLines does not coerce missing price to 0", () => {
    const request = new Request(
      "https://example.com/apps/proxy?cartLines=" +
        encodeURIComponent(JSON.stringify([{ variantId: "1", quantity: 1, properties: {} }])),
    );
    const parsed = parseProxyCartLines(request);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.price, undefined);
    assert.equal(canCalculateQualifyingSubtotalFromLines(parsed), false);
  });

  it("4. matching caller/calculated → calculated source, no mismatch diagnostic", () => {
    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 600,
      lines: [
        { variantId: "1", quantity: 1, price: 600, properties: {} },
        {
          variantId: "11",
          quantity: 1,
          price: 100,
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "8" },
        },
      ],
    });
    assert.equal(resolved.source, "calculated_from_cart_lines");
    assert.equal(resolved.subtotal, 600);
    assert.equal(resolved.diagnostic, undefined);
  });

  it("5. differing caller/calculated → prefer calculated + SUBTOTAL_CALLER_MISMATCH", () => {
    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 9999,
      lines: [
        { variantId: "1", quantity: 1, price: 600, properties: {} },
        {
          variantId: "11",
          quantity: 1,
          price: 100,
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "8" },
        },
      ],
    });
    assert.equal(resolved.source, "calculated_from_cart_lines");
    assert.equal(resolved.subtotal, 600);
    assert.equal(resolved.diagnostic?.code, "SUBTOTAL_CALLER_MISMATCH");
    assert.equal(resolved.diagnostic?.callerSubtotal, 9999);
    assert.equal(resolved.diagnostic?.calculatedSubtotal, 600);

    const publicShape = proxyDisabledPayload("widget-state") as Record<string, unknown>;
    assert.equal("diagnostic" in publicShape, false);
    assert.equal("subtotalDiagnostic" in publicShape, false);
  });

  it("6. production-like empty lines → caller subtotal unchanged", () => {
    const resolved = resolveEvaluationSubtotal({
      callerSubtotal: 420.5,
      lines: [],
    });
    assert.equal(resolved.source, "legacy_caller_subtotal");
    assert.equal(resolved.subtotal, 420.5);
    assert.equal(resolved.diagnostic, undefined);
  });

  it("explicit price 0 with properties is complete (not missing)", () => {
    assert.equal(
      canCalculateQualifyingSubtotalFromLines([
        { variantId: "1", quantity: 1, price: 0, properties: {} },
      ]),
      true,
    );
  });
});
