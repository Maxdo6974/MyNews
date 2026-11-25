"use client";

import { useEffect, useRef, useState } from "react";
import type { Dict } from "../lib/i18n";
import Waveform from "./Waveform";

export interface PlayerBulletin {
  bulletinId?: number;
  isDemo: boolean;
  voiceAvailable?: boolean;
  intro: string;
  outro: string;
  chapters: { title: string; text: string; sources: { nom: string; url: string; title?: string }[] }[];
  language: "fr" | "en";
}
interface Meta { url: string; durationMs: number; chapters: { title: string; startMs: number }[] }

const SPEEDS = [1, 1.25, 1.5, 0.8];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function BulletinPlayer({ bulletin, persona, personaLabel, heading, t, autoPlay = false }: {
  bulletin: PlayerBulletin; persona: string; personaLabel: string; heading: string; t: Dict; autoPlay?: boolean;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [shared, setShared] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const real = !bulletin.isDemo && bulletin.voiceAvailable && bulletin.bulletinId;

  const segments = [
    { title: bulletin.language === "fr" ? "Ouverture" : "Opening", text: bulletin.intro },
    ...bulletin.chapters.map((c) => ({ title: c.title, text: c.text })),
    { title: bulletin.language === "fr" ? "Clôture" : "Closing", text: bulletin.outro },
  ];

  // Prépare l'audio de la voix choisie (enregistrée à la première écoute, puis réutilisée).
  useEffect(() => {
    if (!real) return;
    let cancelled = false;
    setMeta(null); setError(null); setPlaying(false); setTime(0);
    fetch("/api/audio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bulletinId: bulletin.bulletinId, persona }) })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Erreur audio"); return d; })
      .then((d) => { if (!cancelled) setMeta(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [real, bulletin.bulletinId, persona]);

  // Lecture automatique dès que l'audio est prêt (si le navigateur l'autorise).
  useEffect(() => {
    if (meta && autoPlay) audio.current?.play().catch(() => {});
  }, [meta, autoPlay]);

  const duration = (meta?.durationMs ?? 0) / 1000;
  const marks = meta?.chapters ?? [];
  const current = marks.reduce((acc, c, i) => (time * 1000 >= c.startMs ? i : acc), 0);

  // Commandes de l'écran verrouillé et du casque.
  useEffect(() => {
    if (!meta || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: heading, artist: `Flash Info · ${personaLabel}`, album: "Flash Info", artwork: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }] });
    const h: [MediaSessionAction, () => void][] = [
      ["play", () => audio.current?.play()], ["pause", () => audio.current?.pause()],
      ["seekbackward", () => skip(-15)], ["seekforward", () => skip(15)],
      ["previoustrack", () => jump(-1)], ["nexttrack", () => jump(1)],
    ];
    for (const [a, fn] of h) { try { navigator.mediaSession.setActionHandler(a, fn); } catch {} }
  });

  function seek(s: number) {
    if (!audio.current) return;
    audio.current.currentTime = Math.max(0, Math.min(duration, s));
    setTime(audio.current.currentTime);
  }
  function skip(d: number) { seek((audio.current?.currentTime ?? 0) + d); }
  function jump(d: number) {
    if (!marks.length) return;
    const i = Math.max(0, Math.min(marks.length - 1, current + d));
    seek(marks[i].startMs / 1000);
    audio.current?.play();
  }
  function toggle() {
    if (!real) return speakDemo();
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  }
  function cycleSpeed() {
    const s = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(s);
    if (audio.current) audio.current.playbackRate = s;
  }
  async function share() {
    if (!bulletin.bulletinId) return;
    const url = `${location.origin}/b/${bulletin.bulletinId}?voix=${persona}`;
    try {
      if (navigator.share) await navigator.share({ title: `Flash Info · ${heading}`, url });
      else { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 2000); }
    } catch {}
  }
  // Mode démo : voix du navigateur.
  function speakDemo() {
    if (!("speechSynthesis" in window)) return;
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); setPlaying(false); return; }
    const u = new SpeechSynthesisUtterance(segments.map((s) => s.text).join(" … "));
    u.lang = bulletin.language === "fr" ? "fr-FR" : "en-GB";
    u.onend = () => setPlaying(false);
    speechSynthesis.speak(u);
    setPlaying(true);
  }

  const progress = duration ? time / duration : 0;
  const waiting = real && !meta && !error;

  return (
    <div className="rounded-3xl border border-line bg-card overflow-hidden">
      {real && meta && (
        <audio ref={audio} src={meta.url} preload="auto"
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => { e.currentTarget.playbackRate = speed; }} />
      )}

      {/* Lecteur */}
      <div className="px-5 pt-7 pb-5 sm:px-8 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{heading} · {personaLabel}</p>
        <p className="mt-2 text-lg font-semibold tracking-tight min-h-7">
          {waiting ? t.recording : error ? "" : real ? segments[current]?.title : t.demo}
        </p>

        <div className="mt-5 flex items-center justify-center gap-5 sm:gap-8">
          <button onClick={() => skip(-15)} disabled={!meta} aria-label={t.back15}
            className="w-11 h-11 rounded-full border border-line text-sm text-ink-soft hover:text-ink hover:border-ink-soft disabled:opacity-30 tabular">−15</button>
          <button onClick={toggle} disabled={Boolean(waiting) || Boolean(error)} aria-label={playing ? t.pause : t.play}
            className={`w-20 h-20 rounded-full bg-accent text-white grid place-items-center shadow-lg shadow-accent/20 hover:scale-[1.03] active:scale-95 transition disabled:opacity-60 ${waiting ? "pulse" : ""}`}>
            {waiting ? (
              <span className="w-7 h-7 rounded-full border-[3px] border-white/90 border-t-transparent animate-spin" />
            ) : playing ? (
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-8 h-8 ml-1" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>
            )}
          </button>
          <button onClick={() => skip(15)} disabled={!meta} aria-label={t.fwd15}
            className="w-11 h-11 rounded-full border border-line text-sm text-ink-soft hover:text-ink hover:border-ink-soft disabled:opacity-30 tabular">+15</button>
        </div>

        <Waveform playing={playing} progress={progress} className="mt-6" />

        {real && (
          <>
            <div className="relative mt-3 h-1.5 rounded-full bg-line cursor-pointer"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration); }}
              role="slider" tabIndex={0} aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)}
              onKeyDown={(e) => { if (e.key === "ArrowRight") skip(5); if (e.key === "ArrowLeft") skip(-5); }}>
              <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
              {marks.slice(1).map((c) => <span key={c.startMs} className="absolute -top-0.5 -bottom-0.5 w-[3px] rounded bg-paper" style={{ left: `${(c.startMs / 1000 / (duration || 1)) * 100}%` }} />)}
            </div>
            <div className="mt-1.5 flex justify-between text-xs text-ink-soft tabular"><span>{fmt(time)}</span><span>{duration ? fmt(duration) : "--:--"}</span></div>
          </>
        )}
        {waiting && <p className="mt-2 text-xs text-ink-soft">{t.firstTime}</p>}
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-sm">
          <button onClick={() => jump(-1)} disabled={!meta} className="rounded-full border border-line px-3.5 py-1.5 text-ink-soft hover:text-ink disabled:opacity-30">⏮ {t.prevStory}</button>
          <button onClick={() => jump(1)} disabled={!meta} className="rounded-full border border-line px-3.5 py-1.5 text-ink-soft hover:text-ink disabled:opacity-30">{t.nextStory} ⏭</button>
          <button onClick={cycleSpeed} disabled={!meta} aria-label={t.speed} className="rounded-full border border-line px-3.5 py-1.5 tabular text-ink-soft hover:text-ink disabled:opacity-30">{speed}×</button>
          {bulletin.bulletinId && <button onClick={share} className="rounded-full border border-line px-3.5 py-1.5 text-ink-soft hover:text-ink">{shared ? t.copied : t.share}</button>}
          {meta && <a href={meta.url} download={`flash-info-${bulletin.bulletinId}.mp3`} className="rounded-full border border-line px-3.5 py-1.5 text-ink-soft hover:text-ink">{t.download}</a>}
        </div>
      </div>

      {/* Sommaire */}
      <div className="border-t border-line px-5 py-5 sm:px-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">{t.stories}</p>
        <ol className="mt-3 space-y-1">
          {bulletin.chapters.map((c, i) => {
            const mark = marks[i + 1];
            const active = real && current === i + 1 && time > 0;
            return (
              <li key={i}>
                <button onClick={() => { if (mark) { seek(mark.startMs / 1000); audio.current?.play(); } }}
                  className={`w-full flex items-baseline gap-3 rounded-xl px-3 py-2.5 text-left transition ${active ? "bg-accent-soft" : "hover:bg-raised"}`}>
                  <span className={`tabular text-sm font-semibold ${active ? "text-accent" : "text-ink-soft"}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1 font-medium">{c.title}</span>
                  {mark && <span className="tabular text-xs text-ink-soft">{fmt(mark.startMs / 1000)}</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Transcription et sources */}
      <div className="border-t border-line px-5 py-4 sm:px-8 text-sm">
        <button onClick={() => setShowTranscript((v) => !v)} className="font-medium text-ink-soft hover:text-ink" aria-expanded={showTranscript}>
          {showTranscript ? "▾" : "▸"} {t.transcript} & {t.sources.toLowerCase()}
        </button>
        {showTranscript && (
          <div className="mt-4 space-y-5">
            {segments.map((s, i) => {
              const ch = i > 0 && i <= bulletin.chapters.length ? bulletin.chapters[i - 1] : null;
              return (
                <div key={i} className={`border-l-2 pl-4 ${real && current === i && time > 0 ? "border-accent" : "border-line"}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{s.title}</p>
                  <p className="mt-1 leading-relaxed">{s.text}</p>
                  {ch && ch.sources.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-ink-soft">
                      {ch.sources.map((src, k) => (
                        <li key={k}>{src.nom} — <a href={src.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">{src.title ?? "article"}</a></li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
