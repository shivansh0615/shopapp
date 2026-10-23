import { useCallback, useEffect, useRef, useState } from "react";
import { loadPublishedThemeEmbedStatus, type EmbedCheckState, type EmbedStatusApi } from "../../lib/published-theme-embed";

export function usePublishedThemeEmbedStatus() {
  const [status, setStatus] = useState<EmbedCheckState>("unknown");
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    setStatus("checking");
    try {
      const shopify = (window as Window & { shopify?: EmbedStatusApi }).shopify;
      const next = await loadPublishedThemeEmbedStatus(shopify);
      if (request === sequence.current) setStatus(next);
    } catch {
      if (request === sequence.current) setStatus("error");
    }
  }, []);

  useEffect(() => {
    const onFocus = () => { void refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sequence.current += 1;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return { status, refresh };
}
