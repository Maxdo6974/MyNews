import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PERSONAS } from "./config";
import { db } from "./db";
import { logCost } from "./llm";
import { defaultTtsProvider, type TtsProvider } from "./tts";
import type { Language, Persona } from "./types";

const run = promisify(execFile);
/** Silence entre deux parties du bulletin (secondes). */
const GAP_SECONDS = 0.7;
const CONCURRENCY = 3;

export interface AudioChapter { title: string; startMs: number }
export interface AudioMeta { bulletinId: number; persona: string; durationMs: number; bytes: number; chapters: AudioChapter[]; costEur: number; url: string }

async function probeSeconds(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

/**
 * Assemble des segments MP3 : silences entre les parties, volume normalisé (-16 LUFS, norme podcast),
 * export MP3 128 kbit/s. Renvoie le fichier et le début de chaque partie.
 */
export async function assemble(segments: { title: string; mp3: Buffer }[], workDir: string): Promise<{ mp3: Buffer; durationMs: number; chapters: AudioChapter[] }> {
  const files: string[] = [];
  const chapters: AudioChapter[] = [];
  let t = 0;
  for (let i = 0; i < segments.length; i++) {
    const f = path.join(workDir, `seg${i}.mp3`);
    await fs.writeFile(f, segments[i].mp3);
    files.push(f);
    chapters.push({ title: segments[i].title, startMs: Math.round(t * 1000) });
    t += (await probeSeconds(f)) + (i < segments.length - 1 ? GAP_SECONDS : 0);
  }
  const inputs = files.flatMap((f) => ["-i", f]);
  // Chaque segment est ramené au même format, suivi d'un silence, puis tout est concaténé et normalisé.
  const parts = files.map((_, i) =>
    i < files.length - 1
      ? `[${i}:a]aresample=44100,aformat=channel_layouts=mono,apad=pad_dur=${GAP_SECONDS}[a${i}]`
      : `[${i}:a]aresample=44100,aformat=channel_layouts=mono[a${i}]`,
  );
  const filter = `${parts.join(";")};${files.map((_, i) => `[a${i}]`).join("")}concat=n=${files.length}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100[out]`;
  const out = path.join(workDir, "bulletin.mp3");
  await run("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", out], { maxBuffer: 1 << 26 });
  const mp3 = await fs.readFile(out);
  return { mp3, durationMs: Math.round((await probeSeconds(out)) * 1000), chapters };
}

export function personaById(id: string): Persona {
  const p = PERSONAS.find((x) => x.id === id);
  if (!p) throw new Error(`Voix inconnue : ${id}`);
  return p;
}

/** Produit l'audio d'un bulletin pour une voix, l'enregistre et renvoie ses métadonnées. */
export async function buildBulletinAudio(bulletinId: number, personaId: string, provider: TtsProvider = defaultTtsProvider()): Promise<AudioMeta> {
  const sql = db();
  const [b] = await sql`SELECT id, status, langue, intro, chapters, outro FROM bulletins WHERE id = ${bulletinId}`;
  if (!b) throw new Error("Bulletin introuvable.");
  if (b.status !== "pret") throw new Error("Ce bulletin n'a pas été publié : pas d'audio.");
  const persona = personaById(personaId);
  const language = b.langue as Language;
  const segments = [
    { title: language === "fr" ? "Ouverture" : "Opening", text: b.intro as string },
    ...(b.chapters as { title: string; text: string }[]).map((c) => ({ title: c.title, text: c.text })),
    { title: language === "fr" ? "Clôture" : "Closing", text: b.outro as string },
  ];

  const mp3s: Buffer[] = new Array(segments.length);
  let next = 0;
  const worker = async () => {
    while (next < segments.length) {
      const i = next++;
      mp3s[i] = await provider.synthesize({ text: segments[i].text, voice: persona.openaiVoice, instructions: persona.instructions[language], language });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "flash-audio-"));
  try {
    const assembled = await assemble(segments.map((s, i) => ({ title: s.title, mp3: mp3s[i] })), workDir);
    const characters = segments.reduce((n, s) => n + s.text.length, 0);
    const cost = provider.costEur(assembled.durationMs / 1000, characters);
    await logCost({ provider: provider.name, model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts", purpose: `voix ${persona.id}`, inputUnits: characters, outputUnits: Math.round(assembled.durationMs / 1000), costEur: cost, bulletinId });
    await sql`
      INSERT INTO bulletin_audio (bulletin_id, persona, provider, voice, mp3, bytes, duration_ms, chapters, cost_eur)
      VALUES (${bulletinId}, ${persona.id}, ${provider.name}, ${persona.openaiVoice}, ${assembled.mp3}, ${assembled.mp3.length},
              ${assembled.durationMs}, ${sql.json(assembled.chapters as never)}, ${cost})
      ON CONFLICT (bulletin_id, persona) DO UPDATE SET mp3 = EXCLUDED.mp3, bytes = EXCLUDED.bytes, duration_ms = EXCLUDED.duration_ms,
        chapters = EXCLUDED.chapters, cost_eur = EXCLUDED.cost_eur, created_at = now()`;
    await sql`UPDATE bulletins SET cost_eur = (SELECT coalesce(sum(cost_eur), 0) FROM cost_log WHERE bulletin_id = ${bulletinId}) WHERE id = ${bulletinId}`;
    return { bulletinId, persona: persona.id, durationMs: assembled.durationMs, bytes: assembled.mp3.length, chapters: assembled.chapters, costEur: cost, url: audioUrl(bulletinId, persona.id) };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export const audioUrl = (bulletinId: number, persona: string) => `/api/audio/${bulletinId}?voix=${persona}`;

export async function getAudioMeta(bulletinId: number, persona: string): Promise<AudioMeta | null> {
  const [a] = await db()`SELECT bulletin_id, persona, duration_ms, bytes, chapters, cost_eur FROM bulletin_audio WHERE bulletin_id = ${bulletinId} AND persona = ${persona}`;
  if (!a) return null;
  return { bulletinId, persona, durationMs: a.duration_ms, bytes: a.bytes, chapters: a.chapters, costEur: Number(a.cost_eur), url: audioUrl(bulletinId, persona) };
}

export async function getAudioFile(bulletinId: number, persona: string): Promise<Buffer | null> {
  const [a] = await db()`SELECT mp3 FROM bulletin_audio WHERE bulletin_id = ${bulletinId} AND persona = ${persona}`;
  return a ? (a.mp3 as Buffer) : null;
}

const pending = new Map<string, Promise<AudioMeta>>();
/** Audio existant, sinon généré une seule fois même si plusieurs auditeurs le demandent en même temps. */
export function ensureAudio(bulletinId: number, persona: string): Promise<AudioMeta> {
  const key = `${bulletinId}|${persona}`;
  if (!pending.has(key)) {
    pending.set(key, (async () => (await getAudioMeta(bulletinId, persona)) ?? buildBulletinAudio(bulletinId, persona))().finally(() => pending.delete(key)));
  }
  return pending.get(key)!;
}

/** Supprime l'audio de plus de 7 jours (place en base). */
export async function purgeOldAudio(days = 7): Promise<number> {
  const r = await db()`DELETE FROM bulletin_audio WHERE created_at < now() - make_interval(days => ${days}) RETURNING bulletin_id`;
  return r.length;
}
