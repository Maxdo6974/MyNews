import { getAudioFile, hasDatabase } from "@flash-info/core";

export const dynamic = "force-dynamic";

/** Fichier MP3, avec prise en charge des requêtes partielles (avance rapide dans le lecteur, Safari). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!hasDatabase()) return new Response("Base de données non configurée", { status: 503 });
  const { id } = await params;
  const persona = new URL(req.url).searchParams.get("voix") ?? "persona_a";
  const file = await getAudioFile(Number(id), persona);
  if (!file) return new Response("Audio introuvable", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=86400",
    "Content-Disposition": `inline; filename="flash-info-${id}.mp3"`,
  };
  const range = req.headers.get("range");
  const m = range?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : Math.max(0, file.length - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), file.length - 1) : file.length - 1;
    if (start >= file.length || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.length}` } });
    return new Response(new Uint8Array(file.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${file.length}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(new Uint8Array(file), { headers: { ...headers, "Content-Length": String(file.length) } });
}
