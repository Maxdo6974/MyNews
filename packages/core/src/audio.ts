import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PERSONAS } from "./config";
import { db } from "./db";
import { getVersion } from "./editorial";
import { logCost } from "./llm";
import { defaultTtsProvider, type TtsProvider } from "./tts";
import type { Language, Persona } from "./types";

const run = promisify(execFile);
/** Silence entre deux parties du bulletin (secondes). */
const GAP_SECONDS = 0.5;
/** Accélération de la voix, sans changer sa hauteur (1 = vitesse d'origine). */
const tempo = () => Math.min(1.25, Math.max(0.9, Number(process.env.AUDIO_TEMPO ?? "1.08")));
/** Musique d'introduction : seule avant la voix, puis en fond, puis fondu. */
const INTRO_LEAD = 1.8;
const INTRO_TAIL = 1.2;
const BED_UNDER_VOICE = 0.2; // ≈ −14 dB sous la voix
const CONCURRENCY = 3;

export interface AudioChapter { title: string; startMs: number }
export interface AudioMeta { bulletinId: number; language: Language; persona: string; durationMs: number; bytes: number; chapters: AudioChapter[]; costEur: number; url: string }

async function probeSeconds(file: string): Promise<number> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(stdout.trim());
}

/**
 * Habillage musical « JT » composé par le programme (aucun droit d'auteur) :
 * tic-tac en double croches, basse pulsée à 120 bpm, accords la mineur – fa – sol – la mineur.
 */
