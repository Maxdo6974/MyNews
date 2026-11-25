"use client";

import Link from "next/link";
import { useState } from "react";
import Flag from "../components/Flag";
import { useUiLang } from "../lib/i18n";

type L = { fr: string; en: string };
interface Item { id: number; pays: string; theme: string; langue: string; duree: string; createdAt: string; titles: string[]; voices: string[] }

export default function History({ items, countries, themes }: { items: Item[]; countries: { id: string; label: L }[]; themes: { id: string; label: L }[] }) {
  const [ui, , t] = useUiLang();
  const [pays, setPays] = useState("");
  const shown = items.filter((i) => !pays || i.pays === pays);
  const fmt = (iso: string) => new Intl.DateTimeFormat(ui === "fr" ? "fr-FR" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const pill = (a: boolean) => `shrink-0 flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm border ${a ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:text-ink"}`;

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-[-0.02em]">{t.historyTitle}</h1>
      <div className="mt-5 flex gap-2 overflow-x-auto scrollbar-none">
        <button onClick={() => setPays("")} className={pill(!pays)}>{ui === "fr" ? "Tous" : "All"}</button>
        {countries.map((c) => <button key={c.id} onClick={() => setPays(c.id)} className={pill(pays === c.id)}><Flag code={c.id} />{c.label[ui]}</button>)}
      </div>
      <ul className="mt-6 space-y-3">
        {shown.length === 0 && <li className="text-ink-soft">{t.historyEmpty}</li>}
        {shown.map((i) => (
          <li key={i.id}>
            <Link href={`/b/${i.id}?langue=${i.langue}`}
              className="group flex gap-4 rounded-2xl border border-line bg-card p-4 hover:border-ink-soft transition">
              <span className="mt-0.5 w-10 h-10 shrink-0 rounded-full bg-raised grid place-items-center group-hover:bg-accent transition">
                <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                  <Flag code={i.pays} className="w-4 h-3" />
                  <span>{themes.find((x) => x.id === i.theme)?.label[ui]}</span>·<span>{i.langue.toUpperCase()}</span>·<span>{i.duree === "court" ? t.short : t.standard}</span>·<span className="tabular">{fmt(i.createdAt)}</span>
                </span>
                <span className="mt-1.5 block font-medium leading-snug">{i.titles.join(" · ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
