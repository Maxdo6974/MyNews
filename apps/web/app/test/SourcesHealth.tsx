"use client";

import { useState } from "react";
import type { HealthResult } from "@flash-info/core";

export default function SourcesHealth() {
  const [results, setResults] = useState<HealthResult[] | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sources/health${force ? "?force=1" : ""}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setResults(data.results);
      setAt(data.cachedAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const ok = results?.filter((r) => r.ok).length ?? 0;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <button onClick={() => run(results !== null)} disabled={loading}
          className="rounded-lg bg-ink text-paper px-4 py-2 text-sm font-medium disabled:opacity-60">
          {loading ? "Test en cours (≈ 20 s)…" : results ? "Relancer le test" : "Tester les sources"}
        </button>
        {results && (
          <span className="text-sm">
            <strong>{ok}</strong>/{results.length} fonctionnent
            {at && <span className="text-ink-soft"> · {new Date(at).toLocaleTimeString("fr-FR")}</span>}
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-accent">{error}</p>}
      {results && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-soft">
              <tr className="border-b border-line">
                <th className="p-3">État</th><th className="p-3">Pays</th><th className="p-3">Média</th>
                <th className="p-3">Articles</th><th className="p-3">Dernier titre / erreur</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.sourceId} className="border-b border-line last:border-0 align-top">
                  <td className="p-3">
                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${r.ok ? "bg-green-600" : "bg-accent"}`} />
                  </td>
                  <td className="p-3">{r.pays}</td>
                  <td className="p-3 font-medium whitespace-nowrap">{r.nom}</td>
                  <td className="p-3">{r.items}</td>
                  <td className="p-3 text-ink-soft max-w-xs truncate" title={r.error ?? r.latestTitle ?? ""}>
                    {r.error ?? r.latestTitle}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
