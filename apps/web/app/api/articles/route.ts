import { NextResponse } from "next/server";
import { COUNTRIES, hasDatabase, latestArticles } from "@flash-info/core";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  const p = new URL(req.url).searchParams;
  const pays = p.get("pays") ?? undefined;
  if (pays && pays !== "INT" && !COUNTRIES.some((c) => c.id === pays)) {
    return NextResponse.json({ error: "Pays inconnu" }, { status: 400 });
  }
  const articles = await latestArticles({ pays, sourceId: p.get("source") ?? undefined, limit: Number(p.get("limit") ?? 50) });
  return NextResponse.json({ articles });
}
