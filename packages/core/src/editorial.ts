import { COUNTRIES, FEATURED_TOPICS, THEMES } from "./config";
import { db } from "./db";
import { listEvents } from "./events";
import { callClaude, type LlmFn } from "./llm";
import { EXTRACT_SYSTEM, VERIFY_SYSTEM, scriptSystem } from "./prompts";
import { runQc, wordCountOf, type QcReport } from "./qc";
import { TARGET_WORDS } from "./config";
import type { CountryCode, Duration, Language, ThemeId } from "./types";

/** Nombre de sujets par bulletin. */
const STORIES: Record<Duration, number> = { court: 3, standard: 4 };
/** Événements candidats envoyés à l'extraction (certains seront écartés). */
const CANDIDATES = 7;
const ARTICLES_PER_EVENT = 6;
const MAX_REWRITES = 2;

export interface SourceArticle { id: number; nom: string; groupe: string; title: string; summary: string; url: string; published_at: string }
interface CandidateEvent { eventId: number; label: string; articles: SourceArticle[] }

export interface FactRecord {
  fact_id: string;
  event_id: number;
  statement: string;
  kind: "fait" | "declaration" | "chiffre";
  attribution: string | null;
  article_ids: number[];
  groups: string[];
  status: "retenu" | "rejete";
  reason: string | null;
  stage: "extraction" | "corroboration" | "verification" | null;
}

export interface BulletinResult {
  id: number;
  status: "pret" | "echec";
  error: string | null;
  intro: string;
  chapters: { title: string; text: string; fact_ids: string[]; sources: { nom: string; title: string; url: string }[] }[];
  outro: string;
  facts: FactRecord[];
  qc: QcReport & { attempts: number };
  costEur: number;
  durationMs: number;
}

// ───────── Schémas des réponses attendues ─────────
const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          event_id: { type: "integer" },
          is_news: { type: "boolean" },
          reject_reason: { type: "string" },
          main_theme: { type: "string" },
          neutral_title: { type: "string" },
          facts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                statement: { type: "string" },
                kind: { type: "string", enum: ["fait", "declaration", "chiffre"] },
                attribution: { type: ["string", "null"] },
                article_ids: { type: "array", items: { type: "integer" } },
              },
              required: ["statement", "kind", "article_ids"],
            },
          },
          divergences: { type: "array", items: { type: "string" } },
        },
        required: ["event_id", "is_news", "facts"],
      },
    },
  },
  required: ["events"],
};
const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { fact_id: { type: "string" }, verdict: { type: "string", enum: ["confirme", "rejete"] }, reason: { type: "string" } },
        required: ["fact_id", "verdict", "reason"],
      },
    },
  },
  required: ["verdicts"],
};
const SCRIPT_SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    chapters: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, text: { type: "string" }, fact_ids: { type: "array", items: { type: "string" } } },
        required: ["title", "text", "fact_ids"],
      },
    },
    outro: { type: "string" },
  },
  required: ["intro", "chapters", "outro"],
};

// ───────── Préparation des données ─────────
function pickArticles(articles: SourceArticle[]): SourceArticle[] {
  // Un article par groupe de presse d'abord (diversité), puis les plus récents.
  const byGroup = new Map<string, SourceArticle>();
  for (const a of articles) if (!byGroup.has(a.groupe)) byGroup.set(a.groupe, a);
  const first = [...byGroup.values()];
  const rest = articles.filter((a) => !first.includes(a));
  return [...first, ...rest].slice(0, ARTICLES_PER_EVENT);
}

function articlesBlock(events: CandidateEvent[]): string {
  return events.map((e) => [
    `### Événement ${e.eventId}`,
    ...e.articles.map((a) => `[${a.id}] ${a.nom} (groupe : ${a.groupe}) — ${new Date(a.published_at).toISOString().slice(0, 16)}Z\nTitre : ${a.title}\nChapô : ${a.summary || "(aucun)"}`),
  ].join("\n")).join("\n\n");
}

