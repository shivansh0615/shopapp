import { EMBED_STATUS_COPY } from "../../lib/published-theme-embed";
import { usePublishedThemeEmbedStatus } from "./usePublishedThemeEmbedStatus";

export function ThemeEmbedStatus() {
  const { status, refresh } = usePublishedThemeEmbedStatus();
  const enabled = status === "active";

  return (
    <div className="fgpb-embed-status">
      {enabled ? (
        <p className="fgpb-embed-status__on" role="status" aria-live="polite">
          <span className="fgpb-embed-status__tick" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M6.5 12.5 10 16l7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            <strong>Embed is on</strong>
            <span>UpsellTrix is enabled on the published theme.</span>
          </span>
        </p>
      ) : (
        <p className="fgpb-embed-status__line" role="status" aria-live="polite">{EMBED_STATUS_COPY[status]}</p>
      )}
      <p className="fgpb-embed-status__line">This check covers the published theme. Draft previews are separate.</p>
      <button type="button" className="fgpb-btn fgpb-btn--secondary fgpb-btn--sm" disabled={status === "checking"} onClick={() => void refresh()}>
        {status === "checking" ? "Checking…" : "Check embed status"}
      </button>
    </div>
  );
}
