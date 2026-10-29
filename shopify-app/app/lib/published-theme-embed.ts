import { readPublishedThemeEmbedStatus, type PublishedThemeEmbedStatus, type ThemeExtensionRecord } from "./theme-embed-deeplink";
import type { DiagnosticCheck } from "./compatibility-diagnostics";

export type EmbedCheckState = PublishedThemeEmbedStatus | "checking" | "error" | "unknown";
export type EmbedStatusApi = { app?: { extensions?: () => Promise<ThemeExtensionRecord[]> } };

export function withPublishedThemeEmbedCheck(checks: readonly DiagnosticCheck[], state: EmbedCheckState): DiagnosticCheck[] {
  const status: DiagnosticCheck["status"] = state === "active" ? "pass"
    : state === "available" ? "warn"
    : state === "missing" || state === "unavailable" ? "fail" : "unable_to_verify";
  const embed: DiagnosticCheck = {
    id: "theme_app_embed", label: "Published theme app embed", status,
    explanation: EMBED_STATUS_COPY[state],
    merchantAction: state === "active" ? null : "Open Theme setup, check the published theme, and retry.",
    technicalDetails: "source=App Bridge;theme=published",
  };
  return [...checks.filter((check) => check.id !== embed.id), embed];
}

/** Campaign home stays hidden only when Shopify reports the embed is not turned on. */
export function homeThemeGate(status: EmbedCheckState): "checking" | "setup" | "ready" {
  if (status === "checking" || status === "unknown") return "checking";
  if (status === "available" || status === "unavailable") return "setup";
  return "ready";
}

export const EMBED_STATUS_COPY: Record<EmbedCheckState, string> = {
  active: "UpsellTrix is enabled on the published theme.",
  available: "The embed is installed but disabled on the published theme. Enable it in App embeds and save.",
  unavailable: "The embed is installed but unavailable on the published theme. Check its availability settings.",
  missing: "Shopify did not report this app's embed. Check the released theme extension.",
  checking: "Checking the published theme.",
  error: "Could not verify the published theme. Retry the check.",
  unknown: "The published theme has not been checked.",
};

/** Read-only App Bridge lookup. No credentials, theme writes, or additional scopes. */
export async function loadPublishedThemeEmbedStatus(
  api: EmbedStatusApi | undefined,
  timeoutMs = 10_000,
): Promise<PublishedThemeEmbedStatus> {
  if (!api?.app?.extensions) throw new Error("Extension status API unavailable.");
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const extensions = await Promise.race([
      api.app.extensions(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Extension status check timed out.")), timeoutMs);
      }),
    ]);
    return readPublishedThemeEmbedStatus(extensions);
  } finally {
    clearTimeout(timeout);
  }
}
