/**
 * Classify HTTP responses before JSON parsing.
 */

import { redactPreview } from "./redact.mjs";

export const RESPONSE_KINDS = {
  JSON: "JSON",
  HTML_PASSWORD: "HTML_PASSWORD",
  HTML_LOGIN: "HTML_LOGIN",
  HTML_BOT_CHALLENGE: "HTML_BOT_CHALLENGE",
  HTML_RATE_LIMIT: "HTML_RATE_LIMIT",
  HTML_ERROR: "HTML_ERROR",
  HTML_OTHER: "HTML_OTHER",
  EMPTY: "EMPTY",
  MALFORMED_JSON: "MALFORMED_JSON",
  UNKNOWN: "UNKNOWN",
};

export function classifyBody(status, contentType, text) {
  const body = String(text || "");
  const ct = String(contentType || "").toLowerCase();
  const lower = body.toLowerCase();
  const preview = redactPreview(body);

  if (!body.trim()) {
    return { kind: RESPONSE_KINDS.EMPTY, retryable: status >= 500, preview };
  }

  if (ct.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[")) {
    try {
      JSON.parse(body);
      return { kind: RESPONSE_KINDS.JSON, retryable: false, preview: null };
    } catch {
      return {
        kind: RESPONSE_KINDS.MALFORMED_JSON,
        retryable: false,
        preview,
      };
    }
  }

  if (
    lower.includes("name=\"password\"") ||
    lower.includes("storefront_password") ||
    lower.includes("/password")
  ) {
    return { kind: RESPONSE_KINDS.HTML_PASSWORD, retryable: false, preview };
  }
  if (lower.includes("customer_login") || lower.includes("/account/login")) {
    return { kind: RESPONSE_KINDS.HTML_LOGIN, retryable: false, preview };
  }
  if (
    lower.includes("captcha") ||
    lower.includes("challenge") ||
    lower.includes("cf-browser-verification")
  ) {
    return { kind: RESPONSE_KINDS.HTML_BOT_CHALLENGE, retryable: true, preview };
  }
  if (status === 429 || lower.includes("too many requests") || lower.includes("rate limit")) {
    return { kind: RESPONSE_KINDS.HTML_RATE_LIMIT, retryable: true, preview };
  }
  if (status >= 500 || lower.includes("application error") || lower.includes("proxy error")) {
    return { kind: RESPONSE_KINDS.HTML_ERROR, retryable: true, preview };
  }
  if (ct.includes("html") || body.trim().startsWith("<")) {
    return { kind: RESPONSE_KINDS.HTML_OTHER, retryable: false, preview };
  }
  return { kind: RESPONSE_KINDS.UNKNOWN, retryable: status >= 500, preview };
}

export function isRetryableTransport(status, kind) {
  if (status === 429 || status === 503 || status === 502 || status === 504) return true;
  return (
    kind === RESPONSE_KINDS.HTML_RATE_LIMIT ||
    kind === RESPONSE_KINDS.HTML_BOT_CHALLENGE ||
    kind === RESPONSE_KINDS.HTML_ERROR
  );
}