export async function renderIntroBed(seconds: number, file: string): Promise<void> {
  const seq = (a: number, b: number, c: number, d: number) => `if(lt(mod(t,8),2),${a},if(lt(mod(t,8),4),${b},if(lt(mod(t,8),6),${c},${d})))`;
  const f1 = seq(220, 174.61, 196, 220), f2 = seq(261.63, 220, 246.94, 261.63), f3 = seq(329.63, 261.63, 293.66, 329.63), bass = seq(55, 43.65, 49, 55);
  const expr = [
    "0.10*sin(2*PI*1900*t)*exp(-110*mod(t,0.125))*(0.6+0.4*lt(mod(t,0.5),0.125))",
    `0.32*sin(2*PI*${bass}*t)*exp(-4*mod(t,0.5))`,
    `0.18*sin(2*PI*2*${bass}*t)*exp(-6*mod(t,0.5))`,
    `0.07*(sin(2*PI*${f1}*t)+sin(2*PI*${f1}*1.004*t)+sin(2*PI*${f2}*t)+sin(2*PI*${f2}*0.996*t)+sin(2*PI*${f3}*t)+sin(2*PI*${f3}*1.003*t))*(0.75+0.25*sin(2*PI*0.5*t))`,
  ].join(" + ");
  const d = Math.max(3, seconds);
  await run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=${d.toFixed(2)}`,
    "-af", `highpass=f=35,lowpass=f=7000,aecho=0.8:0.5:90|180:0.22|0.12,afade=t=in:d=0.25,afade=t=out:st=${(d - 1.6).toFixed(2)}:d=1.6,loudnorm=I=-18:TP=-2`,
    "-ar", "44100", "-ac", "1", file]);
}

/**
 * Assemble les segments : voix accélérée (tempo), musique sous l'introduction, silences entre parties,
 * volume normalisé (−16 LUFS, norme podcast), MP3 128 kbit/s. Renvoie le début de chaque partie.
 */
export async function assemble(segments: { title: string; mp3: Buffer }[], workDir: string, opts: { introBed?: boolean } = {}): Promise<{ mp3: Buffer; durationMs: number; chapters: AudioChapter[] }> {
  const files: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const raw = path.join(workDir, `seg${i}.mp3`);
    const out = path.join(workDir, `seg${i}.wav`);
    await fs.writeFile(raw, segments[i].mp3);
    await run("ffmpeg", ["-y", "-v", "error", "-i", raw, "-af", `atempo=${tempo()},aresample=44100`, "-ac", "1", out]);
    files.push(out);
  }

  if (opts.introBed && files.length) {
    const voice = files[0];
    const voiceDur = await probeSeconds(voice);
    const bed = path.join(workDir, "bed.wav");
    const mixed = path.join(workDir, "intro.wav");
    await renderIntroBed(INTRO_LEAD + voiceDur + INTRO_TAIL, bed);
    const lead = INTRO_LEAD.toFixed(2);
    await run("ffmpeg", ["-y", "-v", "error", "-i", bed, "-i", voice, "-filter_complex",
      `[0:a]volume='if(lt(t,${lead}),1,${BED_UNDER_VOICE})':eval=frame[m];[1:a]adelay=${Math.round(INTRO_LEAD * 1000)}:all=1[v];[m][v]amix=inputs=2:duration=first:normalize=0[out]`,
      "-map", "[out]", "-ac", "1", mixed]);
    files[0] = mixed;
  }

  const chapters: AudioChapter[] = [];
  let t = 0;
  for (let i = 0; i < files.length; i++) {
    chapters.push({ title: segments[i].title, startMs: Math.round(t * 1000) });
    t += (await probeSeconds(files[i])) + (i < files.length - 1 ? GAP_SECONDS : 0);
  }
  const inputs = files.flatMap((f) => ["-i", f]);
  const parts = files.map((_, i) => (i < files.length - 1 ? `[${i}:a]apad=pad_dur=${GAP_SECONDS}[a${i}]` : `[${i}:a]anull[a${i}]`));
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

/** Produit l'audio d'un bulletin dans une langue et pour une voix, l'enregistre et renvoie ses métadonnées. */
export async function buildBulletinAudio(bulletinId: number, language: Language, personaId: string, provider: TtsProvider = defaultTtsProvider()): Promise<AudioMeta> {
  const sql = db();
  const persona = personaById(personaId);
  const v = await getVersion(bulletinId, language);
  const segments = [
    { title: language === "fr" ? "Ouverture" : "Opening", text: v.intro },
    ...v.chapters.map((c) => ({ title: c.title, text: c.text })),
    { title: language === "fr" ? "Clôture" : "Closing", text: v.outro },
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
    const assembled = await assemble(segments.map((s, i) => ({ title: s.title, mp3: mp3s[i] })), workDir, { introBed: true });
    const characters = segments.reduce((n, s) => n + s.text.length, 0);
    const cost = provider.costEur(assembled.durationMs / 1000, characters);
    await logCost({ provider: provider.name, model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts", purpose: `voix ${persona.id} ${language}`, inputUnits: characters, outputUnits: Math.round(assembled.durationMs / 1000), costEur: cost, bulletinId });
    await sql`
      INSERT INTO bulletin_audio (bulletin_id, langue, persona, provider, voice, mp3, bytes, duration_ms, chapters, cost_eur)
      VALUES (${bulletinId}, ${language}, ${persona.id}, ${provider.name}, ${persona.openaiVoice}, ${assembled.mp3}, ${assembled.mp3.length},
              ${assembled.durationMs}, ${sql.json(assembled.chapters as never)}, ${cost})
      ON CONFLICT (bulletin_id, langue, persona) DO UPDATE SET mp3 = EXCLUDED.mp3, bytes = EXCLUDED.bytes, duration_ms = EXCLUDED.duration_ms,
        chapters = EXCLUDED.chapters, cost_eur = EXCLUDED.cost_eur, created_at = now()`;
    await sql`UPDATE bulletins SET cost_eur = (SELECT coalesce(sum(cost_eur), 0) FROM cost_log WHERE bulletin_id = ${bulletinId}) WHERE id = ${bulletinId}`;
    return { bulletinId, language, persona: persona.id, durationMs: assembled.durationMs, bytes: assembled.mp3.length, chapters: assembled.chapters, costEur: cost, url: audioUrl(bulletinId, language, persona.id) };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export const audioUrl = (bulletinId: number, language: Language, persona: string) => `/api/audio/${bulletinId}?langue=${language}&voix=${persona}`;

export async function getAudioMeta(bulletinId: number, language: Language, persona: string): Promise<AudioMeta | null> {
  const [a] = await db()`SELECT duration_ms, bytes, chapters, cost_eur FROM bulletin_audio WHERE bulletin_id = ${bulletinId} AND langue = ${language} AND persona = ${persona}`;
  if (!a) return null;
  return { bulletinId, language, persona, durationMs: a.duration_ms, bytes: a.bytes, chapters: a.chapters, costEur: Number(a.cost_eur), url: audioUrl(bulletinId, language, persona) };
}

export async function getAudioFile(bulletinId: number, language: Language, persona: string): Promise<Buffer | null> {
  const [a] = await db()`SELECT mp3 FROM bulletin_audio WHERE bulletin_id = ${bulletinId} AND langue = ${language} AND persona = ${persona}`;
  return a ? (a.mp3 as Buffer) : null;
}

const pending = new Map<string, Promise<AudioMeta>>();
/** Audio existant, sinon produit une seule fois même si plusieurs auditeurs le demandent en même temps. */
export function ensureAudio(bulletinId: number, language: Language, persona: string): Promise<AudioMeta> {
  const key = `${bulletinId}|${language}|${persona}`;
  if (!pending.has(key)) {
    pending.set(key, (async () => (await getAudioMeta(bulletinId, language, persona)) ?? buildBulletinAudio(bulletinId, language, persona))().finally(() => pending.delete(key)));
  }
  return pending.get(key)!;
}

/** Supprime l'audio de plus de 7 jours (place en base). */
export async function purgeOldAudio(days = 7): Promise<number> {
  const r = await db()`DELETE FROM bulletin_audio WHERE created_at < now() - make_interval(days => ${days}) RETURNING bulletin_id`;
  return r.length;
}
