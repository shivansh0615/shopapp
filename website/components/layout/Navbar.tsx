"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NAV_LINKS, SITE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,border-color] duration-300",
        scrolled || open
          ? "border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--surface-wine)_88%,transparent)] backdrop-blur-md"
          : "border-b border-transparent bg-transparent",
      )}
    >
      <nav
        className="page-shell flex h-[var(--nav-height)] items-center justify-between"
        aria-label="Primary"
      >
        <Link
          href="/"
          className="font-display text-[1.2rem] tracking-[-0.02em] text-white transition-colors hover:text-[var(--accent)] md:text-[1.35rem]"
        >
          {SITE.name}
        </Link>

        <ul className="hidden items-center gap-9 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-[12px] font-medium tracking-[0.12em] text-[var(--muted-foreground)] uppercase transition-colors duration-300 hover:text-[var(--accent)]"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden lg:block">
          <Button href="/contact" size="md" className="px-6">
            {SITE.primaryCta}
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] text-white lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </nav>

      <div
        id="mobile-nav"
        hidden={!open}
        className="border-t border-[var(--border)] bg-[var(--surface-wine)] lg:hidden"
      >
        <ul className="page-shell flex flex-col gap-1 py-6">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="flex min-h-11 items-center rounded-xl px-4 py-3 text-[15px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface)] hover:text-white"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            </li>
          ))}
          <li className="pt-4">
            <Button
              href="/contact"
              size="lg"
              className="w-full"
              onClick={() => setOpen(false)}
            >
              {SITE.primaryCta}
            </Button>
          </li>
        </ul>
      </div>
    </header>
  );
}
