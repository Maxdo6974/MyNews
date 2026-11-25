import { describe, expect, it } from "vitest";
import { clusterArticles, type ClusterInput } from "./cluster";
import { articleThemes, detectThemes, isNoise } from "./themes";

// Titres inventés pour les tests (aucun contenu de presse réel).
let id = 0;
const art = (groupe: string, title: string, summary = "", langue: ClusterInput["langue"] = "fr", hoursAgo = 1): ClusterInput => ({
  id: ++id, sourceId: groupe, groupe, langue, poids: 1, sourceThemes: ["generaliste"], title, summary,
  publishedAt: new Date(Date.parse("2026-11-25T12:00:00Z") - hoursAgo * 3.6e6).toISOString(),
});
const NOW = Date.parse("2026-11-25T12:00:00Z");

describe("regroupement par événement", () => {
  const input = [
    art("g1", "Le pont de Valmont fermé après la découverte de fissures", "La préfecture a ordonné la fermeture du pont de Valmont."),
    art("g2", "Fissures sur le pont de Valmont : la circulation interdite", "Les inspecteurs ont relevé des fissures sur le pont de Valmont."),
    art("g3", "Valmont : fermeture du pont pour plusieurs mois", "Le pont de Valmont restera fermé, selon la préfecture."),
    art("g1", "Tennis : Léa Martin qualifiée pour la finale du tournoi de Lyon"),
    art("g4", "Le prix du pain augmente de 5 % selon l'Insee"),
    art("g5", "Valmont bridge closed after cracks found", "", "en"),
  ];
  const clusters = clusterArticles(input, { now: NOW });

  it("rassemble les articles du même événement, sans mélanger les sujets", () => {
    const bridge = clusters.find((c) => c.articleIds.includes(1))!;
    expect(bridge.articleIds.sort()).toEqual([1, 2, 3]);
    expect(bridge.groups.sort()).toEqual(["g1", "g2", "g3"]);
    expect(bridge.confirmed).toBe(true);
  });
  it("ne rapproche jamais deux langues différentes", () => {
    expect(clusters.find((c) => c.articleIds.includes(6))!.articleIds).toEqual([6]);
  });
  it("un sujet couvert par un seul groupe n'est pas confirmé", () => {
    expect(clusters.find((c) => c.articleIds.includes(4))!.confirmed).toBe(false);
  });
  it("classe d'abord l'événement couvert par le plus de groupes", () => {
    expect(clusters[0].articleIds).toContain(1);
  });
  it("deux articles d'un même groupe ne font pas une confirmation", () => {
    const c = clusterArticles([art("g9", "Grève des contrôleurs aériens à Nice ce jeudi"), art("g9", "Nice : grève des contrôleurs aériens jeudi")], { now: NOW });
    expect(c).toHaveLength(1);
    expect(c[0].confirmed).toBe(false);
  });
  it("ne regroupe pas des articles trop éloignés dans le temps", () => {
    const c = clusterArticles([art("g1", "Séisme de magnitude 6 au large de la Crète", "", "fr", 1), art("g2", "Séisme de magnitude 6 au large de la Crète", "", "fr", 60)], { now: NOW });
    expect(c).toHaveLength(2);
  });
});

describe("thèmes et bruit", () => {
  it("détecte les thèmes par mots entiers", () => {
    expect(detectThemes("La Roma bat l'Inter en Serie A", "it")).toContain("sport");
    expect(detectThemes("Un romanzo internazionale premiato", "it")).not.toContain("sport");
    expect(detectThemes("Le Sénat adopte le budget", "fr")).toEqual(expect.arrayContaining(["politique", "economie"]));
    expect(detectThemes("Police storm supermarket to free hostages", "en")).not.toContain("climat");
  });
  it("une source spécialisée impose son thème", () => {
    expect(articleThemes(["sport"], "Grosse soirée au Parc", "", "fr")).toEqual(["generaliste", "sport"]);
  });
  it("écarte les contenus qui ne sont pas de l'information", () => {
    expect(isNoise("Lakers vs Celtics — Avant-match, forme et face-à-face | Paris sportifs")).toBe(true);
    expect(isNoise("Horoscope du jour")).toBe(true);
    expect(isNoise("Liquidazione polizza | Q&A Assicurazioni | Chiedi all'esperto")).toBe(true);
    expect(isNoise("Le gouvernement présente son budget")).toBe(false);
  });
});
