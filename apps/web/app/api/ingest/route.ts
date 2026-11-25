import { NextResponse } from "next/server";
import { computeAllEvents, hasDatabase, ingestAll, ingestionOverview } from "@flash-info/core";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** État de la récupération : derniers passages, volumes par pays et par source. */
export async function GET() {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  return NextResponse.json(await ingestionOverview());
}

/** Lance une récupération tout de suite (au plus une toutes les 2 minutes). */
export async function POST() {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  const result = await ingestAll("manuel", 120);
  if (!result.skipped) await computeAllEvents();
  return NextResponse.json(result, { status: result.skipped ? 429 : 200 });
}
