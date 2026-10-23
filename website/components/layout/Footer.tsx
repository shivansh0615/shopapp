import { SITE, FOOTER_LINKS } from "@/lib/constants";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="overflow-x-clip border-t border-[var(--border)] bg-[var(--surface-wine)] pb-[env(safe-area-inset-bottom)]">
      <div className="page-shell flex flex-col gap-8 py-10 md:flex-row md:items-center md:justify-between md:py-14">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
          <p className="font-display text-xl tracking-[-0.02em] text-white">
            {SITE.name}
          </p>
          <p className="text-sm leading-[1.55] text-[var(--muted-foreground)]">
            © {new Date().getFullYear()} {SITE.name}
          </p>
          <a
            href={`mailto:${SITE.contactEmail}`}
            className="inline-flex min-h-11 min-w-0 items-center break-all text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
          >
            {SITE.contactEmail}
          </a>
        </div>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {FOOTER_LINKS.map((link) => (
            <li key={link.label}>
              <Link
                href={link.href}
                className="inline-flex min-h-11 items-center text-sm text-[var(--muted-foreground)] transition-colors duration-300 hover:text-[var(--accent)]"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </footer>
  );
}
