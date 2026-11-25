import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runQc } from "./qc";
import type { StructuredCall } from "./llm";

const filler = (n: number) => Array.from({ length: n }, (_, i) => `mot${i}`).join(" ");

describe("contrôle qualité", () => {
  const facts = new Map([["E1F1", "Le pont de Valmont est fermé depuis le 3 mars."], ["E1F2", "Les travaux dureront 8 mois selon la préfecture."]]);
  const base = { language: "fr" as const, duration: "court" as const, facts, sourceTexts: ["Le pont de Valmont a été fermé mardi après la découverte de fissures importantes sur sa structure métallique centrale"] };

  it("accepte un script conforme", () => {
    const r = runQc({ ...base, intro: "Bonjour, il est 10 h 30.", chapters: [{ title: "Pont fermé", text: `Le pont de Valmont est fermé depuis le 3 mars. Les travaux dureront 8 mois. ${filler(270)}`, fact_ids: ["E1F1", "E1F2"] }], outro: "Fin." });
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("refuse les mots de jugement, mais pas dans une citation", () => {
    const r = runQc({ ...base, intro: "Bonjour.", chapters: [{ title: "Pont", text: `Malheureusement le pont est fermé. Le maire parle d'une situation « catastrophique ». ${filler(280)}`, fact_ids: ["E1F1"] }], outro: "Fin." });
    expect(r.issues.join(" ")).toContain("malheureusement");
    expect(r.issues.join(" ")).not.toContain("catastrophique");
  });
  it("refuse les redites et les commentaires sur les sources", () => {
    const r = runQc({ ...base, intro: "Bonjour.", chapters: [{ title: "Douanes", text: `Les partenaires visés comprennent l'Union européenne et la Chine. L'Union européenne et la Chine figurent donc parmi les partenaires visés. Ce chiffre est rapporté par France 24 uniquement. ${filler(280)}`, fact_ids: ["E1F1"] }], outro: "Fin." });
    const all = r.issues.join(" ");
    expect(all).toContain("répétée");
    expect(all).toContain("Commentaire sur les sources");
  });

  it("ne confond pas deux phrases différentes sur la même personne avec une redite", () => {
    const r = runQc({ ...base, intro: "Bonjour.", chapters: [{ title: "Justice", text: `Gérald Darmanin a saisi l'Inspection générale de la Justice mercredi. Gérald Darmanin a déploré un défaut de loyauté du magistrat concerné. ${filler(280)}`, fact_ids: ["E1F1"] }], outro: "Fin." });
    expect(r.issues.join(" ")).not.toContain("répétée");
  });

  it("refuse un chiffre absent des faits vérifiés", () => {
    const r = runQc({ ...base, intro: "Bonjour.", chapters: [{ title: "Pont", text: `Les travaux coûteront 12 millions. ${filler(280)}`, fact_ids: ["E1F1"] }], outro: "Fin." });
    expect(r.issues.join(" ")).toContain("12");
  });
  it("refuse un texte trop long, un fait inconnu et un passage recopié", () => {
    const r = runQc({ ...base, intro: "Bonjour.", chapters: [{ title: "Pont", text: `Le pont de Valmont a été fermé mardi après la découverte de fissures importantes sur sa structure. ${filler(500)}`, fact_ids: ["E9F9"] }], outro: "Fin." });
    const all = r.issues.join(" ");
    expect(all).toContain("Trop long");
    expect(all).toContain("E9F9");
    expect(all).toContain("recopié");
  });
});

// Circuit complet avec une IA simulée et une vraie base PostgreSQL.
const TEST_DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!TEST_DB)("génération d'un bulletin (intégration, IA simulée)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const { db, migrate } = await import("./db");
    await db().unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate();
    const sql = db();
    for (const [id, groupe] of [["s1", "g1"], ["s2", "g2"], ["s3", "g3"]]) {
      await sql`INSERT INTO sources (id, nom, pays, langue, groupe, poids, themes, url) VALUES (${id}, ${"Média " + id}, 'FR', 'fr', ${groupe}, 1, ${["generaliste"]}, ${"http://x/" + id})`;
    }
    const now = Date.now();
    const arts: [string, string, string][] = [
      ["s1", "Le pont de Valmont fermé après la découverte de fissures", "La préfecture a fermé le pont de Valmont mardi."],
      ["s2", "Fissures sur le pont de Valmont : circulation interdite", "Le pont de Valmont est fermé, les travaux dureront 8 mois."],
      ["s3", "Valmont : le pont fermé pour 8 mois", "Selon la préfecture, 12 000 véhicules empruntent le pont chaque jour."],
      ["s1", "Grève des contrôleurs aériens à Nice jeudi", "Le syndicat appelle à la grève jeudi à l'aéroport de Nice."],
      ["s2", "Aéroport de Nice : grève des contrôleurs aériens jeudi", "Des annulations de vols sont prévues jeudi à Nice."],
    ];
    let i = 0;
    for (const [src, title, summary] of arts) {
      await sql`INSERT INTO articles (source_id, groupe, pays, langue, themes, title, title_norm, summary, url, published_at)
        SELECT id, groupe, pays, langue, themes, ${title}, ${title}, ${summary}, ${"http://x/a" + ++i}, ${new Date(now - i * 600_000).toISOString()} FROM sources WHERE id = ${src}`;
    }
    const { computeEvents } = await import("./events");
    await computeEvents("FR");
  });
  afterAll(async () => { const { db } = await import("./db"); await db().end(); });

  it("extrait, vérifie, rédige, contrôle et enregistre", async () => {
    const { generateBulletin, getBulletin } = await import("./editorial");
    const { db } = await import("./db");
    const ev = await db()`SELECT c.id, array_agg(ca.article_id ORDER BY ca.article_id) AS arts FROM clusters c JOIN cluster_articles ca ON ca.cluster_id = c.id WHERE c.confirmed GROUP BY c.id ORDER BY c.score DESC`;
    expect(ev.length).toBe(2);
    const [bridge, strike] = ev.map((e) => ({ id: Number(e.id), arts: (e.arts as string[]).map(Number) }));
    const calls: string[] = [];
    const filler260 = filler(250);

    const llm = async <T,>(call: StructuredCall): Promise<T> => {
      calls.push(call.purpose);
      if (call.purpose === "extraction") return { events: [
        { event_id: bridge.id, is_news: true, facts: [
          { statement: "Le pont de Valmont est fermé.", kind: "fait", article_ids: bridge.arts },
          { statement: "Les travaux dureront 8 mois.", kind: "fait", article_ids: bridge.arts.slice(1) },
          { statement: "12 000 véhicules empruntent le pont chaque jour.", kind: "chiffre", attribution: "la préfecture", article_ids: [bridge.arts[2]] },
          { statement: "Le pont va s'effondrer.", kind: "fait", article_ids: bridge.arts },
        ] },
        { event_id: strike.id, is_news: true, facts: [
          { statement: "Une grève des contrôleurs aériens est prévue jeudi à Nice.", kind: "fait", article_ids: strike.arts },
          { statement: "Des annulations de vols sont prévues jeudi.", kind: "fait", article_ids: strike.arts },
        ] },
      ] } as T;
      if (call.purpose === "verification") {
        const ids = [...call.user.matchAll(/^(E\d+F\d+) \|/gm)].map((m) => m[1]);
        return { verdicts: ids.map((id) => id.endsWith("F4") && id.startsWith(`E${bridge.id}`)
          ? { fact_id: id, verdict: "rejete", reason: "Spéculation non soutenue." }
          : { fact_id: id, verdict: "confirme", reason: "Soutenu." }) } as T;
      }
      // Première rédaction volontairement fautive, pour tester la réécriture.
      const bad = call.purpose === "redaction";
      return {
        intro: "Bonjour, il est 10 h 30.",
        chapters: [
          { title: "Pont de Valmont fermé", text: `${bad ? "Heureusement, " : ""}Le pont de Valmont est fermé. Les travaux dureront 8 mois. Selon Média s3, 12 000 véhicules l'empruntent chaque jour. ${filler260}`, fact_ids: [`E${bridge.id}F1`, `E${bridge.id}F2`, `E${bridge.id}F3`] },
          { title: "Grève à Nice", text: "Une grève des contrôleurs aériens est prévue jeudi à Nice.", fact_ids: [`E${strike.id}F1`] },
        ],
        outro: "C'était votre flash.",
      } as T;
    };

    const r = await generateBulletin({ pays: "FR", theme: "generaliste", language: "fr", duration: "court", llm });
    expect(r.error ?? "").toBe("");
    expect(r.status).toBe("pret");
    expect(calls).toEqual(["extraction", "verification", "redaction", "reecriture"]);
    expect(r.qc.attempts).toBe(2);
    const spec = r.facts.find((f) => f.statement.includes("effondrer"))!;
    expect(spec).toMatchObject({ status: "rejete", stage: "verification" });
    const single = r.facts.find((f) => f.statement.startsWith("12 000"))!;
    expect(single).toMatchObject({ status: "retenu", attribution: "selon Média s3" });
    expect(r.chapters[0].sources.length).toBe(3);
    const stored = await getBulletin(r.id);
    expect(stored.status).toBe("pret");
  });

  it("refuse de publier quand le plafond de dépenses est atteint", async () => {
    const { db } = await import("./db");
    await db()`INSERT INTO cost_log (provider, model, purpose, input_units, output_units, cost_eur) VALUES ('anthropic', 'm', 'test', 0, 0, 5)`;
    process.env.ANTHROPIC_API_KEY = "cle-de-test";
    const { generateBulletin } = await import("./editorial");
    const r = await generateBulletin({ pays: "FR", theme: "generaliste", language: "fr", duration: "court" });
    expect(r.status).toBe("echec");
    expect(r.error).toContain("Plafond");
    delete process.env.ANTHROPIC_API_KEY;
  });
});

describe("schéma strict pour l'API", () => {
  it("rend toutes les propriétés obligatoires et interdit les autres, à tous les niveaux", async () => {
    const { strictSchema } = await import("./llm");
    const s = strictSchema({ type: "object", properties: { a: { type: "string" }, b: { type: "array", items: { type: "object", properties: { c: { type: "integer" } } } } } }) as any;
    expect(s.required).toEqual(["a", "b"]);
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.b.items.required).toEqual(["c"]);
    expect(s.properties.b.items.additionalProperties).toBe(false);
  });
});
