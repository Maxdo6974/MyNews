"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Bulletin as CoreBulletin } from "@flash-info/core";
import AudioPlayer from "./AudioPlayer";

type Bulletin = CoreBulletin & { bulletinId?: number; voiceAvailable?: boolean };

type Option = { id: string; label: string };
interface Props {
  countries: (Option & { flag: string })[];
  themes: Option[];
  personas: (Option & { description: string })[];
  featured: Record<string, string | null>;
}

const SPEEDS = [0.8, 1, 1.25, 1.5];
const PREFS_KEY = "flash-info:prefs";

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: Option[];
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-wider text-ink-soft mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-lg border border-line bg-card px-3 py-2.5 text-sm font-medium"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function Player({ countries, themes: baseThemes, personas, featured }: Props) {
  const [country, setCountry] = useState("FR");
  const [theme, setTheme] = useState("generaliste");
  const [lang, setLang] = useState<"fr" | "en">("fr");
  const [persona, setPersona] = useState(personas[0].id);
  const [duration, setDuration] = useState<"court" | "standard">("standard");
  const [bulletin, setBulletin] = useState<Bulletin | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [ttsAvailable, setTtsAvailable] = useState(true);
  const runId = useRef(0);
  const themes = baseThemes.map((t) =>
    t.id === "a_la_une" && featured[country] ? { ...t, label: `À la une : ${featured[country]}` } : t);

  // Préférences mémorisées (stockage local, facultatif)
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (p.country) setCountry(p.country);
      if (p.theme) setTheme(p.theme);
      if (p.lang) setLang(p.lang);
      if (p.persona) setPersona(p.persona);
      if (p.duration) setDuration(p.duration);
    } catch {}
    setTtsAvailable(typeof window !== "undefined" && "speechSynthesis" in window);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify({ country, theme, lang, persona, duration })); } catch {}
  }, [country, theme, lang, persona, duration]);

  const segments = useMemo(() => {
    if (!bulletin) return [];
    return [
      { title: lang === "fr" ? "Ouverture" : "Opening", text: bulletin.intro },
      ...bulletin.chapters.map((c) => ({ title: c.title, text: c.text })),
      { title: lang === "fr" ? "Clôture" : "Closing", text: bulletin.outro },
    ];
  }, [bulletin, lang]);

  const stop = useCallback(() => {
    runId.current++;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(false);
    setPaused(false);
  }, []);

  const playFrom = useCallback((index: number, rate = speed) => {
    if (!segments.length || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const id = ++runId.current;
    const synth = window.speechSynthesis;
    const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
    const voice = voices[persona === "persona_a" ? 0 : Math.min(1, voices.length - 1)];

    const speak = (i: number) => {
      if (id !== runId.current) return;
      if (i >= segments.length) { setPlaying(false); setCurrent(-1); return; }
      setCurrent(i);
      const u = new SpeechSynthesisUtterance(segments[i].text);
      u.lang = lang === "fr" ? "fr-FR" : "en-GB";
      if (voice) u.voice = voice;
      u.rate = rate;
      u.pitch = persona === "persona_a" ? 0.8 : 1.05;
      u.onend = () => setTimeout(() => speak(i + 1), 450);
      synth.speak(u);
    };
    setPlaying(true);
    setPaused(false);
    speak(index);
  }, [segments, lang, persona, speed]);

  useEffect(() => () => stop(), [stop]);

  async function generate() {
    stop();
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ country, theme, lang, duration });
      const res = await fetch(`/api/bulletin?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      setBulletin(data);
      setCurrent(-1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function togglePlay() {
    if (!playing) return playFrom(current >= 0 ? current : 0);
    if (paused) { window.speechSynthesis.resume(); setPaused(false); }
    else { window.speechSynthesis.pause(); setPaused(true); }
  }

  const progress = segments.length && current >= 0 ? ((current + 1) / segments.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-4">
          <Select label="Pays" value={country} onChange={setCountry}
            options={countries.map((c) => ({ id: c.id, label: `${c.flag}  ${c.label}` }))} />
          <Select label="Thème" value={theme} onChange={setTheme} options={themes} />
          <Select label="Langue" value={lang} onChange={(v) => setLang(v as "fr" | "en")}
            options={[{ id: "fr", label: "Français" }, { id: "en", label: "English" }]} />
          <Select label="Durée" value={duration} onChange={(v) => setDuration(v as "court" | "standard")}
            options={[{ id: "court", label: "Court · 2 min" }, { id: "standard", label: "Standard · 3 min" }]} />
        </div>

        <fieldset className="mt-5">
          <legend className="text-xs font-medium uppercase tracking-wider text-ink-soft mb-1.5">Voix</legend>
          <div className="grid grid-cols-2 gap-3">
            {personas.map((p) => (
              <button key={p.id} type="button" onClick={() => setPersona(p.id)} aria-pressed={persona === p.id}
                className={`text-left rounded-lg border px-3 py-2.5 transition ${persona === p.id ? "border-ink bg-paper" : "border-line hover:border-ink-soft"}`}>
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-xs text-ink-soft mt-0.5">{p.description}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <button onClick={generate} disabled={loading}
          className="mt-6 w-full rounded-xl bg-accent text-white py-3.5 font-semibold tracking-tight hover:opacity-95 disabled:opacity-60">
          {loading ? "Préparation du bulletin (jusqu'à 1 min)…" : "Générer mon flash"}
        </button>
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}
      </section>

      {bulletin && (
        <section className="rounded-2xl border border-line bg-card p-5 sm:p-6">
          {!bulletin.isDemo && bulletin.voiceAvailable && bulletin.bulletinId ? (
            <AudioPlayer
              bulletinId={bulletin.bulletinId}
              persona={persona}
              personaLabel={personas.find((p) => p.id === persona)?.label ?? ""}
              heading={`${countries.find((c) => c.id === bulletin.country)?.label} · ${themes.find((t) => t.id === bulletin.theme)?.label}`}
              transcript={segments.map((x) => x.text)}
            />
          ) : (
            <>
          <div className="flex items-center gap-4">
            <button onClick={togglePlay} disabled={!ttsAvailable}
              aria-label={playing && !paused ? "Pause" : "Lecture"}
              className="shrink-0 w-14 h-14 rounded-full bg-ink text-paper grid place-items-center text-xl disabled:opacity-40">
              {playing && !paused ? "❚❚" : "▶"}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-wider text-ink-soft">
                {countries.find((c) => c.id === bulletin.country)?.label} · {themes.find((t) => t.id === bulletin.theme)?.label}
              </p>
              <p className="font-semibold truncate">{current >= 0 ? segments[current]?.title : "Prêt à écouter"}</p>
              <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <button onClick={() => playFrom(Math.max(0, current - 1))} disabled={!playing}
              className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">⟲ Sujet précédent</button>
            <button onClick={() => playFrom(Math.min(segments.length - 1, current + 1))} disabled={!playing}
              className="rounded-md border border-line px-2.5 py-1 disabled:opacity-40">Sujet suivant ⟳</button>
            <span className="ml-auto flex items-center gap-1">
              {SPEEDS.map((s) => (
                <button key={s} onClick={() => { setSpeed(s); if (playing) playFrom(Math.max(current, 0), s); }}
                  className={`rounded-md px-2 py-1 ${speed === s ? "bg-ink text-paper" : "border border-line"}`}>{s}×</button>
              ))}
            </span>
          </div>

          <p className="mt-4 text-xs text-ink-soft rounded-md bg-paper px-3 py-2">
            {ttsAvailable
              ? "Aperçu lu par la voix de votre navigateur. Les voix réalistes sont utilisées pour les vrais bulletins."
              : "Votre navigateur ne permet pas la lecture vocale. La transcription reste disponible."}
          </p>

          <ol className="mt-6 space-y-4">
            {segments.map((s, i) => (
              <li key={i}>
                <button onClick={() => playFrom(i)} className={`text-left w-full rounded-lg p-3 -m-3 ${current === i ? "bg-accent-soft" : "hover:bg-paper"}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{s.title}</span>
                  <span className="block mt-1 leading-relaxed">{s.text}</span>
                </button>
              </li>
            ))}
          </ol>

            </>
          )}

          <details className="mt-6 border-t border-line pt-4 text-sm">
            <summary className="cursor-pointer font-medium">Sources</summary>
            <p className="mt-2 text-ink-soft">
              {bulletin.isDemo ? "Bulletin de démonstration : aucune source." : `${bulletin.chapters.length} sujets, ${new Set(bulletin.chapters.flatMap((c) => c.sources.map((s) => s.url))).size} articles.`}
            </p>
            {!bulletin.isDemo && (
              <ul className="mt-3 space-y-3">
                {bulletin.chapters.map((c, i) => (
                  <li key={i}>
                    <p className="font-medium">{c.title}</p>
                    <ul className="mt-1 space-y-0.5">
                      {c.sources.map((s, k) => (
                        <li key={k} className="text-ink-soft">
                          {s.nom} — <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">{s.title ?? "article"}</a>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </section>
      )}
    </div>
  );
}
