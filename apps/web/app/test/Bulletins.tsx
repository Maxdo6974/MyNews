"use client";

import { useCallback, useEffect, useState } from "react";

type Option = { id: string; label: string };
interface Fact {
  fact_id: string; statement: string; kind: string; attribution: string | null; groups: string[];
  status: "retenu" | "rejete"; reason: string | null; stage: string | null;
}
interface Bulletin {
  id: number; status: string; error: string | null; intro: string; outro: string;
  chapters: { title: string; text: string; fact_ids: string[]; sources: { nom: string; title: string; url: string }[] }[];
  facts: Fact[]; qc: { ok: boolean; wordCount: number; estimatedSeconds: number; issues: string[]; attempts: number };
  costEur?: number; cost_eur?: number; durationMs?: number; duration_ms?: number;
}
interface Recent { id: number; pays: string; theme: string; langue: string; duree: string; status: string; error: string | null; word_count: number | null; cost_eur: number; duration_ms: number | null; created_at: string }

const COUNTRIES: Option[] = [{ id: "FR", label: "France" }, { id: "IT", label: "Italie" }, { id: "DE", label: "Allemagne" }, { id: "UK", label: "Royaume-Uni" }];
const STAGES: Record<string, string> = { extraction: "Extraction", corroboration: "Corroboration", verification: "Vérification" };
const eur = (n: number) => `${n.toFixed(3).replace(".", ",")} €`;

type AudioState = { status: "loading" | "ready" | "error"; url?: string; durationMs?: number; costEur?: number; error?: string; seconds?: number };

