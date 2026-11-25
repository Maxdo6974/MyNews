"use client";

import Link from "next/link";
import { useState } from "react";
import BulletinPlayer, { type PlayerBulletin } from "../../components/BulletinPlayer";
import Flag from "../../components/Flag";
import { useUiLang } from "../../lib/i18n";

type L = { fr: string; en: string };

export default function BulletinView({ bulletin, initialPersona, personas, countries, themes }: {
  bulletin: PlayerBulletin & { country: string; theme: string; createdAt: string };
  initialPersona: string;
  personas: { id: string; label: string }[];
  countries: { id: string; label: L }[];
  themes: { id: string; label: L }[];
}) {
  const [ui, , t] = useUiLang();
  const [persona, setPersona] = useState(initialPersona);
  const heading = `${countries.find((c) => c.id === bulletin.country)?.label[ui]} · ${themes.find((x) => x.id === bulletin.theme)?.label[ui]}`;
  const date = new Intl.DateTimeFormat(ui === "fr" ? "fr-FR" : "en-GB", { dateStyle: "full", timeStyle: "short" }).format(new Date(bulletin.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
          <Flag code={bulletin.country} className="w-4 h-3" /> {t.generatedAt} {date}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em] leading-tight">{bulletin.chapters.map((c) => c.title).join(" · ")}</h1>
      </div>
      <div className="flex rounded-full border border-line p-1 bg-card w-fit">
        {personas.map((p) => (
          <button key={p.id} onClick={() => setPersona(p.id)} aria-pressed={persona === p.id}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${persona === p.id ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}>{p.label}</button>
        ))}
      </div>
      <BulletinPlayer bulletin={bulletin} persona={persona} personaLabel={personas.find((p) => p.id === persona)!.label} heading={heading} t={t} />
      <Link href="/" className="inline-block text-sm text-ink-soft hover:text-ink">← {t.listen}</Link>
    </div>
  );
}
