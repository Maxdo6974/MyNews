import { assertBudget } from "./llm";
import type { Language } from "./types";

/**
 * Moteur de synthèse vocale. Toute l'appli passe par cette interface :
 * changer de fournisseur (OpenAI Realtime, ElevenLabs…) = écrire une nouvelle implémentation.
 */
export interface TtsProvider {
  name: string;
  /** Renvoie un fichier MP3. */
  synthesize(req: { text: string; voice: string; instructions: string; language: Language }): Promise<Buffer>;
  /** Coût estimé en euros pour une durée d'audio produite. */
  costEur(seconds: number, characters: number): number;
}

/**
 * OpenAI, point d'accès /v1/audio/speech.
 * Attention : gpt-4o-mini-tts, tts-1 et tts-1-hd seront arrêtés par OpenAI le 6 janvier 2027 (documentation consultée le 25/11/2026).
 */
export class OpenAiSpeechProvider implements TtsProvider {
  name = "openai";
  constructor(
    private readonly apiKey = process.env.OPENAI_API_KEY,
    private readonly model = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
  ) {}

  async synthesize(req: { text: string; voice: string; instructions: string }): Promise<Buffer> {
    if (!this.apiKey) throw new Error("Clé OPENAI_API_KEY absente.");
    await assertBudget();
    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model, voice: req.voice, input: req.text, instructions: req.instructions, response_format: "mp3" }),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      const data = await res.json().catch(() => ({}));
      lastError = `${res.status} ${data?.error?.message ?? ""}`.trim();
      if (![429, 500, 502, 503].includes(res.status)) break;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
    throw new Error(`Synthèse vocale impossible : ${lastError}`);
  }

  /** Estimation prudente (prix non publié sur la page tarifs) : réglable par OPENAI_TTS_EUR_PER_MIN. */
  costEur(seconds: number): number {
    return (seconds / 60) * Number(process.env.OPENAI_TTS_EUR_PER_MIN ?? "0.02");
  }
}

export function defaultTtsProvider(): TtsProvider {
  return new OpenAiSpeechProvider();
}
