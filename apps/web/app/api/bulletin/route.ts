import { NextResponse } from "next/server";
import {
  COUNTRIES, THEMES, demoBulletin, findFreshBulletin, generateOnce, getVersion, hasDatabase, isDemoMode,
  type CountryCode, type Language, type ThemeId,
} from "@flash-info/core";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/** Format unique : 3 minutes. */
const DURATION = "standard" as const;

/**
 * Bulletin pour le lecteur. Le contenu est le même en français et en anglais :
 * un bulletin récent (moins de 15 min) est réutilisé et, si besoin, traduit.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const country = (p.get("country") ?? "FR") as CountryCode;
  const theme = (p.get("theme") ?? "generaliste") as ThemeId;
  const language = (p.get("lang") ?? "fr") as Language;

  if (!COUNTRIES.some((c) => c.id === country) || !THEMES.some((t) => t.id === theme) || !["fr", "en"].includes(language)) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  if (isDemoMode()) return NextResponse.json({ ...demoBulletin(country, theme, language, DURATION), language });
  if (!hasDatabase() || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Mode réel non configuré (base de données ou clé API manquante)." }, { status: 503 });
  }

  let bulletinId: number;
  let createdAt: string;
  const fresh = await findFreshBulletin({ pays: country, theme, duration: DURATION });
  if (fresh) {
    bulletinId = Number(fresh.id);
    createdAt = new Date(fresh.created_at).toISOString();
  } else {
    const r = await generateOnce({ pays: country, theme, language, duration: DURATION });
    if (r.status !== "pret") return NextResponse.json({ error: r.error ?? "Génération impossible." }, { status: 422 });
    bulletinId = r.id;
    createdAt = new Date().toISOString();
  }
  try {
    const v = await getVersion(bulletinId, language);
    return NextResponse.json({
      id: `b${bulletinId}`, bulletinId, voiceAvailable: Boolean(process.env.OPENAI_API_KEY), country, theme, language,
      duration: DURATION, edition: "a_la_demande", createdAt, isDemo: false, intro: v.intro, chapters: v.chapters, outro: v.outro,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 422 });
  }
}