async function loadCandidates(pays: CountryCode, theme: ThemeId): Promise<CandidateEvent[]> {
  const events = await listEvents({ pays, theme: theme === "generaliste" ? undefined : theme, confirmedOnly: true, limit: CANDIDATES });
  if (!events.length) return [];
  const ids = events.flatMap((e) => e.articles.map((a) => a.id));
  const rows = await db()`
    SELECT a.id, s.nom, a.groupe, a.title, a.summary, a.url, a.published_at
    FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.id = ANY(${ids})`;
  const byId = new Map(rows.map((r) => [Number(r.id), { ...r, id: Number(r.id) } as unknown as SourceArticle]));
  return events.map((e) => ({
    eventId: Number(e.id),
    label: e.label,
    articles: pickArticles(e.articles.map((a) => byId.get(Number(a.id))).filter(Boolean) as SourceArticle[]),
  }));
}

function dateLine(pays: CountryCode, language: Language, now = new Date()): string {
  const tz = COUNTRIES.find((c) => c.id === pays)!.tz;
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz,
  }).format(now);
}

function themeLabel(pays: CountryCode, theme: ThemeId, language: Language): string {
  if (theme === "a_la_une") return FEATURED_TOPICS[pays]?.label[language] ?? THEMES.find((t) => t.id === theme)!.label[language];
  return THEMES.find((t) => t.id === theme)!.label[language];
}

// ───────── Pipeline ─────────
export interface GenerateOptions {
  pays: CountryCode;
  theme: ThemeId;
  language: Language;
  duration: Duration;
  edition?: "matin" | "midi" | "soir" | "a_la_demande";
  llm?: LlmFn;
}

