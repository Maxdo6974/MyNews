"use client";

import { useEffect, useState } from "react";

/** Langue de l'interface (indépendante de la langue du podcast). */
export type UiLang = "fr" | "en";

const DICT = {
  fr: {
    tagline: "L'actualité, rien que les faits.",
    subtitle: "Un flash audio de 2 à 3 minutes, construit uniquement à partir d'informations confirmées par plusieurs rédactions indépendantes.",
    edition: { matin: "Édition du matin", midi: "Édition de midi", soir: "Édition du soir", nuit: "Édition de la nuit" },
    country: "Pays", theme: "Thème", podcastLang: "Langue du flash", duration: "Durée", voice: "Voix",
    short: "2 min", standard: "3 min",
    listen: "Écouter le flash", play: "Lecture", pause: "Pause",
    preparing: ["Lecture des dernières dépêches…", "Recoupement des sources…", "Vérification des faits…", "Rédaction du flash…", "Contrôle qualité…", "Presque prêt…"],
    recording: "Enregistrement de la voix…",
    firstTime: "Jusqu'à une minute si personne n'a encore demandé ce flash.",
    back15: "Reculer de 15 secondes", fwd15: "Avancer de 15 secondes", nextStory: "Sujet suivant", prevStory: "Sujet précédent",
    speed: "Vitesse", download: "Télécharger", share: "Partager", copied: "Lien copié",
    sources: "Sources", transcript: "Transcription", stories: "Au sommaire",
    history: "Historique", listenNav: "Écouter",
    historyTitle: "Éditions récentes", historyEmpty: "Aucune édition pour l'instant.",
    footer: "Contenu généré automatiquement à partir de sources citées. Voix générée par IA.",
    demo: "Mode démo : contenu d'exemple, aucune information réelle.",
    articles: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
    generatedAt: "Généré le",
    retry: "Réessayer",
  },
  en: {
    tagline: "The news. Nothing but the facts.",
    subtitle: "A 2 to 3-minute audio briefing, built only from information confirmed by several independent newsrooms.",
    edition: { matin: "Morning edition", midi: "Midday edition", soir: "Evening edition", nuit: "Night edition" },
    country: "Country", theme: "Topic", podcastLang: "Briefing language", duration: "Length", voice: "Voice",
    short: "2 min", standard: "3 min",
    listen: "Play the briefing", play: "Play", pause: "Pause",
    preparing: ["Reading the latest reports…", "Cross-checking sources…", "Verifying facts…", "Writing the briefing…", "Quality check…", "Almost ready…"],
    recording: "Recording the voice…",
    firstTime: "Up to a minute if nobody has requested this briefing yet.",
    back15: "Back 15 seconds", fwd15: "Forward 15 seconds", nextStory: "Next story", prevStory: "Previous story",
    speed: "Speed", download: "Download", share: "Share", copied: "Link copied",
    sources: "Sources", transcript: "Transcript", stories: "In this briefing",
    history: "History", listenNav: "Listen",
    historyTitle: "Recent editions", historyEmpty: "No editions yet.",
    footer: "Automatically generated from cited sources. AI-generated voice.",
    demo: "Demo mode: sample content, no real news.",
    articles: (n: number) => `${n} article${n > 1 ? "s" : ""}`,
    generatedAt: "Generated on",
    retry: "Try again",
  },
} as const;

export type Dict = (typeof DICT)[UiLang];

const KEY = "flash-info:ui-lang";
const EVENT = "flash-info:ui-lang";

export function useUiLang(): [UiLang, (l: UiLang) => void, Dict] {
  const [lang, setLang] = useState<UiLang>("fr");
  useEffect(() => {
    const read = () => {
      try {
        const saved = localStorage.getItem(KEY) as UiLang | null;
        setLang(saved ?? (navigator.language.startsWith("fr") ? "fr" : "en"));
      } catch {}
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const set = (l: UiLang) => {
    try { localStorage.setItem(KEY, l); } catch {}
    setLang(l);
    window.dispatchEvent(new Event(EVENT));
  };
  return [lang, set, DICT[lang]];
}

/** Édition selon l'heure locale. */
export function editionNow(d = new Date()): keyof Dict["edition"] {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "matin";
  if (h >= 11 && h < 17) return "midi";
  if (h >= 17 && h < 23) return "soir";
  return "nuit";
}
