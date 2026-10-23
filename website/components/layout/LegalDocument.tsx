import type { ReactNode } from "react";

export function LegalDocument({
  kicker,
  title,
  description,
  effectiveDate,
  children,
}: {
  kicker: string;
  title: string;
  description?: string;
  effectiveDate?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-w-0 flex-1 overflow-x-clip">
      <article className="relative overflow-x-clip border-b border-[var(--border)] bg-black">
        <div className="hero-atmos pointer-events-none absolute inset-0" />
        <div className="page-shell relative z-10 py-12 md:py-24">
          <p className="hero-kicker">{kicker}</p>
          <h1 className="section-heading mt-4">{title}</h1>
          {description ? (
            <p className="section-lede mt-5 max-w-2xl">{description}</p>
          ) : null}
          {effectiveDate ? (
            <p className="mt-4 text-sm text-[var(--muted-foreground)]">
              Effective date: {effectiveDate}
            </p>
          ) : null}
          <div className="mt-12 max-w-3xl space-y-12">{children}</div>
        </div>
      </article>
    </main>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display text-xl tracking-[-0.02em] text-white md:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-[1.55] text-[var(--muted-foreground)] md:text-base">
        {children}
      </div>
    </section>
  );
}
