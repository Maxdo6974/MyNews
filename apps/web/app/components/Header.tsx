"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUiLang } from "../lib/i18n";

export default function Header({ demo }: { demo: boolean }) {
  const [lang, setLang, t] = useUiLang();
  const path = usePathname();
  const nav = (href: string, label: string) => (
    <Link href={href} aria-current={path === href ? "page" : undefined}
      className={`px-3 py-1.5 rounded-full text-sm ${path === href ? "text-ink bg-raised" : "text-ink-soft hover:text-ink"}`}>{label}</Link>
  );
  return (
    <>
      {demo && <div className="bg-accent text-white text-xs text-center py-1.5">{t.demo}</div>}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto max-w-2xl px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-bold tracking-[0.14em] text-sm">
            <span className="relative flex w-2.5 h-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 animate-ping motion-reduce:hidden" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-accent" />
            </span>
            FLASH INFO
          </Link>
          <nav className="flex items-center gap-1">
            {nav("/", t.listenNav)}
            {nav("/historique", t.history)}
            <button onClick={() => setLang(lang === "fr" ? "en" : "fr")} aria-label={lang === "fr" ? "Switch to English" : "Passer en français"}
              className="ml-1 rounded-full border border-line px-2.5 py-1 text-xs font-semibold text-ink-soft hover:text-ink">
              {lang === "fr" ? "EN" : "FR"}
            </button>
          </nav>
        </div>
      </header>
    </>
  );
}
