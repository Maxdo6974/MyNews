import { stripAccents } from "./text";
import type { SourceLanguage, ThemeId } from "./types";

/**
 * Mots-clés par thème (sans accents, en minuscules, racines courtes acceptées).
 * Un article prend les thèmes dont il contient au moins un mot-clé dans son titre ou son chapô.
 */
const KEYWORDS: Record<Exclude<ThemeId, "generaliste" | "a_la_une">, Record<SourceLanguage, string[]>> = {
  politique: {
    fr: ["gouvernement", "ministre", "assemblee", "senat", "depute", "senateur", "election", "presidentiel", "elysee", "matignon", "parti", "rn ", "lfi", "renaissance", "republicains", "ps ", "budget", "motion de censure", "loi ", "projet de loi", "vote", "scrutin", "candidat", "maire", "municipal", "premier ministre", "macron", "opposition", "coalition", "referendum"],
    en: ["government", "minister", "parliament", "commons", "lords", "mp ", "mps ", "election", "labour", "tory", "tories", "conservative", "reform uk", "lib dem", "starmer", "badenoch", "downing street", "pmqs", "chancellor", "budget", "bill ", "vote", "policy", "council", "mayor", "senate", "congress", "white house"],
    it: ["governo", "ministro", "parlamento", "camera", "senato", "deputat", "elezion", "partito", "meloni", "pd ", "lega ", "fratelli d'italia", "forza italia", "m5s", "manovra", "legge", "voto", "premier", "palazzo chigi", "quirinale", "sindaco", "regional", "opposizione", "referendum"],
    de: ["regierung", "minister", "bundestag", "bundesrat", "kanzler", "merz", "wahl", "partei", "cdu", "csu", "spd", "grune", "afd", "fdp", "linke", "koalition", "haushalt", "gesetz", "abstimmung", "abgeordnet", "landtag", "burgermeister", "opposition", "generaldebatte"],
  },
  economie: {
    fr: ["economie", "economique", "budget", "croissance", "inflation", "chomage", "emploi", "entreprise", "bourse", "cac 40", "banque", "bce", "taux", "prix", "salaire", "dette", "deficit", "impot", "fiscal", "industrie", "usine", "faillite", "licenciement", "plan social", "pib", "commerce", "exportation", "marche", "investiss", "pouvoir d'achat", "energie", "carburant"],
    en: ["economy", "economic", "growth", "inflation", "unemployment", "jobs", "company", "firm", "shares", "stock", "ftse", "bank of england", "interest rate", "prices", "wages", "debt", "deficit", "tax", "industry", "factory", "gdp", "trade", "tariff", "market", "invest", "energy bills", "price cap", "mortgage", "retail"],
    it: ["economia", "economic", "crescita", "inflazione", "disoccupazion", "lavoro", "impresa", "aziend", "borsa", "piazza affari", "banca", "bce", "tassi", "prezzi", "salari", "debito", "deficit", "tasse", "fisco ", "industria", "pil", "commercio", "dazi", "mercat", "investiment", "energia", "bollette"],
    de: ["wirtschaft", "konjunktur", "wachstum", "inflation", "arbeitslos", "unternehmen", "konzern", "borse", "dax", "bank", "ezb", "zinsen", "preise", "lohn", "schulden", "defizit", "steuer", "industrie", "insolvenz", "stellenabbau", "bip", "handel", "zolle", "markt", "invest", "energie", "rente"],
  },
  international: {
    fr: ["ukraine", "russie", "poutine", "zelensky", "israel", "gaza", "hamas", "liban", "iran", "chine", "etats-unis", "trump", "washington", "otan", "onu", "union europeenne", "bruxelles", "allemagne", "royaume-uni", "italie", "espagne", "afrique", "syrie", "venezuela", "inde", "japon", "guerre", "diplomat", "sommet", "ambassad"],
    en: ["ukraine", "russia", "putin", "zelensky", "israel", "gaza", "hamas", "lebanon", "iran", "china", "united states", "trump", "washington", "nato", "un ", "united nations", "european union", "brussels", "france", "germany", "italy", "africa", "syria", "india", "japan", "war ", "diplomat", "summit", "embassy", "ceasefire"],
    it: ["ucraina", "russia", "putin", "zelensky", "israele", "gaza", "hamas", "libano", "iran", "cina", "stati uniti", "trump", "washington", "nato", "onu", "unione europea", "bruxelles", "francia", "germania", "regno unito", "africa", "siria", "india", "giappone", "guerra", "diplomat", "vertice", "ambasciat"],
    de: ["ukraine", "russland", "putin", "selenskyj", "israel", "gaza", "hamas", "libanon", "iran", "china", "usa", "vereinigte staaten", "trump", "washington", "nato", "uno ", "vereinte nationen", "europaische union", "brussel", "frankreich", "italien", "afrika", "syrien", "indien", "japan", "krieg", "diplomat", "gipfel", "botschaft"],
  },
  sport: {
    fr: ["football", "ligue 1", "ligue des champions", "psg", "om ", "rugby", "xv de france", "tennis", "cyclisme", "tour de france", "basket", "nba", "handball", "formule 1", "f1 ", "jeux olympiques", "jo ", "match", "championnat", "coupe", "entraineur", "selectionneur", "biathlon", "ski ", "athletisme", "mercato", "finale ", "but "],
    en: ["football", "premier league", "champions league", "rugby", "cricket", "ashes", "tennis", "golf", "f1 ", "formula one", "boxing", "nba", "nfl", "olympic", "match", "fixture", "striker", "manager", "coach", "goal ", "cup ", "final ", "league", "wicket", "test match"],
    it: ["calcio", "serie a", "champions league", "juventus", "inter ", "milan ", "napoli ", "roma ", "lazio ", "tennis", "sinner", "ciclismo", "giro d'italia", "formula 1", "f1 ", "ferrari", "motogp", "basket", "olimpiad", "partita", "campionato", "coppa", "allenatore", "gol ", "finale ", "volley", "sci "],
    de: ["fussball", "bundesliga", "champions league", "bayern ", "dortmund", "dfb", "nationalmannschaft", "tennis", "formel 1", "handball", "basketball", "olympi", "spiel ", "trainer", "tor ", "pokal", "finale ", "biathlon", "ski ", "wm ", "em "],
  },
  sciences: {
    fr: ["science", "scientifique", "recherche", "chercheur", "espace", "nasa", "esa ", "fusee", "satellite", "intelligence artificielle", "ia ", "technologie", "numerique", "quantique", "cyber", "start-up", "smartphone", "apple ", "google ", "meta ", "openai", "decouverte", "etude scientifique"],
    en: ["science", "scientist", "research", "space", "nasa", "rocket", "satellite", "artificial intelligence", "ai ", "tech", "technology", "digital", "quantum", "cyber", "startup", "smartphone", "apple ", "google ", "meta ", "openai", "microsoft", "discovery", "study finds"],
    it: ["scienza", "scienziat", "ricerca", "ricercator", "spazio", "nasa", "esa ", "razzo", "satellit", "intelligenza artificiale", "ia ", "tecnologia", "digitale", "quantistic", "cyber", "startup", "smartphone", "apple ", "google ", "scoperta", "studio"],
    de: ["wissenschaft", "forscher", "forschung", "raumfahrt", "nasa", "esa ", "rakete", "satellit", "kunstliche intelligenz", "ki ", "technologie", "digital", "quanten", "cyber", "start-up", "smartphone", "apple ", "google ", "entdeckung", "studie "],
  },
  climat: {
    fr: ["climat", "climatique", "rechauffement", "environnement", "pollution", "biodiversite", "cop ", "emissions", "co2", "carbone", "secheresse", "canicule", "inondation", "tempete", "incendie", "energie renouvelable", "eolien", "solaire", "nucleaire", "glacier"],
    en: ["climate", "global warming", "environment", "pollution", "biodiversity", "cop ", "emissions", "carbon", "net zero", "drought", "heatwave", "flood", "wildfire", "renewable", "wind farm", "solar", "nuclear", "glacier"],
    it: ["clima", "climatic", "riscaldamento", "ambiente", "inquinamento", "biodiversita", "cop ", "emissioni", "co2", "carbonio", "siccita", "ondata di caldo", "alluvion", "maltempo", "incendi", "rinnovabil", "eolic", "solare", "nucleare", "ghiacciai"],
    de: ["klima", "erderwarmung", "umwelt", "verschmutzung", "artenvielfalt", "cop ", "emission", "co2", "kohlenstoff", "durre", "hitzewelle", "hochwasser", "uberschwemmung", "waldbrand", "erneuerbar", "windkraft", "solar", "atomkraft", "gletscher", "wald"],
  },
  sante: {
    fr: ["sante", "hopital", "medecin", "patient", "maladie", "virus", "epidemie", "vaccin", "cancer", "medicament", "securite sociale", "assurance maladie", "soins", "urgences", "grippe", "covid", "infirmier", "sante mentale", "deces"],
    en: ["health", "nhs", "hospital", "doctor", "patient", "disease", "virus", "outbreak", "vaccine", "cancer", "drug", "medicine", "social care", "a&e", "flu", "covid", "nurse", "mental health"],
    it: ["salute", "sanita", "ospedal", "medic", "pazient", "malattia", "virus", "epidemia", "vaccin", "cancro", "tumore", "farmac", "cure", "pronto soccorso", "influenza", "covid", "infermier"],
    de: ["gesundheit", "krankenhaus", "klinik", "arzt", "arzte", "patient", "krankheit", "virus", "epidemie", "impf", "krebs", "medikament", "pflege", "krankenkasse", "grippe", "corona", "notaufnahme"],
  },
  culture: {
    fr: ["culture", "cinema", "film ", "festival", "musique", "concert", "album", "livre", "roman", "litterature", "prix goncourt", "exposition", "musee", "theatre", "serie ", "television", "streaming", "netflix", "artiste", "chanteur", "acteur", "actrice", "realisateur", "medias", "presse"],
    en: ["culture", "film ", "cinema", "festival", "music", "concert", "album", "book", "novel", "booker", "exhibition", "museum", "theatre", "tv series", "tv ", "television", "streaming", "netflix", "artist", "singer", "actor", "actress", "director", "bbc ", "media"],
    it: ["cultura", "cinema", "film ", "festival", "musica", "concerto", "album", "libro", "romanzo", "premio strega", "mostra", "museo", "teatro", "serie ", "televisione", "rai ", "streaming", "netflix", "artista", "cantante", "attore", "attrice", "regista", "sanremo"],
    de: ["kultur", "kino", "film ", "festival", "musik", "konzert", "album", "buch ", "roman", "ausstellung", "museum", "theater", "serie ", "fernsehen", "streaming", "netflix", "kunstler", "sanger", "schauspieler", "regisseur", "medien"],
  },
};

