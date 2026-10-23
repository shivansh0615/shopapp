import { redirect } from "react-router";
import type { MerchantDiscountSyncResult } from "../services/discount-sync.server";

/** Query param used for post-action merchant feedback. */
export const MERCHANT_NOTICE_PARAM = "notice";

export type MerchantNoticeCode =
  | "saved"
  | "activated"
  | "paused"
  | "deleted"
  | "duplicated"
  | "sync_pending"
  | "sync_failed"
  | "settings_saved";

const EMBEDDED_PARAMS = ["shop", "host", "embedded", "id_token", "locale", "session"] as const;

export type MerchantNoticeTone = "success" | "warning" | "critical" | "info";

export type MerchantNoticeCopy = {
  tone: MerchantNoticeTone;
  title: string;
  body: string;
  recovery?: string;
};

const NOTICE_COPY: Record<MerchantNoticeCode, MerchantNoticeCopy> = {
  saved: {
    tone: "success",
    title: "Campaign saved",
    body: "Your changes are stored. Activate the campaign when you are ready for it to run on the storefront.",
  },
  activated: {
    tone: "success",
    title: "Campaign activated",
    body: "The promotion is live in the app. Enable the theme app embed, then open your storefront to confirm the progress bar appears.",
    recovery: "Open Widgets for the theme embed deep link and connection check.",
  },
  paused: {
    tone: "success",
    title: "Campaign paused",
    body: "Shoppers will no longer unlock this promotion until you activate it again.",
  },
  deleted: {
    tone: "success",
    title: "Campaign deleted",
    body: "The campaign was removed from your workspace.",
  },
  duplicated: {
    tone: "success",
    title: "Campaign duplicated",
    body: "A copy was created as a draft. Review it, then activate when ready.",
  },
  sync_pending: {
    tone: "warning",
    title: "Saved — discount sync is catching up",
    body: "Your campaign changes were saved. Shopify discount synchronization is still finishing in the background.",
    recovery: "Wait a minute, then preview the storefront. If gifts still look wrong, open Theme setup and confirm the embed is enabled.",
  },
  sync_failed: {
    tone: "critical",
    title: "Saved — discount sync needs attention",
    body: "Your campaign changes were saved, but Shopify discount synchronization could not finish.",
    recovery: "Open Theme setup, confirm the embed is enabled, and try saving the campaign again. Contact support if it keeps failing.",
  },
  settings_saved: {
    tone: "success",
    title: "Settings saved",
    body: "Defaults and widget colors will apply to new campaigns and storefront styling where configured.",
  },
};

export function isMerchantNoticeCode(value: string | null | undefined): value is MerchantNoticeCode {
  return Boolean(value && value in NOTICE_COPY);
}

export function getMerchantNoticeCopy(code: MerchantNoticeCode): MerchantNoticeCopy {
  return NOTICE_COPY[code];
}

/** Preserve embedded-app query params and attach a merchant notice. */
export function buildPathWithNotice(
  pathname: string,
  requestUrl: string,
  notice: MerchantNoticeCode,
): string {
  const base = new URL(pathname, "https://upselltrix.invalid");
  const src = new URL(requestUrl);
  for (const key of EMBEDDED_PARAMS) {
    const value = src.searchParams.get(key);
    if (value) base.searchParams.set(key, value);
  }
  // Keep other non-router flags from the destination if already present in pathname query.
  base.searchParams.set(MERCHANT_NOTICE_PARAM, notice);
  const search = base.searchParams.toString();
  return search ? `${base.pathname}?${search}` : base.pathname;
}

export function noticeFromSync(
  sync: MerchantDiscountSyncResult,
  successNotice: MerchantNoticeCode,
): MerchantNoticeCode {
  if (sync.status === "pending") return "sync_pending";
  if (sync.status === "failed") return "sync_failed";
  return successNotice;
}

/** Redirect after a successful campaign DB write + discount sync attempt. */
export function redirectWithSyncNotice(
  pathname: string,
  request: Request,
  sync: MerchantDiscountSyncResult,
  successNotice: MerchantNoticeCode,
) {
  return redirect(buildPathWithNotice(pathname, request.url, noticeFromSync(sync, successNotice)));
}

export function redirectWithNotice(pathname: string, request: Request, notice: MerchantNoticeCode) {
  return redirect(buildPathWithNotice(pathname, request.url, notice));
}
