import { NextResponse } from "next/server";
import { COUNTRIES, THEMES, computeAllEvents, hasDatabase, listEvents, type CountryCode, type ThemeId } from "@flash-info/core";

export const dynamic = "force-dynamic";

/** Événements détectés pour un pays : ?pays=FR&theme=politique&confirmes=1 */
export async function GET(req: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  const p = new URL(req.url).searchParams;
  const pays = (p.get("pays") ?? "FR") as CountryCode;
  const theme = (p.get("theme") || undefined) as ThemeId | undefined;
  if (!COUNTRIES.some((c) => c.id === pays) || (theme && !THEMES.some((t) => t.id === theme))) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }
  const events = await listEvents({ pays, theme, confirmedOnly: p.get("confirmes") === "1", limit: Number(p.get("limit") ?? 30) });
  return NextResponse.json({ events });
}

/** Recalcule les événements tout de suite (sans récupérer de nouveaux articles). */
export async function POST() {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  return NextResponse.json({ results: await computeAllEvents() });
}
