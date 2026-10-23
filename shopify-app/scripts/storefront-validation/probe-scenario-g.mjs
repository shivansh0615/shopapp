/**
 * Minimal Scenario G probe: tagged gift qty via /cart/change.js without browser JS.
 * Slow pacing to reduce Shopify 429s.
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { safeRequest } from "./lib/safe-request.mjs";
import { snapshotCart } from "./lib/cart-snapshot.mjs";
import { hashToken, redactPreview } from "./lib/redact.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const STORE = "https://newish-app-test.myshopify.com";
const THEME = "192969933166";
const PASSWORD = "pauwoo";
const GIFT = 54277124391278;
const jar = new Map();
const timeline = [];

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
function applySetCookie(lines) {
  for (const c of lines) {
    const [pair] = String(c).split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cookieAware(path, opts = {}) {
  await sleep(1200);
  const url = path.startsWith("http") ? path : `${STORE}${path}`;
  let res = await fetch(url, {
    ...opts,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "*/*",
      Cookie: cookieHeader(),
      ...(opts.headers || {}),
    },
    redirect: "manual",
  });
  applySetCookie(res.headers.getSetCookie?.() || []);
  if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.get("location")) {
    const loc = res.headers.get("location");
    return cookieAware(loc.startsWith("http") ? loc : `${STORE}${loc}`, { method: "GET" });
  }
  return { res, text: await res.text() };
}

async function unlock() {
  const f = join(ROOT, "_store_cookies.txt");
  if (existsSync(f)) {
    for (const part of readFileSync(f, "utf8").trim().split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  const probe = await cookieAware("/cart.js");
  if (probe.res.status === 200 && probe.text.trim().startsWith("{")) return;
  const page = await cookieAware("/password");
  const m = page.text.match(/name="authenticity_token" value="([^"]+)"/);
  if (!m) throw new Error("no password token: " + redactPreview(page.text));
  await cookieAware("/password", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      password: PASSWORD,
      form_type: "storefront_password",
      utf8: "✓",
      authenticity_token: m[1],
    }),
  });
}

async function api(step, path, init = {}) {
  await sleep(1500);
  return safeRequest({
    step,
    url: `${STORE}${path}`,
    init: {
      ...init,
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json",
        ...(init.headers || {}),
      },
    },
    cookieHeader: cookieHeader(),
    timeline,
    maxRetries: 4,
    sleep,
    onSetCookie: applySetCookie,
  });
}

async function main() {
  console.log("Waiting 45s for rate-limit cool-down…");
  await sleep(45000);
  await unlock();
  await api("clear", "/cart/clear.js", { method: "POST", headers: { "Content-Type": "application/json" } });
  await sleep(2000);
  let { json: cart } = await api("cart0", `/cart.js?preview_theme_id=${THEME}`);
  let snap = snapshotCart(cart, { giftVariantId: GIFT });
  if (snap.itemCount > 0) throw new Error("clear failed item_count=" + snap.itemCount);

  await api("add_gift", "/cart/add.js", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [
        {
          id: GIFT,
          quantity: 1,
          properties: { _fgpb_free_gift: "true", _fgpb_campaign_id: "9" },
        },
      ],
    }),
  });
  ({ json: cart } = await api("cart1", `/cart.js?preview_theme_id=${THEME}`));
  snap = snapshotCart(cart, { giftVariantId: GIFT });
  const before = {
    tagged: snap.taggedGiftLineCount,
    qty: snap.taggedGiftQuantityTotal,
    keys: snap.lines.filter((l) => l.kind === "tagged_gift").map((l) => l.lineKey),
    shapes: snap.shapes,
  };
  console.log("BEFORE", JSON.stringify(before));

  const giftIdx = cart.items.findIndex((i) => i.properties?._fgpb_free_gift === "true");
  const change = await api("change2", "/cart/change.js", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ line: giftIdx + 1, quantity: 2 }),
  });
  console.log("CHANGE status", change.meta.status, "kind", change.meta.kind);

  ({ json: cart } = await api("cart2", `/cart.js?preview_theme_id=${THEME}`));
  snap = snapshotCart(cart, { giftVariantId: GIFT });
  const after = {
    tagged: snap.taggedGiftLineCount,
    qty: snap.taggedGiftQuantityTotal,
    keys: snap.lines.filter((l) => l.kind === "tagged_gift").map((l) => l.lineKey),
    variantIds: snap.lines.filter((l) => l.kind === "tagged_gift").map((l) => l.variantId),
    campaignIds: snap.lines.filter((l) => l.kind === "tagged_gift").map((l) => l.properties._fgpb_campaign_id),
    shapes: snap.shapes,
    validJson: true,
    lines: snap.lines.filter((l) => l.kind === "tagged_gift"),
  };
  console.log("AFTER", JSON.stringify(after, null, 2));

  // Wait — still no browser sync
  await sleep(5000);
  ({ json: cart } = await api("cart3", `/cart.js?preview_theme_id=${THEME}`));
  snap = snapshotCart(cart, { giftVariantId: GIFT });
  console.log("AFTER_WAIT", {
    qty: snap.taggedGiftQuantityTotal,
    shapes: snap.shapes,
    cartTokenHash: hashToken(jar.get("cart")),
  });

  const out = join(ROOT, "validation-output", "scenario-g-probe");
  mkdirSync(out, { recursive: true });
  writeFileSync(
    join(out, "result.json"),
    JSON.stringify({ before, after, afterWaitQty: snap.taggedGiftQuantityTotal, timeline }, null, 2),
  );
  console.log("Wrote", join(out, "result.json"));
}

main().catch((e) => {
  console.error("FAIL", e.message, e.meta || "");
  process.exitCode = 1;
});
