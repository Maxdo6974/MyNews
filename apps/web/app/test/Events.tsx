"use client";

import { useCallback, useEffect, useState } from "react";

interface EventItem {
  id: number; label: string; themes: string[]; groups: string[]; sources: string[];
  n_articles: number; n_groups: number; score: number; confirmed: boolean; featured: boolean;
  last_published: string; computed_at: string;
  articles: { id: number; nom: string; title: string; url: string; published_at: string }[];
}
type Option = { id: string; label: string };

const COUNTRIES: Option[] = [
  { id: "FR", label: "France" }, { id: "IT", label: "Italie" }, { id: "DE", label: "Allemagne" }, { id: "UK", label: "Royaume-Uni" },
];
const time = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function Events({ themes }: { themes: Option[] }) {
  const [pays, setPays] = useState("FR");
  const [theme, setTheme] = useState("");
  const [confirmedOnly, setConfirmedOnly] = useState(true);
  const [events, setEvents] = useState<EventItem[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const themeLabel = (id: string) => themes.find((t) => t.id === id)?.label ?? id;

  const load = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({ pays, limit: "30", ...(theme ? { theme } : {}), ...(confirmedOnly ? { confirmes: "1" } : {}) });
      const r = await fetch(`/api/events?${q}`).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setEvents(r.events);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pays, theme, confirmedOnly]);

  useEffect(() => { load(); }, [load]);

  async function recompute() {
    setBusy(true);
    await fetch("/api/events", { method: "POST" });
    await load();
    setBusy(false);
  }

  const top = (events ?? []).filter((e) => e.confirmed).slice(0, 5);

  return (
    <div className="mt-3 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {COUNTRIES.map((c) => (
          <button key={c.id} onClick={() => setPays(c.id)}
            className={`rounded-full px-3 py-1 text-sm ${pays === c.id ? "bg-ink text-paper" : "border border-line"}`}>{c.label}</button>
        ))}
        <select value={theme} onChange={(e) => setTheme(e.target.value)}
          className="rounded-full border border-line bg-card px-3 py-1 text-sm">
          <option value="">Tous les thèmes</option>
          {themes.filter((t) => t.id !== "generaliste").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm ml-1">
          <input type="checkbox" checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} />
          Confirmés uniquement (≥ 2 groupes)
        </label>
        <button onClick={recompute} disabled={busy} className="ml-auto text-sm underline underline-offset-4 disabled:opacity-50">
          {busy ? "Calcul…" : "Recalculer"}
        </button>
      </div>

      {error && <p className="text-sm text-accent">{error}</p>}

      {events && (
        <div className="rounded-xl border border-ink/20 bg-accent-soft p-4">
          <p className="text-xs font-semibold uppercase tracking-wider">Sujets que retiendrait le bulletin</p>
          {top.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">Aucun événement confirmé pour ce choix pour l'instant.</p>
          ) : (
            <ol className="mt-2 space-y-1 text-sm list-decimal list-inside">
              {top.map((e) => <li key={e.id}><span className="font-medium">{e.label}</span> <span className="text-ink-soft">· {e.n_groups} groupes</span></li>)}
            </ol>
          )}
        </div>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {events?.length === 0 && <li className="p-4 text-sm text-ink-soft">Aucun événement.</li>}
        {events?.map((e) => (
          <li key={e.id} className="p-4">
            <button onClick={() => setOpen(open === e.id ? null : e.id)} className="w-full text-left">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${e.confirmed ? "bg-green-700 text-white" : "bg-line text-ink-soft"}`}>
                  {e.n_groups} groupe{e.n_groups > 1 ? "s" : ""}
                </span>
                <span className="text-ink-soft">{e.n_articles} articles · {time(e.last_published)} · score {e.score.toFixed(2)}</span>
                {e.themes.filter((t) => t !== "generaliste").map((t) => (
                  <span key={t} className={`rounded-full border px-2 py-0.5 ${t === "a_la_une" ? "border-accent text-accent" : "border-line"}`}>{themeLabel(t)}</span>
                ))}
              </div>
              <p className="mt-1.5 font-medium">{e.label}</p>
              <p className="text-xs text-ink-soft mt-0.5">{e.sources.join(" · ")}</p>
            </button>
            {open === e.id && (
              <ul className="mt-3 space-y-1.5 border-l-2 border-line pl-3 text-sm">
                {e.articles.map((a) => (
                  <li key={a.id}>
                    <span className="text-ink-soft">{a.nom} · {time(a.published_at)} — </span>
                    <a href={a.url} target="_blank" rel="noreferrer" className="hover:underline">{a.title}</a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
