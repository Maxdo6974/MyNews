import { NextResponse } from "next/server";
import {
  COUNTRIES, THEMES, generateOnce, hasDatabase, isDemoMode, recentBulletins, spentToday, dailyBudget,
  type CountryCode, type Duration, type Language, type ThemeId,
} from "@flash-info/core";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  return NextResponse.json({ bulletins: await recentBulletins(), spentToday: await spentToday(), budget: dailyBudget() });
}

/** Génère un nouveau bulletin réel (page de test), sans passer par le cache. */
export async function POST(req: Request) {
  if (isDemoMode()) return NextResponse.json({ error: "Mode démo actif : aucun appel à l'IA. Passez DEMO_MODE à false." }, { status: 409 });
  if (!hasDatabase() || !process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Base de données ou clé ANTHROPIC_API_KEY manquante." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const pays = body.country as CountryCode, theme = body.theme as ThemeId, language = body.lang as Language, duration = body.duration as Duration;
  if (!COUNTRIES.some((c) => c.id === pays) || !THEMES.some((t) => t.id === theme) || !["fr", "en"].includes(language) || !["court", "standard"].includes(duration)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  return NextResponse.json(await generateOnce({ pays, theme, language, duration }));
}
