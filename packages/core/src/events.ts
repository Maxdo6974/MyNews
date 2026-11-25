import { clusterArticles, type Cluster } from "./cluster";
import { COUNTRIES, FEATURED_TOPICS } from "./config";
import { db } from "./db";
import { stripAccents } from "./text";
import type { CountryCode, SourceLanguage, ThemeId } from "./types";

/** Fenêtre d'articles prise en compte pour détecter les événements. */
const WINDOW_HOURS = 36;

/** Sources prises en compte pour un pays : les siennes, plus les sources internationales en anglais pour le Royaume-Uni. */
function scopeCountries(pays: CountryCode): string[] {
  return pays === "UK" ? ["UK", "INT"] : [pays];
}

function isFeatured(pays: CountryCode, titles: string[]): boolean {
  const topic = FEATURED_TOPICS[pays];
  if (!topic) return false;
  const text = stripAccents(titles.join(" ")).toLowerCase();
  const hits = topic.keywords.filter((k) => text.includes(stripAccents(k).toLowerCase()));
  // Le premier mot-clé est décisif à lui seul ; sinon il en faut deux (« candidat » seul ne suffit pas).
  return hits.includes(topic.keywords[0]) || hits.length >= 2;
}

export interface ClusterRunResult {
  pays: CountryCode;
  articles: number;
  clusters: number;
  confirmed: number;
  durationMs: number;
}

/** Recalcule les événements d'un pays et remplace les précédents. */
export async function computeEvents(pays: CountryCode, now = Date.now()): Promise<ClusterRunResult> {
  const sql = db();
  const started = Date.now();
  const rows = await sql`
    SELECT a.id, a.source_id, s.nom, a.groupe, a.langue, s.poids, s.themes, a.title, a.summary, a.published_at
    FROM articles a JOIN sources s ON s.id = a.source_id
    WHERE a.pays = ANY(${scopeCountries(pays)}) AND s.actif
      AND a.published_at > ${new Date(now - WINDOW_HOURS * 3.6e6).toISOString()}`;
  const clusters = clusterArticles(
    rows.map((r) => ({
      id: Number(r.id), sourceId: r.source_id, sourceName: r.nom, groupe: r.groupe, langue: r.langue as SourceLanguage,
      poids: Number(r.poids), sourceThemes: r.themes as ThemeId[], title: r.title, summary: r.summary,
      publishedAt: new Date(r.published_at).toISOString(),
    })),
    { now },
  );
  const titlesById = new Map(rows.map((r) => [Number(r.id), r.title as string]));

  await sql.begin(async (tx) => {
    await tx`DELETE FROM clusters WHERE pays = ${pays}`;
    // On ne stocke que les événements utiles : multi-articles, ou confirmés.
    for (const c of clusters.filter((c) => c.articleIds.length > 1 || c.confirmed)) {
      const featured = isFeatured(pays, c.articleIds.map((id) => titlesById.get(id) ?? ""));
      const themes = featured ? [...c.themes, "a_la_une"] : c.themes;
      const [row] = await tx`
        INSERT INTO clusters (pays, label, themes, groups, sources, n_articles, n_groups, score, confirmed, featured, first_published, last_published)
        VALUES (${pays}, ${c.label}, ${themes}, ${c.groups}, ${c.sources}, ${c.articleIds.length}, ${c.groups.length},
                ${c.score}, ${c.confirmed}, ${featured}, ${c.firstPublished}, ${c.lastPublished})
        RETURNING id`;
      await tx`INSERT INTO cluster_articles ${tx(c.articleIds.map((article_id) => ({ cluster_id: row.id, article_id })))}`;
    }
  });
  return {
    pays, articles: rows.length, clusters: clusters.filter((c) => c.articleIds.length > 1).length,
    confirmed: clusters.filter((c) => c.confirmed).length, durationMs: Date.now() - started,
  };
}

export async function computeAllEvents(): Promise<ClusterRunResult[]> {
  const out: ClusterRunResult[] = [];
  for (const c of COUNTRIES) out.push(await computeEvents(c.id));
  return out;
}

export interface EventRow {
  id: number;
  label: string;
  themes: ThemeId[];
  groups: string[];
  sources: string[];
  n_articles: number;
  n_groups: number;
  score: number;
  confirmed: boolean;
  featured: boolean;
  first_published: string;
  last_published: string;
  computed_at: string;
  articles: { id: number; nom: string; title: string; url: string; published_at: string }[];
}

/** Événements d'un pays, les mieux classés d'abord, filtrables par thème. */
export async function listEvents(opts: { pays: CountryCode; theme?: ThemeId; confirmedOnly?: boolean; limit?: number }): Promise<EventRow[]> {
  const sql = db();
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  return (await sql`
    SELECT c.*,
      (SELECT json_agg(json_build_object('id', a.id, 'nom', s.nom, 'title', a.title, 'url', a.url, 'published_at', a.published_at) ORDER BY a.published_at DESC)
       FROM cluster_articles ca JOIN articles a ON a.id = ca.article_id JOIN sources s ON s.id = a.source_id
       WHERE ca.cluster_id = c.id) AS articles
    FROM clusters c
    WHERE c.pays = ${opts.pays}
      AND (${opts.theme ?? null}::text IS NULL OR ${opts.theme ?? null} = ANY(c.themes))
      AND (${!opts.confirmedOnly} OR c.confirmed)
    ORDER BY c.score DESC
    LIMIT ${limit}`) as unknown as EventRow[];
}

export type { Cluster };
