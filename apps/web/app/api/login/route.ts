import { NextResponse } from "next/server";
import { AUTH_COOKIE, tokenFor } from "@/lib/auth";

/** URL publique de la requête, y compris derrière le proxy de l'hébergeur. */
function publicUrl(req: Request, path: string): URL {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return new URL(path, host ? `${proto}://${host}` : req.url);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const expected = process.env.STAGING_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.redirect(publicUrl(req, `/login?error=1&next=${encodeURIComponent(safeNext)}`), 303);
  }
  const res = NextResponse.redirect(publicUrl(req, safeNext), 303);
  res.cookies.set(AUTH_COOKIE, await tokenFor(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
