import { EMBED_STATUS_COPY } from "../../lib/published-theme-embed";
import { usePublishedThemeEmbedStatus } from "./usePublishedThemeEmbedStatus";

export function ThemeEmbedStatus() {
  const { status, refresh } = usePublishedThemeEmbedStatus();

  return (
    <div className="ut-theme-step__note" style={{ display: "grid", gap: 8 }}>
      <p style={{ margin: 0 }} role="status" aria-live="polite">{EMBED_STATUS_COPY[status]}</p>
      <p style={{ margin: 0 }}>This check covers the published theme. Draft previews are separate.</p>
      <button type="button" className="fgpb-btn fgpb-btn--secondary fgpb-btn--sm" disabled={status === "checking"} onClick={() => void refresh()}>
        {status === "checking" ? "Checking…" : "Check embed status"}
      </button>
    </div>
  );
}
