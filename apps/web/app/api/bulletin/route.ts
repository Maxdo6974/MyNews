import { NextResponse } from "next/server";
import {
  COUNTRIES,
  THEMES,
  demoBulletin,
  isDemoMode,
  type CountryCode,
  type Duration,
  type Language,
  type ThemeId,
} from "@flash-info/core";

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
  if (!isDemoMode()) {
    return NextResponse.json(
      { error: "La génération de vrais bulletins arrive à l'étape 5. Repassez DEMO_MODE à true en attendant." },
      { status: 501 },
    );
  }
  return NextResponse.json(demoBulletin(country, theme, language, duration));
}
