"use client";

import { useCallback, useEffect, useState } from "react";

interface Run {
  id: number; trigger: string; started_at: string; finished_at: string | null;
  sources_ok: number; sources_ko: number; new_articles: number; deleted_old: number;
}
interface Overview {
  runs: Run[];
  perCountry: { pays: string; total: number; last24h: number; groups24h: number }[];
  perSource: { id: string; nom: string; pays: string; last_status: number | null; last_error: string | null; last_ok_at: string | null; last24h: number }[];
}
interface Article { id: number; nom: string; pays: string; title: string; summary: string; url: string; published_at: string }

const COUNTRY_TABS = [
  { id: "", label: "Tous" }, { id: "FR", label: "France" }, { id: "IT", label: "Italie" },
  { id: "DE", label: "Allemagne" }, { id: "UK", label: "Royaume-Uni" }, { id: "INT", label: "International" },
];
const TRIGGERS: Record<string, string> = { planifie: "Automatique", manuel: "Manuel", demarrage: "Démarrage" };

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export default function Ingestion() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [pays, setPays] = useState("");
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([
        fetch("/api/ingest").then((r) => r.json()),
        fetch(`/api/articles?limit=40${pays ? `&pays=${pays}` : ""}`).then((r) => r.json()),
      ]);
      if (o.error) throw new Error(o.error);
      setOverview(o);
      setArticles(a.articles ?? []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pays]);

  useEffect(() => { load(); }, [load]);

  async function runNow() {
    setRunning(true);
    setMessage(null);
    try {
      const r = await fetch("/api/ingest", { method: "POST" }).then((x) => x.json());
      setMessage(r.skipped ? r.reason : `${r.newArticles} nouveaux articles · ${r.sourcesOk} sources OK, ${r.sourcesKo} en échec · ${Math.round(r.durationMs / 1000)} s`);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  if (error) return <p className="mt-3 text-sm text-accent">{error}</p>;
  if (!overview) return <p className="mt-3 text-sm text-ink-soft">Chargement…</p>;

  const last = overview.runs[0];
  return (
    <div className="mt-3 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={runNow} disabled={running}
          className="rounded-lg bg-ink text-paper px-4 py-2 text-sm font-medium disabled:opacity-60">
          {running ? "Récupération en cours…" : "Récupérer maintenant"}
        </button>
        <span className="text-sm text-ink-soft">
          {last ? <>Dernier passage : {time(last.started_at)} ({TRIGGERS[last.trigger] ?? last.trigger}) · automatique toutes les 20 min</> : "Aucun passage pour l'instant (le premier a lieu ~15 s après le démarrage)."}
        </span>
      </div>
      {message && <p className="text-sm rounded-md bg-paper border border-line px-3 py-2">{message}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {["FR", "IT", "DE", "UK", "INT"].map((p) => {
          const c = overview.perCountry.find((x) => x.pays === p);
          return (
            <div key={p} className="rounded-xl border border-line bg-card p-3">
              <p className="text-xs uppercase tracking-wider text-ink-soft">{COUNTRY_TABS.find((t) => t.id === p)?.label}</p>
              <p className="mt-1 text-xl font-semibold">{c?.last24h ?? 0}</p>
              <p className="text-xs text-ink-soft">articles 24 h · {c?.groups24h ?? 0} groupes</p>
            </div>
          );
        })}
      </div>

      {overview.runs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-soft">
              <tr className="border-b border-line">
                <th className="p-3">Passage</th><th className="p-3">Type</th><th className="p-3">Nouveaux</th>
                <th className="p-3">Sources OK</th><th className="p-3">En échec</th>
              </tr>
            </thead>
            <tbody>
              {overview.runs.slice(0, 5).map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="p-3 whitespace-nowrap">{time(r.started_at)}</td>
                  <td className="p-3">{TRIGGERS[r.trigger] ?? r.trigger}</td>
                  <td className="p-3 font-medium">{r.finished_at ? r.new_articles : "en cours"}</td>
                  <td className="p-3">{r.sources_ok}</td>
                  <td className={`p-3 ${r.sources_ko ? "text-accent font-medium" : ""}`}>{r.sources_ko}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <button onClick={() => setShowSources((v) => !v)} className="text-sm font-medium underline underline-offset-4">
          {showSources ? "Masquer" : "Afficher"} le détail par média
        </button>
        {showSources && (
          <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 text-sm">
            {overview.perSource.map((s) => (
              <li key={s.id} className="flex items-center gap-2 py-1 border-b border-line">
                <span className={`w-2 h-2 rounded-full ${s.last_error ? "bg-accent" : "bg-green-600"}`} />
                <span className="text-ink-soft w-8">{s.pays}</span>
                <span className="flex-1 truncate">{s.nom}</span>
                <span className="text-ink-soft" title={s.last_error ?? ""}>{s.last_error ? s.last_error : `${s.last24h} / 24 h`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-1.5">
          {COUNTRY_TABS.map((t) => (
            <button key={t.id} onClick={() => setPays(t.id)}
              className={`rounded-full px-3 py-1 text-sm ${pays === t.id ? "bg-ink text-paper" : "border border-line"}`}>{t.label}</button>
          ))}
        </div>
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-card">
          {articles.length === 0 && <li className="p-4 text-sm text-ink-soft">Aucun article pour l'instant.</li>}
          {articles.map((a) => (
            <li key={a.id} className="p-4">
              <p className="text-xs text-ink-soft">{a.nom} · {a.pays} · {time(a.published_at)}</p>
              <a href={a.url} target="_blank" rel="noreferrer" className="mt-0.5 block font-medium hover:underline">{a.title}</a>
              {a.summary && <p className="mt-1 text-sm text-ink-soft line-clamp-2">{a.summary}</p>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
