import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanSummary, normalizeTitle, selectItems } from "./ingest";

describe("nettoyage", () => {
  it("retire le HTML du chapô et limite sa longueur", () => {
    expect(cleanSummary("<p>Le <b>vote</b> a eu lieu&nbsp;hier.</p>")).toBe("Le vote a eu lieu hier.");
    const long = cleanSummary("mot ".repeat(400));
    expect(long.length).toBeLessThanOrEqual(601);
    expect(long.endsWith("…")).toBe(true);
  });
  it("normalise les titres pour repérer les doublons", () => {
    expect(normalizeTitle("Élection : le Président s'exprime !")).toBe(normalizeTitle("election le president s exprime"));
  });
  it("écarte les articles trop vieux, sans titre ou sans lien", () => {
    const now = Date.parse("2026-11-25T12:00:00Z");
    const items = selectItems(
      [
        { title: "Récent", link: "https://ex.org/1", summary: "", published: "2026-11-25T10:00:00Z" },
        { title: "Vieux", link: "https://ex.org/2", summary: "", published: "2026-11-20T10:00:00Z" },
        { title: "", link: "https://ex.org/3", summary: "", published: null },
        { title: "Sans lien", link: "", summary: "", published: null },
        { title: "Futur", link: "https://ex.org/4", summary: "", published: "2026-11-26T12:00:00Z" },
      ],
      now,
    );
    expect(items.map((i) => i.title)).toEqual(["Récent", "Futur"]);
    expect(items[1].published).toBe(new Date(now).toISOString());
  });
});

// Test d'intégration : nécessite une base PostgreSQL (TEST_DATABASE_URL).
const TEST_DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!TEST_DB)("récupération en base (intégration)", () => {
  let server: http.Server;
  let hits = 0;
  const feed = () => {
    const now = new Date().toUTCString();
    return `<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>
      <item><title>Premier titre</title><link>https://ex.org/a</link><description>&lt;p&gt;Chapô A&lt;/p&gt;</description><pubDate>${now}</pubDate></item>
      <item><title>Deuxième titre</title><link>https://ex.org/b</link><pubDate>${now}</pubDate></item>
      <item><title>Premier titre !</title><link>https://ex.org/a-bis</link><pubDate>${now}</pubDate></item>
    </channel></rss>`;
  };

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits++;
      if (req.headers["if-none-match"] === '"v1"') { res.writeHead(304); res.end(); return; }
      res.writeHead(200, { "Content-Type": "application/rss+xml", ETag: '"v1"' });
      res.end(feed());
    });
    await new Promise<void>((r) => server.listen(0, r));
    process.env.DATABASE_URL = TEST_DB;
    const { db, migrate } = await import("./db");
    await db().unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate();
  });
  afterAll(async () => {
    server.close();
    const { db } = await import("./db");
    await db().end();
  });

  it("insère les articles, ignore les doublons et respecte l'ETag", async () => {
    const { db } = await import("./db");
    const { ingestSource, latestArticles } = await import("./ingest");
    const port = (server.address() as AddressInfo).port;
    const source = {
      id: "test", nom: "Test", pays: "FR" as const, langue: "fr" as const, groupe: "g_test", poids: 1,
      themes: ["generaliste" as const], url: `http://127.0.0.1:${port}/rss`, statut: "ok" as const, actif: true,
    };
    await db()`INSERT INTO sources (id, nom, pays, langue, groupe, poids, themes, url) VALUES
      (${source.id}, ${source.nom}, ${source.pays}, ${source.langue}, ${source.groupe}, 1, ${source.themes}, ${source.url})`;

    const first = await ingestSource(source);
    expect(first).toMatchObject({ ok: true, fetched: 3, inserted: 2 }); // « Premier titre ! » = doublon
    const second = await ingestSource(source);
    expect(second).toMatchObject({ ok: true, notModified: true, inserted: 0 });
    expect(hits).toBe(2);

    const arts = await latestArticles({ pays: "FR" });
    expect(arts).toHaveLength(2);
    expect(arts.find((a) => a.url === "https://ex.org/a")?.summary).toBe("Chapô A");
  });
});
