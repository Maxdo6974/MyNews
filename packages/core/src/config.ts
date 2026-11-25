import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { CountryCode, Language, Persona, Source, ThemeId } from "./types";

/** Trouve le dossier config/ à la racine du dépôt, quel que soit le dossier de lancement. */
export function configDir(): string {
  if (process.env.FLASH_CONFIG_DIR) return process.env.FLASH_CONFIG_DIR;
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "config", "sources.yaml");
    if (fs.existsSync(candidate)) return path.join(dir, "config");
    dir = path.dirname(dir);
  }
  throw new Error("Dossier config/ introuvable (définir FLASH_CONFIG_DIR)");
}

/** Sources actives uniquement (includeInactive = true pour l'admin). */
export function loadSources(includeInactive = false): Source[] {
  const raw = parse(fs.readFileSync(path.join(configDir(), "sources.yaml"), "utf8")) as {
    defaults: Partial<Source>;
    sources: Partial<Source>[];
  };
  const ids = new Set<string>();
  return raw.sources.map((s) => {
    const src = { ...raw.defaults, ...s } as Source;
    if (!src.id || !src.url || !src.groupe || !src.pays) {
      throw new Error(`Source incomplète : ${JSON.stringify(s)}`);
    }
    if (ids.has(src.id)) throw new Error(`Identifiant de source en double : ${src.id}`);
    ids.add(src.id);
    return src;
  }).filter((s) => includeInactive || s.actif !== false);
}

export const COUNTRIES: { id: CountryCode; label: Record<Language, string>; flag: string; tz: string }[] = [
  { id: "FR", label: { fr: "France", en: "France" }, flag: "🇫🇷", tz: "Europe/Paris" },
  { id: "IT", label: { fr: "Italie", en: "Italy" }, flag: "🇮🇹", tz: "Europe/Rome" },
  { id: "DE", label: { fr: "Allemagne", en: "Germany" }, flag: "🇩🇪", tz: "Europe/Berlin" },
  { id: "UK", label: { fr: "Royaume-Uni", en: "United Kingdom" }, flag: "🇬🇧", tz: "Europe/London" },
];

export const THEMES: { id: ThemeId; label: Record<Language, string> }[] = [
  { id: "generaliste", label: { fr: "Généraliste", en: "General" } },
  { id: "a_la_une", label: { fr: "À la une", en: "Top story" } },
  { id: "politique", label: { fr: "Politique", en: "Politics" } },
  { id: "economie", label: { fr: "Économie", en: "Economy" } },
  { id: "international", label: { fr: "International", en: "World" } },
  { id: "sport", label: { fr: "Sport", en: "Sport" } },
  { id: "sciences", label: { fr: "Tech & Sciences", en: "Tech & Science" } },
  { id: "climat", label: { fr: "Climat & Environnement", en: "Climate & Environment" } },
  { id: "sante", label: { fr: "Santé", en: "Health" } },
  { id: "culture", label: { fr: "Culture & Médias", en: "Culture & Media" } },
];

/**
 * Thème « À la une » par pays, réglable par l'admin (étape 9 : stocké en base).
 * null = pas de thème du moment défini pour ce pays.
 */
export const FEATURED_TOPICS: Record<CountryCode, { label: Record<Language, string>; keywords: string[] } | null> = {
  FR: {
    label: { fr: "Présidentielle 2027", en: "2027 presidential election" },
    keywords: ["présidentielle", "élection présidentielle", "candidat", "candidature", "sondage", "primaire", "2027"],
  },
  IT: null,
  DE: null,
  UK: null,
};

export const PERSONAS: Persona[] = [
  {
    id: "persona_a",
    nomAffiche: "Le Présentateur",
    description: "Voix grave et assurée, ton de flash radio",
    descriptionEn: "Deep, confident voice, radio news style",
    openaiVoice: "cedar",
    instructions: {
      fr: "Présentateur de flash info à la radio, à l'antenne en direct. Débit soutenu et rythmé, énergie maîtrisée, voix grave et assurée. Attaque nette au début de chaque phrase, intonation vivante qui accompagne l'information, jamais monotone ni traînante. Ton neutre et factuel. Très courte respiration entre deux sujets.",
      en: "Live radio news anchor reading a fast-paced bulletin. Brisk, rhythmic delivery with controlled energy, deep and confident voice. Crisp start to each sentence, lively intonation that follows the news, never monotone or dragging. Neutral, factual tone. Very short breath between stories.",
    },
  },
  {
    id: "persona_b",
    nomAffiche: "La Présentatrice",
    description: "Voix claire et vive, ton de flash radio",
    descriptionEn: "Clear, lively voice, radio news style",
    openaiVoice: "marin",
    instructions: {
      fr: "Présentatrice de flash info à la radio, à l'antenne en direct. Débit soutenu et rythmé, voix claire, vive et chaleureuse, articulation impeccable. Attaque nette au début de chaque phrase, intonation vivante, jamais monotone ni traînante. Ton neutre et factuel. Très courte respiration entre deux sujets.",
      en: "Live radio news presenter reading a fast-paced bulletin. Brisk, rhythmic delivery, clear, bright and warm voice, impeccable diction. Crisp start to each sentence, lively intonation, never monotone or dragging. Neutral, factual tone. Very short breath between stories.",
    },
  },
];

export const TARGET_WORDS: Record<"court" | "standard", { min: number; max: number }> = {
  court: { min: 270, max: 330 },
  standard: { min: 400, max: 470 },
};
