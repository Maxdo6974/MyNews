import { NextResponse } from "next/server";
import { getVersion, hasDatabase, type Language } from "@flash-info/core";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Même bulletin dans une autre langue (traduit à la première demande, puis réutilisé). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  const { id } = await params;
  const language = (new URL(req.url).searchParams.get("langue") ?? "fr") as Language;
  if (!/^\d+$/.test(id) || !["fr", "en"].includes(language)) return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  try {
    const v = await getVersion(Number(id), language);
    return NextResponse.json({ bulletinId: v.bulletinId, language: v.language, intro: v.intro, chapters: v.chapters, outro: v.outro });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
