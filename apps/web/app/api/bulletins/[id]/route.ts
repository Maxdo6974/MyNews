import { NextResponse } from "next/server";
import { getBulletin, hasDatabase } from "@flash-info/core";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return NextResponse.json({ error: "Base de données non configurée" }, { status: 503 });
  const { id } = await params;
  const b = await getBulletin(Number(id));
  return b ? NextResponse.json(b) : NextResponse.json({ error: "Introuvable" }, { status: 404 });
}
