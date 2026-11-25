import { XMLParser } from "fast-xml-parser";
import { decodeHTML } from "entities";
import type { HealthResult, Source } from "./types";

export const USER_AGENT =
  process.env.FLASH_USER_AGENT ?? "FlashInfoBot/0.2 (agregateur de titres RSS; respecte robots.txt)";

export interface ParsedFeedItem {
  title: string;
  link: string;
  summary: string;
  published: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  htmlEntities: true,
});

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return decodeHTML(String(v)).trim();
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("#text" in o) return text(o["#text"]);
    if ("@_href" in o) return text(o["@_href"]);
  }
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Analyse un flux RSS 2.0, RSS 1.0 (RDF) ou Atom et renvoie les éléments. */
export function parseFeed(xml: string): ParsedFeedItem[] {
  const doc = parser.parse(xml) as Record<string, any>;
  let items: any[] = [];
  if (doc.rss?.channel) items = asArray(doc.rss.channel.item);
  else if (doc["rdf:RDF"]) items = asArray(doc["rdf:RDF"].item);
  else if (doc.feed) items = asArray(doc.feed.entry);
  else throw new Error("Format de flux non reconnu");

  return items.map((it) => {
    const link =
      text(it.link) ||
      text(asArray(it.link).find((l: any) => l?.["@_rel"] === "alternate" || !l?.["@_rel"])) ||
      text(it.guid);
    const rawDate = text(it.pubDate) || text(it["dc:date"]) || text(it.published) || text(it.updated);
    const d = rawDate ? new Date(rawDate) : null;
    // Google News ajoute « - Nom du média » à la fin du titre : on le retire.
    let title = text(it.title);
    const via = text(it.source);
    if (via && title.endsWith(` - ${via}`)) title = title.slice(0, -(via.length + 3)).trim();
    return {
      title,
      link,
      summary: text(it.description) || text(it.summary) || text(it.content),
      published: d && !isNaN(d.getTime()) ? d.toISOString() : null,
    };
  });
}

export async function checkSource(source: Source, timeoutMs = 12000): Promise<HealthResult> {
  const started = Date.now();
  const base = {
    sourceId: source.id,
    nom: source.nom,
    pays: source.pays,
    url: source.url,
    checkedAt: new Date().toISOString(),
  };
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    const body = await res.text();
    if (!res.ok) {
      return { ...base, ok: false, httpStatus: res.status, items: 0, latestItem: null, latestTitle: null, durationMs: Date.now() - started, error: `HTTP ${res.status}` };
    }
    const items = parseFeed(body);
    const sorted = items.filter((i) => i.published).sort((a, b) => (b.published! > a.published! ? 1 : -1));
    const latest = sorted[0] ?? items[0];
    const ageH = latest?.published ? (Date.now() - new Date(latest.published).getTime()) / 3.6e6 : null;
    const stale = ageH !== null && ageH > 72;
    const ok = items.length > 0 && !stale;
    return {
      ...base,
      ok,
      httpStatus: res.status,
      items: items.length,
      latestItem: latest?.published ?? null,
      latestTitle: latest?.title ?? null,
      durationMs: Date.now() - started,
      error: items.length === 0 ? "Flux vide" : stale ? "Flux non mis à jour depuis plus de 72 h" : null,
    };
  } catch (e) {
    return { ...base, ok: false, httpStatus: null, items: 0, latestItem: null, latestTitle: null, durationMs: Date.now() - started, error: (e as Error).message };
  }
}

export async function checkAllSources(sources: Source[], concurrency = 6): Promise<HealthResult[]> {
  const results: HealthResult[] = new Array(sources.length);
  let next = 0;
  async function worker() {
    while (next < sources.length) {
      const i = next++;
      results[i] = await checkSource(sources[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));
  return results;
}
