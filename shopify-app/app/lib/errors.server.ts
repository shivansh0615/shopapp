/**
 * Backend operational errors — safe for logs, no secrets.
 */

export type ErrorClass = "retryable" | "permanent" | "validation";

export type AppErrorOptions = {
  code: string;
  message: string;
  errorClass?: ErrorClass;
  cause?: unknown;
  details?: Record<string, unknown>;
};

export class AppError extends Error {
  readonly code: string;
  readonly errorClass: ErrorClass;
  readonly details: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = "AppError";
    this.code = options.code;
    this.errorClass = options.errorClass ?? "permanent";
    this.details = options.details ?? {};
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

const SECRET_KEY =
  /^(authorization|cookie|password|secret|token|api[_-]?key|database_url|client_secret)$/i;

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY.test(key)) return "[redacted]";
  if (typeof value === "string" && /postgresql:\/\/|mysql:\/\/|mongodb:\/\//i.test(value)) {
    return "[redacted-url]";
  }
  return value;
}

export function sanitizeLogDetails(
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!details) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

export function serializeErrorForLog(error: unknown): {
  type: string;
  message: string;
  code?: string;
  errorClass?: ErrorClass;
  details?: Record<string, unknown>;
} {
  if (error instanceof AppError) {
    return {
      type: "AppError",
      message: error.message,
      code: error.code,
      errorClass: error.errorClass,
      details: sanitizeLogDetails(error.details),
    };
  }
  if (error instanceof Error) {
    return {
      type: error.name || "Error",
      message: error.message,
    };
  }
  return {
    type: "UnknownError",
    message: typeof error === "string" ? error : "Unknown error",
  };
}

export function logOperationalError(
  scope: string,
  error: unknown,
  details?: Record<string, unknown>,
): void {
  console.error(`[FGPB ${scope}]`, {
    ...serializeErrorForLog(error),
    ...(sanitizeLogDetails(details) ?? {}),
  });
}

function readStructuredStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const obj = error as Record<string, unknown>;
  for (const key of ["status", "statusCode", "httpStatus", "code"] as const) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && /^\d{3}$/.test(value)) return Number(value);
  }
  if (obj.details && typeof obj.details === "object") {
    const details = obj.details as Record<string, unknown>;
    const nested = details.status ?? details.statusCode ?? details.httpStatus;
    if (typeof nested === "number") return nested;
  }
  return null;
}

const RETRYABLE_CODES = new Set([
  "TIMEOUT",
  "UPSTREAM_TIMEOUT",
  "THROTTLED",
  "RATE_LIMITED",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "LOCK_TIMEOUT",
  "LEASE_CONTENTION",
  "DB_CONNECTION",
  "SHOPIFY_5XX",
  "NETWORK",
]);

const PERMANENT_CODES = new Set([
  "UNAUTHORIZED",
  "FORBIDDEN",
  "AUTH_REVOKED",
  "MISSING_SCOPE",
  "CAMPAIGN_NOT_OWNED",
  "CAMPAIGN_NOT_FOUND",
  "INVALID_CONFIG",
  "VALIDATION",
  "MALFORMED_ID",
  "UNSUPPORTED_ACTION",
  "SHOP_REQUIRED",
  "USER_ERROR",
  "NOT_FOUND",
  "TERMINAL",
]);

/**
 * Classify whether a sync/worker error should be retried.
 * Prefer AppError.errorClass and structured status/code over message matching.
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof AppError) {
    if (error.errorClass === "retryable") return true;
    if (error.errorClass === "permanent" || error.errorClass === "validation") {
      return false;
    }
  }

  const status = readStructuredStatus(error);
  if (status === 429 || status === 408) return true;
  if (status != null && status >= 500 && status <= 599) return true;
  if (status === 401 || status === 403 || status === 404) return false;

  const code =
    error instanceof AppError
      ? error.code.toUpperCase()
      : error instanceof Error &&
          typeof (error as unknown as { code?: unknown }).code === "string"
        ? String((error as unknown as { code: string }).code).toUpperCase()
        : null;

  if (code && RETRYABLE_CODES.has(code)) return true;
  if (code && PERMANENT_CODES.has(code)) return false;

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("lock timed out") ||
      msg.includes("lock_timeout") ||
      msg.includes("lease")
    ) {
      return true;
    }
    if (
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("invalid scope") ||
      msg.includes("access denied") ||
      msg.includes("not found")
    ) {
      return false;
    }
    return (
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("eai_again") ||
      msg.includes("429") ||
      msg.includes("503") ||
      msg.includes("502") ||
      msg.includes("504") ||
      msg.includes("throttl") ||
      msg.includes("temporarily unavailable")
    );
  }

  // Unknown non-Error: not retryable forever — treat as non-retryable so
  // markJobFailure terminals after the current attempt (or use bounded unknown retries).
  return false;
}

/**
 * Unknown errors may receive a small bounded retry budget via AppError wrapping.
 * Callers that want bounded-unknown retries should wrap as retryable with code UNKNOWN_TRANSIENT.
 */
export function classifySyncError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const status = readStructuredStatus(error);
  const message = toSafeErrorMessage(error);
  if (status === 429) {
    return new AppError({
      code: "RATE_LIMITED",
      message,
      errorClass: "retryable",
      cause: error,
    });
  }
  if (status != null && status >= 500) {
    return new AppError({
      code: "SHOPIFY_5XX",
      message,
      errorClass: "retryable",
      cause: error,
      details: { status },
    });
  }
  if (status === 401 || status === 403) {
    return new AppError({
      code: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN",
      message,
      errorClass: "permanent",
      cause: error,
      details: { status },
    });
  }
  if (isRetryableError(error)) {
    return new AppError({
      code: errorCodeOf(error, "NETWORK"),
      message,
      errorClass: "retryable",
      cause: error,
    });
  }
  return new AppError({
    code: errorCodeOf(error, "SYNC_FAILED"),
    message,
    errorClass: "permanent",
    cause: error,
  });
}

export function toSafeErrorMessage(error: unknown, maxLen = 240): string {
  const raw =
    error instanceof AppError
      ? error.message
      : error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unknown error";
  const cleaned = raw
    .replace(/postgresql:\/\/\S+/gi, "[redacted-url]")
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/shp(at|ss|ua)_[A-Za-z0-9]+/gi, "[redacted]")
    .replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, "[redacted-email]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

export function errorCodeOf(error: unknown, fallback = "UNKNOWN"): string {
  if (error instanceof AppError) return error.code;
  if (error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string") {
    return String((error as { code: string }).code).toUpperCase();
  }
  if (error instanceof Error && error.name) return error.name.toUpperCase();
  return fallback;
}
