import { TARGET_WORDS } from "./config";
import { stripAccents } from "./text";
import type { Duration, Language } from "./types";

/** Mots qui expriment un jugement : interdits hors citation. */
const OPINION_WORDS: Record<Language, string[]> = {
  fr: ["catastrophique", "scandaleux", "scandaleuse", "honteux", "honteuse", "courageux", "courageuse", "incroyable", "terrible", "magnifique",
    "desastreux", "desastreuse", "inacceptable", "choquant", "choquante", "heureusement", "malheureusement", "helas", "evidemment", "bien sur",
    "clairement", "sans surprise", "extraordinaire", "spectaculaire", "inquietant", "inquietante", "alarmant", "alarmante", "formidable",
    "lamentable", "honte", "brillant", "brillante", "pitoyable", "triste nouvelle", "bonne nouvelle", "mauvaise nouvelle", "polemique"],
  en: ["catastrophic", "disgraceful", "shameful", "courageous", "brave", "outrageous", "shocking", "incredible", "terrible", "wonderful",
    "disastrous", "unacceptable", "fortunately", "unfortunately", "sadly", "obviously", "clearly", "of course", "stunning", "alarming",
    "worrying", "brilliant", "pathetic", "good news", "bad news", "controversial", "amazing", "appalling"],
};

const SPEECH_RATE_WPM = 150;
const COPY_WINDOW = 12;

export interface QcInput {
  language: Language;
  duration: Duration;
  intro: string;
  chapters: { title: string; text: string; fact_ids: string[] }[];
  outro: string;
  /** Faits retenus : identifiant → énoncé. */
  facts: Map<string, string>;
  /** Titres et chapôs des articles sources (pour détecter les copies). */
  sourceTexts: string[];
}

export interface QcReport {
  ok: boolean;
  wordCount: number;
  estimatedSeconds: number;
  issues: string[];
}

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const norm = (s: string) => stripAccents(s).toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();

/** Retire les passages entre guillemets : une citation peut contenir un jugement, à condition d'être attribuée. */
export function withoutQuotes(s: string): string {
  return s.replace(/«[^»]*»/g, " ").replace(/"[^"]*"/g, " ").replace(/“[^”]*”/g, " ");
}

export function wordCountOf(input: Pick<QcInput, "intro" | "chapters" | "outro">): number {
  return words([input.intro, ...input.chapters.map((c) => c.text), input.outro].join(" ")).length;
}

/** Contrôle qualité fait par le code (pas par l'IA) : chaque point est vérifiable et reproductible. */
export function runQc(input: QcInput): QcReport {
  const issues: string[] = [];
  const all = [input.intro, ...input.chapters.map((c) => c.text), input.outro].join(" ");
  const wc = words(all).length;
  const target = TARGET_WORDS[input.duration];
  const min = Math.round(target.min * 0.9), max = Math.round(target.max * 1.08);
  if (wc < min) issues.push(`Trop court : ${wc} mots (minimum ${min}).`);
  if (wc > max) issues.push(`Trop long : ${wc} mots (maximum ${max}).`);

  // Mots d'opinion hors citations.
  const plain = ` ${norm(withoutQuotes(all))} `;
  const found = OPINION_WORDS[input.language].filter((w) => plain.includes(` ${norm(w)} `));
  if (found.length) issues.push(`Mots exprimant un jugement : ${found.join(", ")}.`);

  // Chaque sujet doit reposer sur des faits retenus.
  input.chapters.forEach((c, i) => {
    if (!c.fact_ids?.length) issues.push(`Sujet ${i + 1} sans fait associé.`);
    const unknown = (c.fact_ids ?? []).filter((id) => !input.facts.has(id));
    if (unknown.length) issues.push(`Sujet ${i + 1} : faits inconnus ou rejetés (${unknown.join(", ")}).`);
  });

  // Chiffres : tout nombre du script doit figurer dans un fait retenu.
  const factText = ` ${[...input.facts.values()].map(norm).join(" ")} `;
  // Nombres isolés seulement (« G7 », « COP30 » sont des noms, pas des chiffres à vérifier).
  const numbers = [...new Set((all.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)?(?![\p{L}\d])/gu) ?? []).map((n) => n.replace(",", ".")))];
  const unknownNumbers = numbers.filter((n) => {
    const variants = [n, n.replace(".", ","), n.replace(".", " ")].map(norm);
    return !variants.some((v) => factText.includes(` ${v} `) || factText.includes(` ${v}%`) || factText.includes(` ${v}`));
  });
  // Les années et heures de la date d'introduction sont tolérées.
  const tolerated = new Set(words(norm(input.intro)).filter((w) => /^\d+$/.test(w)));
  const bad = unknownNumbers.filter((n) => !tolerated.has(norm(n)));
  if (bad.length) issues.push(`Chiffres absents des faits vérifiés : ${bad.join(", ")}.`);

  // Copie : aucune suite de COPY_WINDOW mots identique à une source (= phrase recopiée).
  const shingles = new Set<string>();
  for (const t of input.sourceTexts) {
    const w = words(norm(t));
    for (let i = 0; i + COPY_WINDOW <= w.length; i++) shingles.add(w.slice(i, i + COPY_WINDOW).join(" "));
  }
  const sw = words(norm(withoutQuotes(all)));
  for (let i = 0; i + COPY_WINDOW <= sw.length; i++) {
    if (shingles.has(sw.slice(i, i + COPY_WINDOW).join(" "))) {
      issues.push(`Passage recopié d'une source : « ${sw.slice(i, i + COPY_WINDOW).join(" ")} … ».`);
      break;
    }
  }

  return { ok: issues.length === 0, wordCount: wc, estimatedSeconds: Math.round((wc / SPEECH_RATE_WPM) * 60), issues };
}
