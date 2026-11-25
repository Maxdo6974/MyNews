import { COUNTRIES, FEATURED_TOPICS, THEMES } from "./config";
import type { Bulletin, CountryCode, Duration, Language, ThemeId } from "./types";

/**
 * Bulletin de démonstration. Il ne contient AUCUNE information d'actualité :
 * c'est un texte d'exemple qui décrit le format, pour tester l'interface et le lecteur
 * sans clé API. Les vrais bulletins arrivent à l'étape 5.
 */
export function demoBulletin(country: CountryCode, theme: ThemeId, language: Language, duration: Duration): Bulletin {
  const c = COUNTRIES.find((x) => x.id === country)!;
  const t = THEMES.find((x) => x.id === theme)!;
  const featured = FEATURED_TOPICS[country];
  const themeLabel =
    theme === "a_la_une" ? (featured ? featured.label[language] : t.label[language]) : t.label[language];
  const date = new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: c.tz,
  }).format(new Date());

  const fr = {
    intro: `Bonjour, il est ${date}. Bienvenue dans votre Flash Info, édition ${themeLabel}, consacrée à l'actualité ${c.id === "FR" ? "en France" : c.id === "UK" ? "au Royaume-Uni" : c.id === "IT" ? "en Italie" : "en Allemagne"}. Ceci est un bulletin de démonstration : les sujets qui suivent sont des exemples de format, pas de vraies informations.`,
    chapters: [
      {
        title: "Exemple de premier sujet",
        text: "Dans la version réelle, ce premier sujet présentera l'événement le plus repris par les médias au cours des dernières heures. Il ne sera retenu que s'il est confirmé par au moins deux groupes de presse indépendants. Chaque déclaration sera attribuée à son auteur, et chaque chiffre à sa source.",
      },
      {
        title: "Exemple de deuxième sujet",
        text: "Le deuxième sujet suivra les mêmes règles. Les faits sont d'abord extraits des articles, puis vérifiés une seconde fois, indépendamment. Tout fait qui n'est rapporté que par une seule source est écarté ou explicitement attribué.",
      },
      {
        title: "Exemple de troisième sujet",
        text: "Le troisième sujet permet de tester le découpage en chapitres : vous pouvez cliquer sur un titre pour y accéder directement, accélérer la lecture ou suivre la transcription.",
      },
    ],
    outro: "C'était votre Flash Info de démonstration. Les sources de chaque bulletin réel seront listées sous le lecteur. À bientôt.",
  };
  const en = {
    intro: `Good day, it is ${date}. Welcome to your News Flash, ${themeLabel} edition, covering ${c.label.en}. This is a demonstration bulletin: the stories that follow are format examples, not real news.`,
    chapters: [
      {
        title: "Example first story",
        text: "In the real version, this first story will cover the event most widely reported in recent hours. It will only be included if at least two independent media groups confirm it. Every statement will be attributed to its speaker, and every figure to its source.",
      },
      {
        title: "Example second story",
        text: "The second story follows the same rules. Facts are first extracted from articles, then checked a second time, independently. Any fact reported by a single source is either dropped or explicitly attributed.",
      },
      {
        title: "Example third story",
        text: "The third story lets you test chapters: click a title to jump straight to it, change the playback speed, or follow the transcript.",
      },
    ],
    outro: "That was your demonstration News Flash. The sources of every real bulletin will be listed below the player. Goodbye for now.",
  };
  const content = language === "fr" ? fr : en;
  const chapters = duration === "court" ? content.chapters.slice(0, 2) : content.chapters;

  return {
    id: `demo-${country}-${theme}-${language}-${duration}`,
    country,
    theme,
    language,
    duration,
    edition: "a_la_demande",
    createdAt: new Date().toISOString(),
    isDemo: true,
    intro: content.intro,
    chapters: chapters.map((ch) => ({ ...ch, sources: [] })),
    outro: content.outro,
  };
}

export function wordCount(b: Bulletin): number {
  const all = [b.intro, ...b.chapters.map((c) => c.text), b.outro].join(" ");
  return all.split(/\s+/).filter(Boolean).length;
}
