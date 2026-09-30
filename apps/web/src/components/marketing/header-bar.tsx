"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "@cim/ui";

export type HeaderLink = { href: string; label: string };

/**
 * Sticky, blurred header. Turns from transparent to a glass bar once the
 * page scrolls, and collapses into a disclosure menu below `md` (the old
 * header simply dropped its links on phones).
 */
export function HeaderBar({
  links,
  signIn,
  getStarted,
  homeLabel,
  menuLabel,
  closeLabel,
  languageSwitcher,
}: {
  links: HeaderLink[];
  signIn: string;
  getStarted: string;
  homeLabel: string;
  menuLabel: string;
  closeLabel: string;
  languageSwitcher?: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className="sticky top-0 z-50 border-b transition-colors duration-300"
      style={{
        borderColor: scrolled || open ? "var(--mk-line)" : "transparent",
        background: scrolled || open ? "rgb(8 9 22 / 0.72)" : "transparent",
        backdropFilter: scrolled || open ? "blur(16px) saturate(1.4)" : "none",
      }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" aria-label={homeLabel} className="text-lg text-white">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-[var(--mk-muted)] transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {languageSwitcher}
          <Link href="/login" className="mk-btn mk-btn-ghost mk-btn-sm hidden sm:inline-flex">
            {signIn}
          </Link>
          <Link href="/register" className="mk-btn mk-btn-primary mk-btn-sm">
            {getStarted}
          </Link>
          <button
            type="button"
            className="mk-btn mk-btn-ghost mk-btn-sm px-3 md:hidden"
            aria-expanded={open}
            aria-controls="mk-mobile-menu"
            aria-label={open ? closeLabel : menuLabel}
            onClick={() => setOpen((value) => !value)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mk-mobile-menu" aria-label="Mobile" className="border-t border-[var(--mk-line)] px-4 pb-5 pt-3 md:hidden">
          <ul className="flex flex-col">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-3 text-base font-medium text-zinc-100 hover:bg-white/5"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="mt-2">
              <Link href="/login" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 text-base font-medium text-zinc-100 hover:bg-white/5">
                {signIn}
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
