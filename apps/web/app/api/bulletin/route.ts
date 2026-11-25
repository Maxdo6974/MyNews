import { NextResponse } from "next/server";
import {
  COUNTRIES, THEMES, demoBulletin, findFreshBulletin, generateOnce, hasDatabase, isDemoMode,
  type CountryCode, type Duration, type Language, type ThemeId,
} from "@flash-info/core";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Bulletin pour le lecteur : démo, ou vrai bulletin (récent s'il existe, sinon généré). */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const country = (p.get("country") ?? "FR") as CountryCode;
  const theme = (p.get("theme") ?? "generaliste") as ThemeId;
  const language = (p.get("lang") ?? "fr") as Language;
  const duration = (p.get("duration") ?? "standard") as Duration;

  if (!COUNTRIES.some((c) => c.id === country) || !THEMES.some((t) => t.id === theme) ||
      !["fr", "en"].includes(language) || !["court", "standard"].includes(duration)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  if (isDemoMode()) return NextResponse.json(demoBulletin(country, theme, language, duration));
  if (!hasDatabase() || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Mode réel non configuré (base de données ou clé API manquante)." }, { status: 503 });
  }

  const fresh = await findFreshBulletin({ pays: country, theme, language, duration });
  const b = fresh
    ? { id: Number(fresh.id), status: fresh.status, error: fresh.error, intro: fresh.intro, chapters: fresh.chapters, outro: fresh.outro, created: fresh.created_at }
    : await generateOnce({ pays: country, theme, language, duration }).then((r) => ({ ...r, created: new Date().toISOString() }));

  if (b.status !== "pret") return NextResponse.json({ error: b.error ?? "Génération impossible." }, { status: 422 });
  return NextResponse.json({
    id: `b${b.id}`, bulletinId: b.id, voiceAvailable: Boolean(process.env.OPENAI_API_KEY), country, theme, language, duration, edition: "a_la_demande", createdAt: b.created,
    isDemo: false, intro: b.intro, chapters: b.chapters, outro: b.outro,
  });
}
