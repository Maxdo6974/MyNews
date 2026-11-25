"use client";

import Link from "next/link";
import { useUiLang } from "../lib/i18n";

export default function Footer() {
  const [, , t] = useUiLang();
  return (
    <footer className="border-t border-line text-xs text-ink-soft">
      <div className="mx-auto max-w-2xl px-5 py-6 flex flex-col sm:flex-row gap-2 justify-between">
        <span>{t.footer}</span>
        <span className="flex gap-3"><Link href="/test" className="hover:text-ink">Test</Link><span>v0.7</span></span>
      </div>
    </footer>
  );
}