/** Contenus qui ne sont pas de l'information : écartés du regroupement. */
const NOISE = [
  /paris sportifs?/i, /pronostic/i, /\bcotes?\b.*\bbookmaker/i, /horoscope/i, /\bcode promo\b/i, /\bbon plan/i,
  /\bmots? fl[eé]ch[eé]s\b/i, /\bsudoku\b/i, /in 100 sekunden/i, /\bgewinnspiel\b/i, /\bwordle\b/i, /\bcrossword\b/i,
  /\boroscopo\b/i, /\bquiz\b/i, /\bavant-match, forme et face-[aà]-face\b/i,
];

export function isNoise(title: string, summary = ""): boolean {
  const t = `${title} ${summary.slice(0, 200)}`;
  return NOISE.some((re) => re.test(t));
}

const norm = (s: string) => ` ${stripAccents(s).toLowerCase().replace(/[^a-z0-9&]+/g, " ").trim()} `;

/** Mot-clé → motif : début de mot obligatoire ; espace final = mot entier (« inter » ≠ « internazionale »). */
const PATTERNS: [ThemeId, SourceLanguage, string][] = Object.entries(KEYWORDS).flatMap(([theme, byLang]) =>
  Object.entries(byLang).flatMap(([lang, keys]) =>
    keys.map((k) => [theme as ThemeId, lang as SourceLanguage, norm(k).trimEnd() + (k.endsWith(" ") ? " " : "")] as [ThemeId, SourceLanguage, string]),
  ),
);

/** Thèmes détectés dans un texte (hors thèmes fixés par la source). */
export function detectThemes(text: string, lang: SourceLanguage): ThemeId[] {
  const t = norm(text);
  const found = new Set<ThemeId>();
  for (const [theme, l, pat] of PATTERNS) if (l === lang && t.includes(pat)) found.add(theme);
  return [...found];
}

/**
 * Thèmes d'un article : une source spécialisée (un seul thème, ex. L'Équipe → sport) impose son thème ;
 * sinon on détecte par mots-clés. Tout article est aussi « généraliste ».
 */
export function articleThemes(sourceThemes: ThemeId[], title: string, summary: string, lang: SourceLanguage): ThemeId[] {
  const set = new Set<ThemeId>(["generaliste"]);
  if (sourceThemes.length === 1 && sourceThemes[0] !== "generaliste") set.add(sourceThemes[0]);
  else for (const th of detectThemes(`${title} ${title} ${summary.slice(0, 300)}`, lang)) set.add(th);
  return [...set];
}