export default function Bulletins({ themes, demo, hasKey, personas, hasVoiceKey }: { themes: Option[]; demo: boolean; hasKey: boolean; personas: Option[]; hasVoiceKey: boolean }) {
  const [audio, setAudio] = useState<Record<string, AudioState>>({});
  const [country, setCountry] = useState("FR");
  const [theme, setTheme] = useState("generaliste");
  const [lang, setLang] = useState("fr");
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [current, setCurrent] = useState<Bulletin | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [spent, setSpent] = useState<{ spentToday: number; budget: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRejected, setShowRejected] = useState(true);

  const loadRecent = useCallback(async () => {
    const r = await fetch("/api/bulletins").then((x) => x.json()).catch(() => null);
    if (r?.bulletins) { setRecent(r.bulletins); setSpent({ spentToday: r.spentToday, budget: r.budget }); }
  }, []);
  useEffect(() => { loadRecent(); }, [loadRecent]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  async function generate() {
    setRunning(true); setElapsed(0); setError(null); setCurrent(null); setAudio({});
    try {
      const r = await fetch("/api/bulletins", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country, theme, lang }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Erreur ${r.status}`);
      setCurrent(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      loadRecent();
    }
  }

  async function makeAudio(bulletinId: number, language: string, persona: string) {
    const started = Date.now();
    const k = `${language}|${persona}`;
    setAudio((a) => ({ ...a, [k]: { status: "loading" } }));
    try {
      const r = await fetch("/api/audio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bulletinId, language, persona }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      setAudio((a) => ({ ...a, [k]: { status: "ready", url: d.url, durationMs: d.durationMs, costEur: d.costEur, seconds: Math.round((Date.now() - started) / 1000) } }));
      loadRecent();
    } catch (e) {
      setAudio((a) => ({ ...a, [k]: { status: "error", error: (e as Error).message } }));
    }
  }

  async function open(id: number) {
    setAudio({});
    const b = await fetch(`/api/bulletins/${id}`).then((x) => x.json());
    setCurrent(b);
    window.scrollTo({ top: (document.getElementById("bulletin-detail")?.offsetTop ?? 0) - 20, behavior: "smooth" });
  }

  const sel = "rounded-lg border border-line bg-card px-3 py-2 text-sm";
  const disabled = demo || !hasKey;
  const facts = current?.facts ?? [];
  const kept = facts.filter((f) => f.status === "retenu");
  const rejected = facts.filter((f) => f.status === "rejete");

  return (
    <div className="mt-3 space-y-5">
      {disabled && (
        <p className="text-sm rounded-md border border-accent/40 bg-accent-soft px-3 py-2">
          {demo ? "Mode démo actif : la génération réelle est désactivée (variable DEMO_MODE)." : "Clé ANTHROPIC_API_KEY absente."}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <select className={sel} value={country} onChange={(e) => setCountry(e.target.value)}>{COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
        <select className={sel} value={theme} onChange={(e) => setTheme(e.target.value)}>{themes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
        <select className={sel} value={lang} onChange={(e) => setLang(e.target.value)}><option value="fr">Français</option><option value="en">English</option></select>
        <button onClick={generate} disabled={running || disabled}
          className="rounded-lg bg-accent text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
          {running ? `Génération… ${elapsed} s` : "Générer un vrai bulletin"}
        </button>
        {spent && <span className="text-sm text-ink-soft ml-auto">Dépensé aujourd'hui : {eur(spent.spentToday)} / {spent.budget.toFixed(2).replace(".", ",")} €</span>}
      </div>
      <p className="text-xs text-ink-soft">Format 3 minutes. Environ 60 secondes et 0,10 à 0,20 € par bulletin ; la traduction dans l'autre langue coûte environ 0,02 €. Le lecteur public réutilise un bulletin de moins de 15 minutes s'il existe.</p>
      {error && <p className="text-sm text-accent">{error}</p>}

      {current && (
        <div id="bulletin-detail" className="rounded-xl border border-line bg-card p-5 space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${current.status === "pret" ? "bg-green-700" : "bg-accent"}`}>
              {current.status === "pret" ? "Publié" : "Refusé"}
            </span>
            <span className="text-ink-soft">
              Bulletin n° {current.id} · {current.qc?.wordCount ?? 0} mots ≈ {Math.round((current.qc?.estimatedSeconds ?? 0) / 6) / 10} min ·
              {" "}{current.qc?.attempts ?? 0} rédaction(s) · {eur(current.costEur ?? current.cost_eur ?? 0)} · {Math.round((current.durationMs ?? current.duration_ms ?? 0) / 1000)} s
            </span>
          </div>
          {current.error && <p className="text-sm text-accent">{current.error}</p>}
          {current.qc?.issues?.length > 0 && (
            <ul className="text-sm text-accent list-disc list-inside">{current.qc.issues.map((i) => <li key={i}>{i}</li>)}</ul>
          )}

          {current.status === "pret" && (
            <div className="rounded-lg border border-line p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Audio</p>
              {!hasVoiceKey && <p className="text-sm text-accent">Clé OPENAI_API_KEY absente.</p>}
              {(["fr", "en"] as const).flatMap((l) => personas.map((p) => ({ l, p }))).map(({ l, p }) => {
                const st = audio[`${l}|${p.id}`];
                return (
                  <div key={`${l}|${p.id}`} className="flex flex-wrap items-center gap-3 text-sm">
                    <button onClick={() => makeAudio(current.id, l, p.id)} disabled={!hasVoiceKey || st?.status === "loading"}
                      className="rounded-lg border border-ink px-3 py-1.5 font-medium disabled:opacity-50">
                      {st?.status === "loading" ? "Préparation…" : `Écouter · ${l.toUpperCase()} · ${p.label}`}
                    </button>
                    {st?.status === "ready" && (
                      <>
                        <audio controls src={st.url} className="h-9" />
                        <span className="text-ink-soft">{Math.round((st.durationMs ?? 0) / 1000)} s d'audio · {eur(st.costEur ?? 0)} · {st.seconds} s</span>
                      </>
                    )}
                    {st?.status === "error" && <span className="text-accent">{st.error}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {current.intro && (
            <div className="space-y-3 leading-relaxed">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Script</p>
              <p>{current.intro}</p>
              {current.chapters.map((c, i) => (
                <div key={i} className="border-l-2 border-accent pl-3">
                  <p className="text-xs font-semibold uppercase tracking-wider">{c.title} <span className="text-ink-soft font-normal normal-case">· {c.fact_ids.join(", ")}</span></p>
                  <p className="mt-1">{c.text}</p>
                  <p className="mt-1 text-xs text-ink-soft">
                    Sources : {c.sources.map((s, k) => <a key={k} href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 mr-2">{s.nom}</a>)}
                  </p>
                </div>
              ))}
              <p>{current.outro}</p>
            </div>
          )}

          <div>
            <div className="flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Faits : {kept.length} retenus, {rejected.length} rejetés</p>
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> afficher les rejets</label>
            </div>
            <ul className="mt-2 divide-y divide-line text-sm">
              {facts.filter((f) => showRejected || f.status === "retenu").map((f) => (
                <li key={f.fact_id} className="py-2 flex gap-3">
                  <span className={`shrink-0 w-2 h-2 mt-2 rounded-full ${f.status === "retenu" ? "bg-green-600" : "bg-accent"}`} />
                  <div className="min-w-0">
                    <p><span className="text-ink-soft">{f.fact_id} · </span>{f.statement}</p>
                    <p className="text-xs text-ink-soft">
                      {f.kind}{f.attribution ? ` · ${f.attribution}` : ""} · {f.groups.length} groupe(s)
                      {f.status === "rejete" && <> · <span className="text-accent">Rejeté ({STAGES[f.stage ?? ""] ?? f.stage}) : {f.reason}</span></>}
                      {f.status === "retenu" && f.reason && <> · {f.reason}</>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-ink-soft">
              <tr className="border-b border-line"><th className="p-3">N°</th><th className="p-3">Choix</th><th className="p-3">État</th><th className="p-3">Mots</th><th className="p-3">Coût</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {recent.map((b) => (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <td className="p-3">{b.id}</td>
                  <td className="p-3 whitespace-nowrap">{b.pays} · {themes.find((t) => t.id === b.theme)?.label ?? b.theme} · {b.langue} · {b.duree}</td>
                  <td className={`p-3 ${b.status === "pret" ? "" : "text-accent"}`} title={b.error ?? ""}>{b.status === "pret" ? "Publié" : b.status === "en_cours" ? "En cours" : "Refusé"}</td>
                  <td className="p-3">{b.word_count ?? "—"}</td>
                  <td className="p-3">{eur(Number(b.cost_eur))}</td>
                  <td className="p-3"><button onClick={() => open(b.id)} className="underline underline-offset-2">Voir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
