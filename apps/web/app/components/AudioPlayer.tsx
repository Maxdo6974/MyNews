"use client";

import { useEffect, useRef, useState } from "react";

interface Meta { url: string; durationMs: number; chapters: { title: string; startMs: number }[] }
interface Props {
  bulletinId: number;
  persona: string;
  personaLabel: string;
  heading: string;
  /** Texte de chaque partie, dans l'ordre des chapitres audio (transcription). */
  transcript: string[];
}

const SPEEDS = [0.8, 1, 1.25, 1.5];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function AudioPlayer({ bulletinId, persona, personaLabel, heading, transcript }: Props) {
  const audio = useRef<HTMLAudioElement>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(1);

  // Prépare l'audio (généré à la première écoute, puis réutilisé).
  useEffect(() => {
    let cancelled = false;
    setMeta(null); setError(null); setWaiting(0); setPlaying(false); setTime(0);
    const timer = setInterval(() => setWaiting((w) => w + 1), 1000);
    fetch("/api/audio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bulletinId, persona }) })
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error ?? "Erreur audio"); return d; })
      .then((d) => { if (!cancelled) setMeta(d); })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => clearInterval(timer));
    return () => { cancelled = true; clearInterval(timer); };
  }, [bulletinId, persona]);

  // Commandes depuis l'écran verrouillé / le casque.
  useEffect(() => {
    if (!meta || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: heading, artist: `Flash Info · ${personaLabel}`, album: "Flash Info" });
    navigator.mediaSession.setActionHandler("play", () => audio.current?.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
    navigator.mediaSession.setActionHandler("seekbackward", () => skip(-15));
    navigator.mediaSession.setActionHandler("seekforward", () => skip(15));
    navigator.mediaSession.setActionHandler("previoustrack", () => jumpChapter(-1));
    navigator.mediaSession.setActionHandler("nexttrack", () => jumpChapter(1));
  });

  const duration = (meta?.durationMs ?? 0) / 1000;
  const chapters = meta?.chapters ?? [];
  const current = chapters.reduce((acc, c, i) => (time * 1000 >= c.startMs ? i : acc), 0);

  function seek(seconds: number) {
    if (!audio.current) return;
    audio.current.currentTime = Math.max(0, Math.min(duration, seconds));
    setTime(audio.current.currentTime);
  }
  function skip(delta: number) { seek((audio.current?.currentTime ?? 0) + delta); }
  function jumpChapter(delta: number) {
    const i = Math.max(0, Math.min(chapters.length - 1, current + delta));
    seek(chapters[i].startMs / 1000);
    audio.current?.play();
  }
  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) a.play(); else a.pause();
  }
  function changeSpeed(s: number) {
    setSpeed(s);
    if (audio.current) audio.current.playbackRate = s;
  }

  if (error) return <p className="text-sm text-accent">{error}</p>;
  if (!meta) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink-soft">
        <span className="inline-block w-4 h-4 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        Enregistrement de la voix « {personaLabel} »… {waiting > 0 && `${waiting} s`}
        <span className="text-xs">(une vingtaine de secondes la première fois)</span>
      </div>
    );
  }

  return (
    <div>
      <audio
        ref={audio}
        src={meta.url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { e.currentTarget.playbackRate = speed; }}
      />

      <div className="flex items-center gap-4">
        <button onClick={toggle} aria-label={playing ? "Pause" : "Lecture"}
          className="shrink-0 w-14 h-14 rounded-full bg-ink text-paper grid place-items-center text-xl">
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wider text-ink-soft">{heading} · {personaLabel}</p>
          <p className="font-semibold truncate">{chapters[current]?.title}</p>
          <div
            className="relative mt-2 h-2 rounded-full bg-line cursor-pointer"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * duration); }}
            role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(time)} tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowRight") skip(5); if (e.key === "ArrowLeft") skip(-5); }}
          >
            <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(time / duration) * 100}%` }} />
            {chapters.slice(1).map((c) => (
              <span key={c.startMs} className="absolute top-0 bottom-0 w-0.5 bg-paper" style={{ left: `${(c.startMs / 1000 / duration) * 100}%` }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-ink-soft tabular-nums"><span>{fmt(time)}</span><span>{fmt(duration)}</span></div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <button onClick={() => skip(-15)} className="rounded-md border border-line px-2.5 py-1">−15 s</button>
        <button onClick={() => skip(15)} className="rounded-md border border-line px-2.5 py-1">+15 s</button>
        <button onClick={() => jumpChapter(1)} className="rounded-md border border-line px-2.5 py-1">Sujet suivant</button>
        <span className="ml-auto flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => changeSpeed(s)} className={`rounded-md px-2 py-1 ${speed === s ? "bg-ink text-paper" : "border border-line"}`}>{s}×</button>
          ))}
        </span>
        <a href={meta.url} download={`flash-info-${bulletinId}.mp3`} className="rounded-md border border-line px-2.5 py-1">Télécharger</a>
      </div>

      <ol className="mt-6 space-y-4">
        {chapters.map((c, i) => (
          <li key={i}>
            <button onClick={() => { seek(c.startMs / 1000); audio.current?.play(); }}
              className={`text-left w-full rounded-lg p-3 -m-3 ${current === i && time > 0 ? "bg-accent-soft" : "hover:bg-paper"}`}>
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{fmt(c.startMs / 1000)} · {c.title}</span>
              <span className="block mt-1 leading-relaxed">{transcript[i]}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