/** Génère un bulletin de bout en bout et l'enregistre. Ne lève pas d'erreur : un échec est enregistré avec sa raison. */
export async function generateBulletin(opts: GenerateOptions): Promise<BulletinResult> {
  const sql = db();
  const llm = opts.llm ?? callClaude;
  const started = Date.now();
  const [row] = await sql`
    INSERT INTO bulletins (pays, theme, langue, duree, edition, status)
    VALUES (${opts.pays}, ${opts.theme}, ${opts.language}, ${opts.duration}, ${opts.edition ?? "a_la_demande"}, 'en_cours')
    RETURNING id`;
  const bulletinId = Number(row.id);
  const facts: FactRecord[] = [];
  const result: BulletinResult = {
    id: bulletinId, status: "echec", error: null, intro: "", chapters: [], outro: "", facts,
    qc: { ok: false, wordCount: 0, estimatedSeconds: 0, issues: [], attempts: 0 }, costEur: 0, durationMs: 0,
  };

  try {
    // 1. Événements confirmés du pays et du thème.
    const candidates = await loadCandidates(opts.pays, opts.theme);
    const needed = STORIES[opts.duration];
    if (candidates.length < 2) throw new Error(`Pas assez d'événements confirmés pour ce thème (${candidates.length}). Réessayez plus tard ou choisissez un autre thème.`);
    const articleById = new Map(candidates.flatMap((e) => e.articles.map((a) => [a.id, a] as const)));

    // 2. Extraction des faits.
    const extracted = await llm<{ events: { event_id: number; is_news: boolean; reject_reason?: string; facts: { statement: string; kind: FactRecord["kind"]; attribution?: string | null; article_ids: number[] }[] }[] }>({
      purpose: "extraction", bulletinId, maxTokens: 6000, system: EXTRACT_SYSTEM, schema: EXTRACT_SCHEMA,
      user: `Voici ${candidates.length} événements et leurs articles.\n\n${articlesBlock(candidates)}\n\nExtrais les faits de chaque événement.`,
    });
    const newsEvents = new Set<number>();
    for (const ev of extracted.events ?? []) {
      const cand = candidates.find((c) => c.eventId === ev.event_id);
      if (!cand) continue;
      if (!ev.is_news) continue;
      newsEvents.add(ev.event_id);
      ev.facts.forEach((f, i) => {
        const ids = [...new Set(f.article_ids)].filter((id) => cand.articles.some((a) => a.id === id));
        const groups = [...new Set(ids.map((id) => articleById.get(id)!.groupe))];
        const rec: FactRecord = {
          fact_id: `E${ev.event_id}F${i + 1}`, event_id: ev.event_id, statement: f.statement, kind: f.kind,
          attribution: f.attribution ?? null, article_ids: ids, groups, status: "retenu", reason: null, stage: null,
        };
        // 3. Corroboration (règle 2), vérifiée par le code et non par l'IA.
        if (ids.length === 0) Object.assign(rec, { status: "rejete", reason: "Aucun article source valide cité.", stage: "corroboration" });
        else if (groups.length < 2) {
          const media = articleById.get(ids[0])!.nom.replace(/ \(via .*\)$/, "");
          rec.attribution = `selon ${media}`;
          rec.reason = "Source unique : attribué au média.";
        }
        facts.push(rec);
      });
    }
    for (const ev of extracted.events ?? []) {
      if (!ev.is_news) facts.push({ fact_id: `E${ev.event_id}`, event_id: ev.event_id, statement: candidates.find((c) => c.eventId === ev.event_id)?.label ?? "", kind: "fait", attribution: null, article_ids: [], groups: [], status: "rejete", reason: `Pas de l'information : ${ev.reject_reason ?? "non précisé"}`, stage: "extraction" });
    }

    // 4. Vérification indépendante.
    const toVerify = facts.filter((f) => f.status === "retenu");
    if (!toVerify.length) throw new Error("Aucun fait exploitable après extraction.");
    const verifyEvents = candidates.filter((c) => newsEvents.has(c.eventId));
    const verified = await llm<{ verdicts: { fact_id: string; verdict: "confirme" | "rejete"; reason: string }[] }>({
      purpose: "verification", bulletinId, maxTokens: 5000, system: VERIFY_SYSTEM, schema: VERIFY_SCHEMA,
      user: `ARTICLES SOURCES\n\n${articlesBlock(verifyEvents)}\n\nFAITS À VÉRIFIER\n\n${toVerify.map((f) => `${f.fact_id} | articles ${f.article_ids.join(", ")} | ${f.kind}${f.attribution ? ` (${f.attribution})` : ""} | ${f.statement}`).join("\n")}`,
    });
    const verdicts = new Map((verified.verdicts ?? []).map((v) => [v.fact_id, v]));
    for (const f of toVerify) {
      const v = verdicts.get(f.fact_id);
      if (!v) Object.assign(f, { status: "rejete", reason: "Non examiné par le vérificateur.", stage: "verification" });
      else if (v.verdict === "rejete") Object.assign(f, { status: "rejete", reason: v.reason, stage: "verification" });
      else if (!f.reason) f.reason = v.reason;
    }

    // 5. Choix des sujets : événements avec au moins 2 faits retenus dont 1 confirmé par 2 groupes.
    const retained = facts.filter((f) => f.status === "retenu");
    const usable = candidates.filter((c) => {
      const fs = retained.filter((f) => f.event_id === c.eventId);
      return fs.length >= 2 && fs.some((f) => f.groups.length >= 2);
    }).slice(0, needed);
    if (usable.length < 2) throw new Error(`Seulement ${usable.length} sujet(s) avec des faits vérifiés : bulletin non publié.`);

    // 6. Rédaction, puis contrôle qualité par le code (réécriture si besoin).
    const target = TARGET_WORDS[opts.duration];
    const factsForScript = usable.map((c, i) => [
      `Sujet ${i + 1}`,
      ...retained.filter((f) => f.event_id === c.eventId).map((f) => `- ${f.fact_id} [${f.kind}${f.attribution ? ` ; ${f.attribution}` : ""}${f.groups.length < 2 ? " ; SOURCE UNIQUE" : ""}] ${f.statement}`),
    ].join("\n")).join("\n\n");
    const brief = `Date et heure : ${dateLine(opts.pays, opts.language)}.
Pays : ${COUNTRIES.find((c) => c.id === opts.pays)!.label[opts.language]}. Thème : ${themeLabel(opts.pays, opts.theme, opts.language)}.
Longueur visée : ${target.min} à ${target.max} mots au total (environ ${opts.duration === "court" ? "2" : "3"} minutes).
${usable.length} sujets, dans cet ordre :

${factsForScript}`;
    const factMap = new Map(retained.map((f) => [f.fact_id, f.statement]));
    const sourceTexts = usable.flatMap((c) => c.articles.flatMap((a) => [a.title, a.summary]));

    let script: { intro: string; chapters: { title: string; text: string; fact_ids: string[] }[]; outro: string } | null = null;
    let qc: QcReport | null = null;
    let feedback = "";
    let attempts = 0;
    for (; attempts <= MAX_REWRITES; attempts++) {
      script = await llm({
        purpose: attempts === 0 ? "redaction" : "reecriture", bulletinId, maxTokens: 3000,
        system: scriptSystem(opts.language), schema: SCRIPT_SCHEMA,
        user: feedback ? `${brief}\n\nTA VERSION PRÉCÉDENTE A ÉTÉ REFUSÉE PAR LE CONTRÔLE QUALITÉ :\n${feedback}\n\nVersion précédente :\n${JSON.stringify(script)}\n\nRéécris en corrigeant chaque point.` : brief,
      });
      qc = runQc({ language: opts.language, duration: opts.duration, ...script!, facts: factMap, sourceTexts });
      if (qc.ok) break;
      feedback = qc.issues.map((i) => `- ${i}`).join("\n");
    }
    result.qc = { ...qc!, attempts: Math.min(attempts + 1, MAX_REWRITES + 1) };
    result.intro = script!.intro;
    result.outro = script!.outro;
    result.chapters = script!.chapters.map((ch) => {
      const ids = new Set(ch.fact_ids.flatMap((id) => facts.find((f) => f.fact_id === id)?.article_ids ?? []));
      return { ...ch, sources: [...ids].map((id) => articleById.get(id)!).filter(Boolean).map((a) => ({ nom: a.nom, title: a.title, url: a.url })) };
    });
    if (!qc!.ok) throw new Error(`Contrôle qualité non satisfait après ${MAX_REWRITES + 1} essais : ${qc!.issues.join(" ")}`);
    result.status = "pret";
  } catch (e) {
    result.error = (e as Error).message;
  }

  const [{ cost }] = await sql`SELECT coalesce(sum(cost_eur), 0)::float AS cost FROM cost_log WHERE bulletin_id = ${bulletinId}`;
  result.costEur = Number(cost);
  result.durationMs = Date.now() - started;
  await sql`
    UPDATE bulletins SET status = ${result.status}, error = ${result.error}, intro = ${result.intro}, outro = ${result.outro},
      chapters = ${sql.json(result.chapters as never)}, facts = ${sql.json(facts as never)}, qc = ${sql.json(result.qc as never)},
      word_count = ${result.qc.wordCount || wordCountOf(result)}, cost_eur = ${result.costEur}, duration_ms = ${result.durationMs}, finished_at = now()
    WHERE id = ${bulletinId}`;
  return result;
}

