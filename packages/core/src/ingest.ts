import { decodeHTML } from "entities";
import { loadSources } from "./config";
import { db } from "./db";
import { USER_AGENT, parseFeed, type ParsedFeedItem } from "./health";
import type { Source } from "./types";

/** Articles plus vieux que ça dans un flux : ignorés. */
const MAX_AGE_HOURS = 72;
/** Durée de conservation en base. */
const RETENTION_DAYS = 7;
/** Longueur maximale du chapô conservé (on ne stocke pas les articles). */
const SUMMARY_MAX = 600;
const RUN_LOCK = 72_000_002;

export interface SourceIngestResult {
  sourceId: string;
  ok: boolean;
  status: number | null;
  fetched: number;
  inserted: number;
  notModified: boolean;
  error: string | null;
  durationMs: number;
}

export interface IngestRunResult {
  runId: number | null;
  skipped: boolean;
  reason?: string;
  sourcesOk: number;
  sourcesKo: number;
  newArticles: number;
  deletedOld: number;
  durationMs: number;
  details: SourceIngestResult[];
}

/** Nettoie un chapô : balises HTML retirées, entités décodées, espaces normalisés, longueur limitée. */
export function cleanSummary(raw: string): string {
  const text = decodeHTML(raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (text.length <= SUMMARY_MAX) return text;
  const cut = text.slice(0, SUMMARY_MAX);
  return cut.slice(0, cut.lastIndexOf(" ")).trimEnd() + "…";
}

/** Titre normalisé pour repérer les doublons (casse, accents, ponctuation). */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Garde les éléments exploitables d'un flux. */
export function selectItems(items: ParsedFeedItem[], now = Date.now()): (ParsedFeedItem & { published: string })[] {
  const out: (ParsedFeedItem & { published: string })[] = [];
  for (const it of items) {
    if (!it.title || !it.link || !/^https?:\/\//.test(it.link)) continue;
    const published = it.published ?? new Date(now).toISOString();
    const ageH = (now - new Date(published).getTime()) / 3.6e6;
    if (ageH > MAX_AGE_HOURS) continue;
    // Une date dans le futur (fuseau mal déclaré) est ramenée à maintenant.
    out.push({ ...it, published: ageH < -1 ? new Date(now).toISOString() : published });
  }
  return out;
}

/** Recopie config/sources.yaml dans la table sources (la configuration fait foi). */
export async function syncSources(): Promise<number> {
  const sql = db();
  const all = loadSources(true);
  for (const s of all) {
    await sql`
      INSERT INTO sources (id, nom, pays, langue, groupe, poids, themes, url, actif)
      VALUES (${s.id}, ${s.nom}, ${s.pays}, ${s.langue}, ${s.groupe}, ${s.poids}, ${s.themes}, ${s.url}, ${s.actif !== false})
      ON CONFLICT (id) DO UPDATE SET
        nom = EXCLUDED.nom, pays = EXCLUDED.pays, langue = EXCLUDED.langue, groupe = EXCLUDED.groupe,
        poids = EXCLUDED.poids, themes = EXCLUDED.themes, actif = EXCLUDED.actif, updated_at = now(),
        url = EXCLUDED.url,
        etag = CASE WHEN sources.url = EXCLUDED.url THEN sources.etag END,
        last_modified = CASE WHEN sources.url = EXCLUDED.url THEN sources.last_modified END`;
  }
  // Une source retirée de la configuration est désactivée (ses articles restent jusqu'à expiration).
  await sql`UPDATE sources SET actif = false, updated_at = now() WHERE NOT (id = ANY(${all.map((s) => s.id)}))`;
  return all.length;
}

export async function ingestSource(source: Source, timeoutMs = 15000): Promise<SourceIngestResult> {
  const sql = db();
  const started = Date.now();
  const [prev] = await sql`SELECT etag, last_modified FROM sources WHERE id = ${source.id}`;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
  };
  if (prev?.etag) headers["If-None-Match"] = prev.etag;
  if (prev?.last_modified) headers["If-Modified-Since"] = prev.last_modified;

  const base = { sourceId: source.id, fetched: 0, inserted: 0, notModified: false };
  try {
    const res = await fetch(source.url, { headers, signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    if (res.status === 304) {
      await sql`UPDATE sources SET last_status = 304, last_error = NULL, last_checked_at = now(), last_ok_at = now() WHERE id = ${source.id}`;
      return { ...base, ok: true, status: 304, notModified: true, error: null, durationMs: Date.now() - started };
    }
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });

    const items = selectItems(parseFeed(await res.text()));
    let inserted = 0;
    for (const it of items) {
      const rows = await sql`
        INSERT INTO articles (source_id, groupe, pays, langue, themes, title, title_norm, summary, url, published_at)
        VALUES (${source.id}, ${source.groupe}, ${source.pays}, ${source.langue}, ${source.themes},
                ${it.title}, ${normalizeTitle(it.title)}, ${cleanSummary(it.summary)}, ${it.link}, ${it.published})
        ON CONFLICT DO NOTHING
        RETURNING id`;
      inserted += rows.length;
    }
    await sql`
      UPDATE sources SET etag = ${res.headers.get("etag")}, last_modified = ${res.headers.get("last-modified")},
        last_status = ${res.status}, last_error = NULL, last_checked_at = now(), last_ok_at = now()
      WHERE id = ${source.id}`;
    return { ...base, ok: true, status: res.status, fetched: items.length, inserted, error: null, durationMs: Date.now() - started };
  } catch (e) {
    const err = e as Error & { status?: number };
    await sql`UPDATE sources SET last_status = ${err.status ?? null}, last_error = ${err.message}, last_checked_at = now() WHERE id = ${source.id}`;
    return { ...base, ok: false, status: err.status ?? null, error: err.message, durationMs: Date.now() - started };
  }
}

/**
 * Lance une récupération complète. Un verrou empêche deux récupérations simultanées ;
 * minIntervalSec évite de relancer trop souvent (bouton de la page /test).
 */
export async function ingestAll(trigger: "planifie" | "manuel" | "demarrage", minIntervalSec = 0): Promise<IngestRunResult> {
  const sql = db();
  const started = Date.now();
  const empty = { runId: null, sourcesOk: 0, sourcesKo: 0, newArticles: 0, deletedOld: 0, durationMs: 0, details: [] };

  const reserved = await sql.reserve();
  try {
    const [{ locked }] = await reserved`SELECT pg_try_advisory_lock(${RUN_LOCK}) AS locked`;
    if (!locked) return { ...empty, skipped: true, reason: "Une récupération est déjà en cours." };
    try {
      if (minIntervalSec > 0) {
        const [last] = await reserved`SELECT started_at FROM ingestion_runs ORDER BY id DESC LIMIT 1`;
        if (last && Date.now() - new Date(last.started_at).getTime() < minIntervalSec * 1000) {
          return { ...empty, skipped: true, reason: `Dernière récupération il y a moins de ${Math.round(minIntervalSec / 60)} min.` };
        }
      }
      await syncSources();
      const [run] = await sql`INSERT INTO ingestion_runs (trigger) VALUES (${trigger}) RETURNING id`;

      const sources = loadSources();
      const details: SourceIngestResult[] = new Array(sources.length);
      let next = 0;
      const worker = async () => {
        while (next < sources.length) {
          const i = next++;
          details[i] = await ingestSource(sources[i]);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));

      const deleted = await sql`DELETE FROM articles WHERE fetched_at < now() - make_interval(days => ${RETENTION_DAYS}) RETURNING id`;
      const sourcesOk = details.filter((d) => d.ok).length;
      const newArticles = details.reduce((n, d) => n + d.inserted, 0);
      await sql`
        UPDATE ingestion_runs SET finished_at = now(), sources_ok = ${sourcesOk}, sources_ko = ${details.length - sourcesOk},
          new_articles = ${newArticles}, deleted_old = ${deleted.length}, details = ${sql.json(details as never)}
        WHERE id = ${run.id}`;
      return {
        runId: run.id, skipped: false, sourcesOk, sourcesKo: details.length - sourcesOk,
        newArticles, deletedOld: deleted.length, durationMs: Date.now() - started, details,
      };
    } finally {
      await reserved`SELECT pg_advisory_unlock(${RUN_LOCK})`;
    }
  } finally {
    reserved.release();
  }
}

export interface ArticleRow {
  id: number;
  source_id: string;
  nom: string;
  groupe: string;
  pays: string;
  langue: string;
  title: string;
  summary: string;
  url: string;
  published_at: string;
}

export async function latestArticles(opts: { pays?: string; sourceId?: string; limit?: number } = {}): Promise<ArticleRow[]> {
  const sql = db();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  return (await sql`
    SELECT a.id, a.source_id, s.nom, a.groupe, a.pays, a.langue, a.title, a.summary, a.url, a.published_at
    FROM articles a JOIN sources s ON s.id = a.source_id
    WHERE (${opts.pays ?? null}::text IS NULL OR a.pays = ${opts.pays ?? null})
      AND (${opts.sourceId ?? null}::text IS NULL OR a.source_id = ${opts.sourceId ?? null})
    ORDER BY a.published_at DESC
    LIMIT ${limit}`) as unknown as ArticleRow[];
}

export async function ingestionOverview() {
  const sql = db();
  const runs = await sql`
    SELECT id, trigger, started_at, finished_at, sources_ok, sources_ko, new_articles, deleted_old
    FROM ingestion_runs ORDER BY id DESC LIMIT 10`;
  const perCountry = await sql`
    SELECT pays,
      count(*)::int AS total,
      count(*) FILTER (WHERE published_at > now() - interval '24 hours')::int AS last24h,
      count(DISTINCT groupe) FILTER (WHERE published_at > now() - interval '24 hours')::int AS groups24h
    FROM articles GROUP BY pays ORDER BY pays`;
  const perSource = await sql`
    SELECT s.id, s.nom, s.pays, s.actif, s.last_status, s.last_error, s.last_ok_at,
      count(a.id) FILTER (WHERE a.published_at > now() - interval '24 hours')::int AS last24h
    FROM sources s LEFT JOIN articles a ON a.source_id = s.id
    WHERE s.actif
    GROUP BY s.id ORDER BY s.pays, s.nom`;
  return { runs, perCountry, perSource };
}
