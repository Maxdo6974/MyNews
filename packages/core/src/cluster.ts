import { tokenize } from "./text";
import { articleThemes, isNoise } from "./themes";
import type { SourceLanguage, ThemeId } from "./types";

export interface ClusterInput {
  id: number;
  sourceId: string;
  sourceName?: string;
  groupe: string;
  langue: SourceLanguage;
  poids: number;
  sourceThemes: ThemeId[];
  title: string;
  summary: string;
  publishedAt: string;
}

export interface Cluster {
  articleIds: number[];
  /** Titre de l'article le plus représentatif (le plus proche du centre). */
  label: string;
  groups: string[];
  sources: string[];
  themes: ThemeId[];
  firstPublished: string;
  lastPublished: string;
  score: number;
  confirmed: boolean;
}

export interface ClusterOptions {
  /** Similarité moyenne minimale pour fusionner deux groupes d'articles (0 à 1). */
  threshold?: number;
  /** Écart maximal entre deux articles d'un même événement (heures). */
  maxSpanHours?: number;
  /** Nombre minimal de groupes de presse indépendants pour qu'un événement soit « confirmé ». */
  minGroups?: number;
  now?: number;
}

const DEFAULTS = { threshold: 0.2, maxSpanHours: 36, minGroups: 2 };

type Vec = Map<string, number>;

function buildVectors(items: ClusterInput[]): Vec[] {
  const raw: Vec[] = items.map((a) => {
    const v: Vec = new Map();
    const add = (text: string, w: number) => {
      for (const t of tokenize(text, a.langue)) v.set(t.stem, (v.get(t.stem) ?? 0) + w * (t.proper ? 1.6 : 1));
    };
    add(a.title, 2);
    add(a.summary.slice(0, 280), 1);
    return v;
  });
  // IDF : un mot présent partout ne distingue rien.
  const df = new Map<string, number>();
  for (const v of raw) for (const k of v.keys()) df.set(k, (df.get(k) ?? 0) + 1);
  const n = raw.length;
  return raw.map((v) => {
    const out: Vec = new Map();
    let norm = 0;
    for (const [k, tf] of v) {
      const d = df.get(k)!;
      if (d > n * 0.25 && n > 20) continue; // trop fréquent dans ce lot
      const w = Math.log(1 + tf) * Math.log((n + 1) / d);
      if (w <= 0) continue;
      out.set(k, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of out) out.set(k, w / norm);
    return out;
  });
}

function cosine(a: Vec, b: Vec): number {
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [k, w] of small) {
    const o = big.get(k);
    if (o) s += w * o;
  }
  return s;
}

/**
 * Regroupe des articles par événement (classification hiérarchique, lien moyen),
 * puis calcule pour chaque événement ses thèmes, ses groupes de presse et un score.
 * Les articles de langues différentes ne sont jamais rapprochés.
 */
export function clusterArticles(input: ClusterInput[], options: ClusterOptions = {}): Cluster[] {
  const opts = { ...DEFAULTS, ...options };
  const now = opts.now ?? Date.now();
  const items = input.filter((a) => !isNoise(a.title, a.summary));
  const n = items.length;
  if (n === 0) return [];

  const vecs = buildVectors(items);
  const times = items.map((a) => new Date(a.publishedAt).getTime());
  const span = opts.maxSpanHours * 3.6e6;

  // Matrice des similarités (somme des similarités entre membres de deux groupes).
  const sim: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const s = items[i].langue !== items[j].langue || Math.abs(times[i] - times[j]) > span ? -1e6 : cosine(vecs[i], vecs[j]);
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  const members: number[][] = items.map((_, i) => [i]);
  const active = new Set<number>(items.map((_, i) => i));

  // Fusions successives de la paire de groupes la plus proche, tant qu'elle dépasse le seuil.
  for (;;) {
    let best = -1, bi = -1, bj = -1;
    const act = [...active];
    for (let x = 0; x < act.length; x++) {
      const i = act[x];
      for (let y = x + 1; y < act.length; y++) {
        const j = act[y];
        const avg = sim[i][j] / (members[i].length * members[j].length);
        if (avg > best) { best = avg; bi = i; bj = j; }
      }
    }
    if (best < opts.threshold || bi < 0) break;
    for (const k of active) {
      if (k === bi || k === bj) continue;
      sim[bi][k] += sim[bj][k];
      sim[k][bi] = sim[bi][k];
    }
    members[bi].push(...members[bj]);
    active.delete(bj);
  }

  const clusters: Cluster[] = [];
  for (const i of active) {
    const idx = members[i];
    const arts = idx.map((k) => items[k]);
    // Article représentatif : le plus similaire aux autres (à défaut, le plus récent).
    let rep = idx[0], repScore = -1;
    for (const a of idx) {
      let s = 0;
      for (const b of idx) if (a !== b) s += cosine(vecs[a], vecs[b]);
      if (s > repScore || (s === repScore && times[a] > times[rep])) { repScore = s; rep = a; }
    }
    const groups = [...new Set(arts.map((a) => a.groupe))];
    // Thèmes : ceux portés par au moins un tiers des articles (min. 1).
    const counts = new Map<ThemeId, number>();
    for (const a of arts) for (const t of articleThemes(a.sourceThemes, a.title, a.summary, a.langue)) counts.set(t, (counts.get(t) ?? 0) + 1);
    const themes = [...counts].filter(([, c]) => c >= Math.max(1, Math.ceil(arts.length / 3))).map(([t]) => t);
    const sorted = idx.map((k) => times[k]).sort((a, b) => a - b);
    const ageH = (now - sorted[sorted.length - 1]) / 3.6e6;
    const avgWeight = arts.reduce((s, a) => s + a.poids, 0) / arts.length;
    // Score : nombre de groupes indépendants (prioritaire), fraîcheur, fiabilité, volume.
    const score = Math.pow(groups.length, 1.5) * Math.exp(-Math.max(0, ageH) / 18) * avgWeight * (1 + Math.log(arts.length) / 4);
    clusters.push({
      articleIds: arts.map((a) => a.id),
      label: items[rep].title,
      groups,
      sources: [...new Set(arts.map((a) => a.sourceName ?? a.sourceId))],
      themes,
      firstPublished: new Date(sorted[0]).toISOString(),
      lastPublished: new Date(sorted[sorted.length - 1]).toISOString(),
      score: Math.round(score * 1000) / 1000,
      confirmed: groups.length >= opts.minGroups,
    });
  }
  return clusters.sort((a, b) => b.score - a.score);
}
