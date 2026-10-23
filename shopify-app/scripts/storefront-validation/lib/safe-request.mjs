/**
 * Shared safe request wrapper for storefront validation.
 * Records diagnostic metadata; never prints secrets.
 */

import { classifyBody, isRetryableTransport, RESPONSE_KINDS } from "./classify-response.mjs";
import { hashToken, pathnameOf, redactPreview } from "./redact.mjs";

export class SafeRequestError extends Error {
  constructor(message, meta) {
    super(message);
    this.name = "SafeRequestError";
    this.meta = meta;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.step
 * @param {string} opts.url
 * @param {RequestInit} [opts.init]
 * @param {string} [opts.cookieHeader] — not logged
 * @param {Array} [opts.timeline]
 * @param {boolean} [opts.expectJson]
 * @param {number} [opts.maxRetries]
 * @param {(ms:number)=>Promise<void>} [opts.sleep]
 * @param {(setCookieLines: string[]) => void} [opts.onSetCookie]
 */
export async function safeRequest(opts) {
  const {
    step,
    url,
    init = {},
    cookieHeader,
    timeline,
    expectJson = true,
    maxRetries = 2,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    onSetCookie,
  } = opts;

  const method = (init.method || "GET").toUpperCase();
  let attempt = 0;
  let lastMeta = null;

  while (attempt <= maxRetries) {
    const started = Date.now();
    const headers = new Headers(init.headers || {});
    if (cookieHeader) headers.set("Cookie", cookieHeader);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    let res;
    try {
      res = await fetch(url, { ...init, headers, redirect: "manual" });
    } catch (err) {
      lastMeta = {
        timestamp: new Date().toISOString(),
        step,
        method,
        pathname: pathnameOf(url),
        status: null,
        contentType: null,
        redirect: null,
        finalPathname: null,
        byteLength: 0,
        shopifyRequestId: null,
        cartTokenHash: null,
        retryAttempt: attempt,
        elapsedMs: Date.now() - started,
        kind: "NETWORK_ERROR",
        preview: redactPreview(err?.message || String(err)),
      };
      if (timeline) timeline.push(lastMeta);
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(400 * attempt);
        continue;
      }
      throw new SafeRequestError(`Network error at ${step}`, lastMeta);
    }

    // Follow one hop of redirects manually for diagnostics
    let redirectStatus = null;
    let finalUrl = url;
    if (res.status >= 300 && res.status < 400) {
      redirectStatus = res.status;
      const loc = res.headers.get("location");
      if (loc) {
        finalUrl = new URL(loc, url).toString();
        res = await fetch(finalUrl, {
          ...init,
          headers,
          redirect: "follow",
        });
      }
    }

    const buf = Buffer.from(await res.arrayBuffer());
    const text = buf.toString("utf8");
    const contentType = res.headers.get("content-type");
    const classification = classifyBody(res.status, contentType, text);
    const setCookie = res.headers.getSetCookie?.() || [];
    if (onSetCookie && setCookie.length) onSetCookie(setCookie);
    // Do not store cookie values — only presence / hash
    const cartTokenHash = hashToken(
      /cart=([^;]+)/.exec(cookieHeader || "")?.[1] || null,
    );

    lastMeta = {
      timestamp: new Date().toISOString(),
      step,
      method,
      pathname: pathnameOf(url),
      status: res.status,
      contentType,
      redirect: redirectStatus,
      finalPathname: pathnameOf(finalUrl),
      byteLength: buf.length,
      shopifyRequestId:
        res.headers.get("x-request-id") ||
        res.headers.get("x-shopify-request-id") ||
        res.headers.get("x-shopid") ||
        null,
      retryAfter: res.headers.get("retry-after"),
      cartTokenHash,
      retryAttempt: attempt,
      elapsedMs: Date.now() - started,
      kind: classification.kind,
      preview: classification.preview,
      setCookieCount: setCookie.length,
    };
    if (timeline) timeline.push({ ...lastMeta });

      const retryable =
      isRetryableTransport(res.status, classification.kind) ||
      classification.kind === RESPONSE_KINDS.EMPTY ||
      (res.status === 429 && classification.kind === RESPONSE_KINDS.HTML_BOT_CHALLENGE);

    if (expectJson) {
      if (classification.kind !== RESPONSE_KINDS.JSON) {
        if (retryable && attempt < maxRetries) {
          attempt += 1;
          const wait =
            Number(lastMeta.retryAfter) * 1000 ||
            (res.status === 429 ? 8000 * attempt : 500 * attempt);
          await sleep(wait);
          continue;
        }
        throw new SafeRequestError(
          `Non-JSON at ${step}: ${classification.kind} status=${res.status}`,
          lastMeta,
        );
      }
      if (!res.ok) {
        throw new SafeRequestError(
          `HTTP ${res.status} at ${step}`,
          lastMeta,
        );
      }
      return { json: JSON.parse(text), meta: lastMeta, text };
    }

    return { json: null, meta: lastMeta, text, ok: res.ok };
  }

  throw new SafeRequestError(`Exhausted retries at ${step}`, lastMeta);
}
