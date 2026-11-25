"use client";

import { useEffect, useState } from "react";
import { editionNow, useUiLang } from "../lib/i18n";
import BulletinPlayer, { type PlayerBulletin } from "./BulletinPlayer";
import Flag from "./Flag";

type L = { fr: string; en: string };
interface Props {
  countries: { id: string; label: L }[];
  themes: { id: string; label: L }[];
  personas: { id: string; label: string; description: L }[];
  featured: Record<string, L | null>;
}
const PREFS = "flash-info:prefs";

export default function Home({ countries, themes, personas, featured }: Props) {
  const [ui, , t] = useUiLang();
  const [country, setCountry] = useState("FR");
  const [theme, setTheme] = useState("generaliste");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [duration, setDuration] = useState<"court" | "standard">("court");
  const [persona, setPersona] = useState(personas[0].id);
  const [bulletin, setBulletin] = useState<(PlayerBulletin & { country: string; theme: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    try {
      const p = JSON.parse(localStorage.getItem(PREFS) ?? "{}");
      if (p.country) setCountry(p.country);
      if (p.theme) setTheme(p.theme);
      if (p.lang) setLang(p.lang);
      if (p.duration) setDuration(p.duration);
      if (p.persona) setPersona(p.persona);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFS, JSON.stringify({ country, theme, lang, duration, persona })); } catch {}
  }, [country, theme, lang, duration, persona]);
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(() => setStep((s) => Math.min(s + 1, t.preparing.length - 1)), 9000);
    return () => clearInterval(id);
  }, [loading, t.preparing.length]);

  const themeLabel = (id: string, l: "fr" | "en" = ui) => {
    const th = themes.find((x) => x.id === id)!;
    if (id === "a_la_une" && featured[country]) return `${th.label[l]} · ${featured[country]![l]}`;
    return th.label[l];
  };
  const countryLabel = (id: string) => countries.find((c) => c.id === id)!.label[ui];

  async function listen() {
    setLoading(true); setStep(0); setError(null); setBulletin(null);
    try {
      const q = new URLSearchParams({ country, theme, lang, duration });
      const r = await fetch(`/api/bulletin?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erreur");
      setBulletin(d);
      setTimeout(() => document.getElementById("lecteur")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const pill = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-medium transition border ${active ? "bg-ink text-paper border-ink" : "border-line text-ink-soft hover:text-ink hover:border-ink-soft"}`;
  const label = "text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft";
  const personaObj = personas.find((p) => p.id === persona)!;

  return (
    <div className="space-y-8">
      {/* En-tête de l'édition */}
      <section className="pt-2">
        <p className={label}>
          {now ? new Intl.DateTimeFormat(ui === "fr" ? "fr-FR" : "en-GB", { weekday: "long", day: "numeric", month: "long" }).format(now) : " "}
          {now && <> · <span className="text-accent">{t.edition[editionNow(now)]}</span></>}
        </p>
        <h1 className="mt-3 text-[2.1rem] sm:text-5xl font-semibold tracking-[-0.03em] leading-[1.05]">{t.tagline}</h1>
        <p className="mt-3 text-ink-soft max-w-xl leading-relaxed">{t.subtitle}</p>
      </section>

      {/* Réglages */}
      <section className="space-y-6">
        <div>
          <p className={label}>{t.country}</p>
          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {countries.map((c) => (
              <button key={c.id} onClick={() => setCountry(c.id)} aria-pressed={country === c.id}
                className={`flex items-center gap-2.5 rounded-2xl border px-3.5 py-3 text-sm font-medium transition ${country === c.id ? "border-accent bg-accent-soft text-ink" : "border-line bg-card text-ink-soft hover:text-ink"}`}>
                <Flag code={c.id} /> {c.label[ui]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={label}>{t.theme}</p>
          <div className="mt-2.5 -mx-5 px-5 flex gap-2 overflow-x-auto scrollbar-none sm:flex-wrap sm:overflow-visible">
            {themes.filter((x) => x.id !== "a_la_une" || featured[country]).map((x) => (
              <button key={x.id} onClick={() => setTheme(x.id)} aria-pressed={theme === x.id} className={pill(theme === x.id)}>
                {x.id === "a_la_une" && <span className="mr-1.5 inline-block w-1.5 h-1.5 rounded-full bg-accent align-middle" />}
                {themeLabel(x.id)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className={label}>{t.podcastLang}</p>
            <div className="mt-2.5 flex rounded-full border border-line p-1 bg-card">
              {(["fr", "en"] as const).map((l) => (
                <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l}
                  className={`flex-1 rounded-full py-1.5 text-sm font-medium ${lang === l ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}>{l === "fr" ? "Français" : "English"}</button>
              ))}
            </div>
          </div>
          <div>
            <p className={label}>{t.duration}</p>
            <div className="mt-2.5 flex rounded-full border border-line p-1 bg-card">
              {(["court", "standard"] as const).map((d) => (
                <button key={d} onClick={() => setDuration(d)} aria-pressed={duration === d}
                  className={`flex-1 rounded-full py-1.5 text-sm font-medium tabular ${duration === d ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}>{d === "court" ? t.short : t.standard}</button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className={label}>{t.voice}</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {personas.map((p) => (
              <button key={p.id} onClick={() => setPersona(p.id)} aria-pressed={persona === p.id}
                className={`text-left rounded-2xl border px-4 py-3 transition ${persona === p.id ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-ink-soft"}`}>
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-xs text-ink-soft mt-0.5">{p.description[ui]}</span>
              </button>
            ))}
          </div>
        </div>

        <button onClick={listen} disabled={loading}
          className={`w-full flex items-center justify-center gap-3 rounded-2xl bg-accent text-white py-4 text-base font-semibold tracking-tight hover:brightness-110 active:scale-[0.99] transition disabled:opacity-80 ${loading ? "pulse" : ""}`}>
          {loading ? (
            <><span className="w-5 h-5 rounded-full border-[3px] border-white/90 border-t-transparent animate-spin" /> {t.preparing[step]}</>
          ) : (
            <><svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg> {t.listen}</>
          )}
        </button>
        {loading && <p className="-mt-3 text-center text-xs text-ink-soft">{t.firstTime}</p>}
        {error && (
          <div className="rounded-2xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={listen} className="shrink-0 underline underline-offset-2">{t.retry}</button>
          </div>
        )}
      </section>

      {bulletin && (
        <section id="lecteur" className="scroll-mt-6">
          <BulletinPlayer
            bulletin={bulletin}
            persona={persona}
            personaLabel={personaObj.label}
            heading={`${countryLabel(bulletin.country)} · ${themeLabel(bulletin.theme)}`}
            t={t}
            autoPlay
          />
        </section>
      )}
    </div>
  );
}