// ───────── Lecture ─────────
export async function getBulletin(id: number) {
  const [b] = await db()`SELECT * FROM bulletins WHERE id = ${id}`;
  return b ?? null;
}

export async function recentBulletins(limit = 15) {
  return db()`
    SELECT id, pays, theme, langue, duree, status, error, word_count, cost_eur, duration_ms, created_at
    FROM bulletins ORDER BY id DESC LIMIT ${limit}`;
}

/** Bulletin prêt et récent pour la même combinaison (cache), sinon null. */
export async function findFreshBulletin(o: { pays: string; theme: string; language: string; duration: string }, maxAgeMin = 15) {
  const [b] = await db()`
    SELECT * FROM bulletins WHERE pays = ${o.pays} AND theme = ${o.theme} AND langue = ${o.language} AND duree = ${o.duration}
      AND status = 'pret' AND created_at > now() - make_interval(mins => ${maxAgeMin})
    ORDER BY id DESC LIMIT 1`;
  return b ?? null;
}

const pending = new Map<string, Promise<BulletinResult>>();
/** Évite de générer deux fois en parallèle le même bulletin. */
export function generateOnce(opts: GenerateOptions): Promise<BulletinResult> {
  const key = `${opts.pays}|${opts.theme}|${opts.language}|${opts.duration}`;
  if (!pending.has(key)) pending.set(key, generateBulletin(opts).finally(() => pending.delete(key)));
  return pending.get(key)!;
}
