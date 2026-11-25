import { NextResponse } from "next/server";
import { checkAllSources, loadSources, type HealthResult } from "@flash-info/core";

export const dynamic = "force-dynamic";

let cache: { at: number; results: HealthResult[] } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ cachedAt: new Date(cache.at).toISOString(), results: cache.results });
  }
  const results = await checkAllSources(loadSources());
  cache = { at: Date.now(), results };
  return NextResponse.json({ cachedAt: new Date(cache.at).toISOString(), results });
}
