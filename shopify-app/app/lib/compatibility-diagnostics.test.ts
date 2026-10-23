import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateOverallState,
  classifyStorefrontContact,
  missingScopes,
  redactTechnicalDetails,
  type DiagnosticCheck,
} from "./compatibility-diagnostics";

function mk(
  id: string,
  status: DiagnosticCheck["status"],
): DiagnosticCheck {
  return {
    id,
    label: id,
    status,
    explanation: "x",
    merchantAction: null,
    technicalDetails: null,
  };
}

describe("classifyStorefrontContact", () => {
  const now = Date.parse("2026-08-03T12:00:00.000Z");

  it("returns none when missing", () => {
    assert.equal(classifyStorefrontContact(null, now), "none");
  });

  it("returns recent within window", () => {
    assert.equal(
      classifyStorefrontContact(new Date(now - 60_000), now),
      "recent",
    );
  });

  it("returns stale outside window", () => {
    assert.equal(
      classifyStorefrontContact(new Date(now - 1000 * 60 * 60 * 24 * 10), now),
      "stale",
    );
  });
});

describe("missingScopes", () => {
  it("detects missing required scopes", () => {
    const missing = missingScopes("read_products,read_discounts");
    assert.ok(missing.includes("write_discounts"));
    assert.ok(!missing.includes("read_products"));
  });

  it("treats write_discounts as satisfying implied read_discounts", () => {
    assert.deepEqual(
      missingScopes("write_discounts,read_publications,read_products"),
      [],
    );
  });

  it("still requires write_discounts when only read_discounts is granted", () => {
    assert.deepEqual(
      missingScopes("read_discounts,read_publications,read_products"),
      ["write_discounts"],
    );
  });
});

describe("redactTechnicalDetails", () => {
  it("redacts tokens and database URLs", () => {
    const out = redactTechnicalDetails(
      "tok=shpat_abc123 secret=Bearer xyz postgresql://u:p@host/db access_token=abc",
    );
    assert.ok(out);
    assert.equal(out!.includes("shpat_abc123"), false);
    assert.equal(out!.includes("postgresql://u:p@host/db"), false);
    assert.equal(out!.includes("Bearer xyz"), false);
    assert.match(out!, /redacted/i);
  });
});

describe("aggregateOverallState", () => {
  it("READY when all pass", () => {
    const r = aggregateOverallState([mk("a", "pass"), mk("b", "pass")]);
    assert.equal(r.overall, "READY");
  });

  it("ACTION_REQUIRED on fail", () => {
    const r = aggregateOverallState([mk("a", "pass"), mk("b", "fail")]);
    assert.equal(r.overall, "ACTION_REQUIRED");
  });

  it("UNABLE_TO_VERIFY until the published theme embed is checked", () => {
    const r = aggregateOverallState([
      mk("backend_health", "pass"),
      mk("theme_app_embed", "unable_to_verify"),
      mk("storefront_compatibility_mode", "info"),
    ]);
    assert.equal(r.overall, "UNABLE_TO_VERIFY");
  });

  it("UNABLE_TO_VERIFY when backend cannot be verified", () => {
    const r = aggregateOverallState([
      mk("backend_health", "unable_to_verify"),
      mk("a", "pass"),
    ]);
    assert.equal(r.overall, "UNABLE_TO_VERIFY");
  });
});
