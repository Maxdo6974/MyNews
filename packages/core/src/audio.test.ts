import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TtsProvider } from "./tts";

const run = promisify(execFile);

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
    expect(r.chapters[1].startMs).toBeGreaterThan(1500);  // ≈ 1 s + 0,7 s de silence
    expect(r.chapters[1].startMs).toBeLessThan(1900);
    expect(r.chapters[2].startMs).toBeGreaterThan(4200); // ≈ 1 + 0,7 + 2 + 0,7
    expect(r.durationMs).toBeGreaterThan(5000);
    expect(r.durationMs).toBeLessThan(5800);
    expect(r.mp3.subarray(0, 3).toString()).toMatch(/ID3|\xff/);
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
    const [b] = await db()`INSERT INTO bulletins (pays, theme, langue, duree, edition, status, intro, chapters, outro)
      VALUES ('FR', 'generaliste', 'fr', 'court', 'a_la_demande', 'pret', 'Bonjour et bienvenue.',
        ${db().json([{ title: "Sujet un", text: "Premier sujet du flash d'information.", fact_ids: [], sources: [] }, { title: "Sujet deux", text: "Second sujet.", fact_ids: [], sources: [] }] as never)},
        'Fin du flash.') RETURNING id`;
    bulletinId = Number(b.id);
  });
  afterAll(async () => { const { db } = await import("./db"); await db().end(); });

  it("génère, enregistre et relit l'audio avec la bonne voix", async () => {
    const { buildBulletinAudio, getAudioMeta, getAudioFile } = await import("./audio");
    const meta = await buildBulletinAudio(bulletinId, "persona_b", fakeProvider);
    expect(calls).toHaveLength(4);
    expect(new Set(calls.map((c) => c.voice))).toEqual(new Set(["marin"]));
    expect(calls[0].instructions).toContain("Présentatrice");
    expect(meta.chapters.map((c) => c.title)).toEqual(["Ouverture", "Sujet un", "Sujet deux", "Clôture"]);
    expect(meta.costEur).toBeGreaterThan(0);
    const again = await getAudioMeta(bulletinId, "persona_b");
    expect(again?.durationMs).toBe(meta.durationMs);
    const file = await getAudioFile(bulletinId, "persona_b");
    expect(file?.length).toBe(meta.bytes);
  });

  it("refuse de produire l'audio d'un bulletin non publié", async () => {
    const { db } = await import("./db");
    const { buildBulletinAudio } = await import("./audio");
    const [b] = await db()`INSERT INTO bulletins (pays, theme, langue, duree, edition, status) VALUES ('FR','generaliste','fr','court','a_la_demande','echec') RETURNING id`;
    await expect(buildBulletinAudio(Number(b.id), "persona_a", fakeProvider)).rejects.toThrow(/publié/);
  });
});
