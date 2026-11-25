export type CountryCode = "FR" | "IT" | "DE" | "UK";
export type SourceCountry = CountryCode | "INT";
export type Language = "fr" | "en";
export type SourceLanguage = "fr" | "en" | "it" | "de";

export type ThemeId =
  | "generaliste"
  | "politique"
  | "economie"
  | "international"
  | "sport"
  | "sciences"
  | "climat"
  | "sante"
  | "culture"
  | "a_la_une";

export type Duration = "court" | "standard";

export type SourceStatus = "a_verifier" | "ok" | "en_panne";

export interface Source {
  id: string;
  nom: string;
  pays: SourceCountry;
  langue: SourceLanguage;
  groupe: string;
  poids: number;
  themes: ThemeId[];
  url: string;
  statut: SourceStatus;
  actif: boolean;
}

export interface HealthResult {
  sourceId: string;
  nom: string;
  pays: SourceCountry;
  url: string;
  ok: boolean;
  httpStatus: number | null;
  items: number;
  latestItem: string | null;
  latestTitle: string | null;
  durationMs: number;
  error: string | null;
  checkedAt: string;
}

export interface Persona {
  id: "persona_a" | "persona_b";
  nomAffiche: string;
  description: string;
  openaiVoice: string;
  instructions: Record<Language, string>;
}

export interface BulletinChapter {
  title: string;
  text: string;
  sources: { nom: string; url: string; title?: string }[];
}

export interface Bulletin {
  id: string;
  country: CountryCode;
  theme: ThemeId;
  language: Language;
  duration: Duration;
  edition: "matin" | "midi" | "soir" | "a_la_demande";
  createdAt: string;
  isDemo: boolean;
  intro: string;
  chapters: BulletinChapter[];
  outro: string;
}
