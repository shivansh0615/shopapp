import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Link, useFetcher, useLocation } from "react-router";

type CampaignActionsMenuProps = {
  campaignId: number;
  status: string;
  canActivate?: boolean;
};

export function CampaignActionsMenu({
  campaignId,
  status,
  canActivate = true,
}: CampaignActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const location = useLocation();
  const deleteFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const campaignsAction = `/app/campaigns${location.search}`;

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setPanelStyle(undefined);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 168;
    const left = Math.min(
      Math.max(8, rect.right - panelWidth),
      window.innerWidth - panelWidth - 8,
    );
    setPanelStyle({
      position: "fixed",
      top: rect.bottom + 4,
      left,
      right: "auto",
      zIndex: 1000,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (statusFetcher.state === "idle" && statusFetcher.data != null) {
      setOpen(false);
    }
  }, [statusFetcher.state, statusFetcher.data]);

  const busy =
    deleteFetcher.state !== "idle" || statusFetcher.state !== "idle";

  return (
    <div className="fgpb-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="fgpb-menu__trigger"
        aria-label="Campaign actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        ···
      </button>
      {open ? (
        <div className="fgpb-menu__panel" role="menu" id={menuId} style={panelStyle}>
          <Link
            role="menuitem"
            className="fgpb-menu__item"
            to={{ pathname: `/app/campaigns/${campaignId}`, search: location.search }}
            onClick={() => setOpen(false)}
          >
            Edit
          </Link>
          {status !== "ACTIVE" ? (
            <statusFetcher.Form method="post" action={campaignsAction}>
              <input type="hidden" name="intent" value="activate" />
              <input type="hidden" name="campaignId" value={campaignId} />
              <button
                type="submit"
                role="menuitem"
                className="fgpb-menu__item"
                disabled={!canActivate || busy}
              >
                {busy ? "Working…" : "Activate"}
              </button>
            </statusFetcher.Form>
          ) : (
            <statusFetcher.Form method="post" action={campaignsAction}>
              <input type="hidden" name="intent" value="pause" />
              <input type="hidden" name="campaignId" value={campaignId} />
              <button type="submit" role="menuitem" className="fgpb-menu__item" disabled={busy}>
                {busy ? "Pausing…" : "Pause"}
              </button>
            </statusFetcher.Form>
          )}
          <deleteFetcher.Form
            method="post"
            action={campaignsAction}
            onSubmit={(event) => {
              if (!window.confirm("Delete this campaign? This cannot be undone.")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="intent" value="delete" />
            <input type="hidden" name="campaignId" value={campaignId} />
            <button
              type="submit"
              role="menuitem"
              className="fgpb-menu__item fgpb-menu__item--danger"
              disabled={busy}
            >
              {busy && deleteFetcher.state !== "idle" ? "Deleting…" : "Delete"}
            </button>
          </deleteFetcher.Form>
        </div>
      ) : null}
    </div>
  );
}

/** Kept for any remaining Form-based deletes (edit page etc.). */
export function CampaignDeleteButton({ campaignId }: { campaignId: number }) {
  const fetcher = useFetcher();
  const location = useLocation();
  const deleting = fetcher.state !== "idle";

  return (
    <fetcher.Form method="post" action={`/app/campaigns${location.search}`}>
      <input type="hidden" name="intent" value="delete" />
      <input type="hidden" name="campaignId" value={campaignId} />
      <button
        type="submit"
        className="fgpb-btn fgpb-btn--secondary fgpb-btn--sm"
        disabled={deleting}
        onClick={(event) => {
          if (!window.confirm("Delete this campaign? This cannot be undone.")) {
            event.preventDefault();
          }
        }}
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </fetcher.Form>
  );
}
