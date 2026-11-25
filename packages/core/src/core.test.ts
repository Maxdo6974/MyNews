import { describe, expect, it } from "vitest";
import { COUNTRIES, THEMES, TARGET_WORDS, demoBulletin, loadSources, parseFeed, wordCount } from "./index";

describe("configuration des sources", () => {
  const sources = loadSources();
  it("chaque pays a au moins 2 groupes de presse indépendants", () => {
    for (const c of COUNTRIES) {
      const groups = new Set(sources.filter((s) => s.pays === c.id).map((s) => s.groupe));
      expect(groups.size, c.id).toBeGreaterThanOrEqual(2);
    }
  });
  it("chaque source a une URL https", () => {
    for (const s of sources) expect(s.url.startsWith("https://"), s.id).toBe(true);
  });
});

describe("analyse des flux", () => {
  it("lit un flux RSS 2.0", () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>
      <item><title>Titre A</title><link>https://ex.org/a</link><description>Chapô A</description><pubDate>Wed, 25 Nov 2026 08:00:00 GMT</pubDate></item>
      <item><title>Titre B</title><link>https://ex.org/b</link></item></channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "Titre A", link: "https://ex.org/a", summary: "Chapô A" });
    expect(items[0].published).toBe("2026-11-25T08:00:00.000Z");
  });
  it("lit un flux Atom", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>X</title><link href="https://ex.org/x"/><updated>2026-11-25T10:00:00Z</updated></entry></feed>`;
    expect(parseFeed(xml)[0]).toMatchObject({ title: "X", link: "https://ex.org/x" });
  });
  it("lit un flux RSS 1.0 (RDF)", () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><item><title>Y</title><link>https://ex.org/y</link><dc:date>2026-11-25T09:00:00Z</dc:date></item></rdf:RDF>`;
    expect(parseFeed(xml)[0]).toMatchObject({ title: "Y", link: "https://ex.org/y" });
  });
});

describe("bulletin de démonstration", () => {
  it("existe pour toutes les combinaisons et reste court", () => {
    for (const c of COUNTRIES)
      for (const t of THEMES)
        for (const l of ["fr", "en"] as const) {
          const b = demoBulletin(c.id, t.id, l, "standard");
          expect(b.isDemo).toBe(true);
          expect(wordCount(b)).toBeLessThanOrEqual(TARGET_WORDS.standard.max);
        }
  });
});
