import { NextResponse } from "next/server";
import { PERSONAS, ensureAudio, hasDatabase } from "@flash-info/core";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Prépare (ou retrouve) l'audio d'un bulletin pour une voix : { bulletinId, persona } */
export async function POST(req: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Clé OPENAI_API_KEY absente : pas de voix réaliste." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const bulletinId = Number(body.bulletinId);
  const persona = String(body.persona ?? "");
  if (!Number.isInteger(bulletinId) || !PERSONAS.some((p) => p.id === persona)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  try {
    return NextResponse.json(await ensureAudio(bulletinId, persona));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
