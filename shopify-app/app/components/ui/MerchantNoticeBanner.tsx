import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import {
  getMerchantNoticeCopy,
  isMerchantNoticeCode,
  MERCHANT_NOTICE_PARAM,
  type MerchantNoticeCode,
} from "../../lib/merchant-notices";

type ShopifyToast = {
  toast?: { show: (message: string, opts?: { isError?: boolean }) => void };
};

function readNotice(searchParams: URLSearchParams): MerchantNoticeCode | null {
  const raw = searchParams.get(MERCHANT_NOTICE_PARAM);
  return isMerchantNoticeCode(raw) ? raw : null;
}

export function MerchantNoticeBanner() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const notice = useMemo(() => readNotice(searchParams), [searchParams]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(false);
  }, [notice]);

  useEffect(() => {
    if (!notice) return;
    const copy = getMerchantNoticeCopy(notice);
    const shopify = (window as unknown as { shopify?: ShopifyToast }).shopify;
    shopify?.toast?.show(copy.title, { isError: copy.tone === "critical" });
  }, [notice]);

  if (!notice || dismissed) return null;

  const copy = getMerchantNoticeCopy(notice);
  const toneClass =
    copy.tone === "success"
      ? "fgpb-notice fgpb-notice--success"
      : copy.tone === "warning"
        ? "fgpb-notice fgpb-notice--warning"
        : copy.tone === "critical"
          ? "fgpb-notice fgpb-notice--critical"
          : "fgpb-notice fgpb-notice--info";

  const dismiss = () => {
    setDismissed(true);
    const next = new URLSearchParams(searchParams);
    next.delete(MERCHANT_NOTICE_PARAM);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className={toneClass} role="status" aria-live="polite">
      <div className="fgpb-notice__body">
        <p className="fgpb-notice__title">{copy.title}</p>
        <p className="fgpb-notice__text">{copy.body}</p>
        {copy.recovery ? <p className="fgpb-notice__recovery">{copy.recovery}</p> : null}
        {notice === "activated" || notice === "sync_pending" ? (
          <p className="fgpb-notice__actions">
            <Link to={{ pathname: "/app/widgets", search: location.search }}>Open theme setup</Link>
          </p>
        ) : null}
      </div>
      <button type="button" className="fgpb-notice__dismiss" onClick={dismiss} aria-label="Dismiss notice">
        Dismiss
      </button>
    </div>
  );
}
