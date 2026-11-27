import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TtsProvider } from "./tts";

const run = promisify(execFile);
// Vitesse d'origine dans les tests, pour des durées faciles à vérifier.
process.env.AUDIO_TEMPO = "1";

/** Faux moteur de voix : un son de 1 s par tranche de 10 caractères (max 4 s), généré par ffmpeg. */
async function tone(seconds: number, freq: number): Promise<Buffer> {
  const f = path.join(os.tmpdir(), `tone-${freq}-${seconds}-${Date.now()}.mp3`);
  await run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${seconds}`, "-ac", "1", "-ar", "24000", "-c:a", "libmp3lame", f]);
  const b = await fs.readFile(f);
  await fs.rm(f);
  return b;
}
const calls: { voice: string; instructions: string }[] = [];
const fakeProvider: TtsProvider = {
  name: "faux",
  async synthesize(req) {
    calls.push({ voice: req.voice, instructions: req.instructions });
    return tone(Math.min(4, Math.max(1, Math.round(req.text.length / 10))), 440);
  },
  costEur: (s) => s * 0.001,
};

describe("montage audio", () => {
  it("assemble les segments avec des silences et calcule le début de chaque partie", async () => {
    const { assemble } = await import("./audio");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t-"));
    const r = await assemble([{ title: "A", mp3: await tone(1, 440) }, { title: "B", mp3: await tone(2, 660) }, { title: "C", mp3: await tone(1, 880) }], dir);
    await fs.rm(dir, { recursive: true });
    expect(r.chapters.map((c) => c.title)).toEqual(["A", "B", "C"]);
    expect(r.chapters[0].startMs).toBe(0);
    expect(Math.abs(r.chapters[1].startMs - 1350)).toBeLessThan(150);  // 1 s + 0,35 s de silence
    expect(Math.abs(r.chapters[2].startMs - 3700)).toBeLessThan(200);  // + 2 s + 0,35 s
    expect(Math.abs(r.durationMs - 4700)).toBeLessThan(300);
    expect(r.mp3.subarray(0, 3).toString()).toMatch(/ID3|\xff/);
  });

  it("ajoute la musique sous l'introduction : 1,8 s seule, puis sous la voix, puis fondu", async () => {
    const { assemble } = await import("./audio");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t-"));
    const r = await assemble([{ title: "Intro", mp3: await tone(2, 440) }, { title: "Sujet", mp3: await tone(1, 660) }], dir, { introBed: true });
    await fs.rm(dir, { recursive: true });
    // Intro = 1,8 (musique seule) + 2 (voix) + 1,2 (fin de musique) = 5 s, puis 0,35 s de silence.
    expect(Math.abs(r.chapters[1].startMs - 5350)).toBeLessThan(200);
  });

  it("place un rappel musical avant chaque nouveau sujet (pas juste après l'intro)", async () => {
    const { assemble } = await import("./audio");
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "t-"));
    const segs = await Promise.all(["Intro", "Sujet 1", "Sujet 2", "Clôture"].map(async (title) => ({ title, mp3: await tone(1, 500) })));
    const r = await assemble(segs, dir, { stings: true });
    await fs.rm(dir, { recursive: true });
    // Intro 1 + 0,35 → Sujet 1 à 1,35 ; Sujet 1 1 + 0,35 + rappel 1,5 + 0,12 → Sujet 2 à 4,32 ; idem → Clôture à 7,29.
    expect(Math.abs(r.chapters[1].startMs - 1350)).toBeLessThan(150);
    expect(Math.abs(r.chapters[2].startMs - 4320)).toBeLessThan(250);
    expect(Math.abs(r.chapters[3].startMs - 7290)).toBeLessThan(350);
  });

  it("compose une musique sans saturation", async () => {
    const { renderIntroBed } = await import("./audio");
    const f = path.join(os.tmpdir(), `bed-${Date.now()}.wav`);
    await renderIntroBed(6, f);
    const { stderr } = await run("ffmpeg", ["-v", "info", "-i", f, "-af", "volumedetect", "-f", "null", "-"]);
    await fs.rm(f);
    const peak = Number(/max_volume: (-?[\d.]+) dB/.exec(stderr)?.[1]);
    expect(peak).toBeLessThan(-0.5);
    expect(peak).toBeGreaterThan(-20);
  });
});

const TEST_DB = process.env.TEST_DATABASE_URL;
describe.skipIf(!TEST_DB)("audio d'un bulletin (intégration, voix simulée)", () => {
  let bulletinId = 0;
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DB;
    const { db, migrate } = await import("./db");
    await db().unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate();
    const facts = [
      { fact_id: "E1F1", statement: "Premier sujet du flash d'information.", status: "retenu" },
      { fact_id: "E2F1", statement: "Second sujet.", status: "retenu" },
    ];
    const [b] = await db()`INSERT INTO bulletins (pays, theme, langue, duree, edition, status, intro, chapters, outro, facts)
      VALUES ('FR', 'generaliste', 'fr', 'court', 'a_la_demande', 'pret', 'Bonjour et bienvenue.',
        ${db().json([{ title: "Sujet un", text: "Premier sujet du flash d'information.", fact_ids: ["E1F1"], sources: [] }, { title: "Sujet deux", text: "Second sujet.", fact_ids: ["E2F1"], sources: [] }] as never)},
        'Fin du flash.', ${db().json(facts as never)}) RETURNING id`;
    bulletinId = Number(b.id);
    await db()`INSERT INTO bulletin_versions (bulletin_id, langue, source, intro, chapters, outro)
      SELECT id, langue, 'original', intro, chapters, outro FROM bulletins WHERE id = ${bulletinId}`;
  });
  afterAll(async () => { const { db } = await import("./db"); await db().end(); });

  it("traduit une seule fois le même contenu, en gardant sujets, faits et sources", async () => {
    const { getVersion } = await import("./editorial");
    let calls = 0;
    const llm = async <T,>(): Promise<T> => {
      calls++;
      return { intro: "Hello and welcome.", chapters: [{ title: "Story one", text: "First story of the news briefing." }, { title: "Story two", text: "Second story." }], outro: "End of the briefing." } as T;
    };
    const en = await getVersion(bulletinId, "en", llm);
    expect(en.source).toBe("traduction");
    expect(en.chapters.map((c) => c.title)).toEqual(["Story one", "Story two"]);
    const again = await getVersion(bulletinId, "en", llm);
    expect(again.intro).toBe("Hello and welcome.");
    expect(calls).toBe(1);
    const fr = await getVersion(bulletinId, "fr", llm);
    expect(fr.source).toBe("original");
  });

  it("refuse une traduction qui change le nombre de sujets", async () => {
    const { getVersion } = await import("./editorial");
    const { db } = await import("./db");
    await db()`DELETE FROM bulletin_versions WHERE langue = 'en'`;
    const llm = async <T,>(): Promise<T> => ({ intro: "Hi.", chapters: [{ title: "Only one", text: "Merged story." }], outro: "Bye." } as T);
    await expect(getVersion(bulletinId, "en", llm)).rejects.toThrow(/nombre de sujets/);
  });

  it("génère, enregistre et relit l'audio avec la bonne voix", async () => {
    const { buildBulletinAudio, getAudioMeta, getAudioFile } = await import("./audio");
    const meta = await buildBulletinAudio(bulletinId, "fr", "persona_b", fakeProvider);
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((c) => c.voice))).toEqual(new Set(["marin"]));
    expect(calls[0].instructions).toContain("présentatrice");
    expect(meta.chapters.map((c) => c.title)).toEqual(["Ouverture", "Sujet un", "Sujet deux", "Clôture"]);
    expect(meta.costEur).toBeGreaterThan(0);
    const again = await getAudioMeta(bulletinId, "fr", "persona_b");
    expect(again?.durationMs).toBe(meta.durationMs);
    const file = await getAudioFile(bulletinId, "fr", "persona_b");
    expect(file?.length).toBe(meta.bytes);
  });

  it("refuse de produire l'audio d'un bulletin non publié", async () => {
    const { db } = await import("./db");
    const { buildBulletinAudio } = await import("./audio");
    const [b] = await db()`INSERT INTO bulletins (pays, theme, langue, duree, edition, status) VALUES ('FR','generaliste','fr','court','a_la_demande','echec') RETURNING id`;
    await expect(buildBulletinAudio(Number(b.id), "en", "persona_a", fakeProvider)).rejects.toThrow(/publié/);
  });
});
