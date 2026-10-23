import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  status?: ReactNode;
};

export function PageHeader({ eyebrow, title, subtitle, actions, status }: PageHeaderProps) {
  return (
    <header className="fgpb-page-header">
      <div>
        {eyebrow ? <p className="fgpb-page-header__eyebrow">{eyebrow}</p> : null}
        <div className="fgpb-page-header__title-row">
          <h1 className="fgpb-page-header__title">{title}</h1>
          {status ? <div className="fgpb-page-header__meta">{status}</div> : null}
        </div>
        {subtitle ? <p className="fgpb-page-header__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{actions}</div>
      ) : null}
    </header>
  );
}
