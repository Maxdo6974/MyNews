import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COUNTRIES, PERSONAS, THEMES, getBulletin, getVersion, hasDatabase, type Language } from "@flash-info/core";
import BulletinView from "./BulletinView";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!hasDatabase() || !/^\d+$/.test(id)) return null;
  const b = await getBulletin(Number(id));
  return b && b.status === "pret" ? b : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const b = await load((await params).id);
  if (!b) return { title: "Flash Info" };
  const titles = (b.chapters as { title: string }[]).map((c) => c.title).join(" · ");
  return { title: `Flash Info — ${titles}`, description: b.intro };
}

export default async function BulletinPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ voix?: string; langue?: string }> }) {
  const { id } = await params;
  const { voix, langue } = await searchParams;
  const b = await load(id);
  if (!b) notFound();
  const wanted: Language = langue === "en" || langue === "fr" ? langue : (b.langue as Language);
  const v = await getVersion(Number(b.id), wanted).catch(() => getVersion(Number(b.id), b.langue as Language));
  return (
    <BulletinView
      bulletin={{
        bulletinId: Number(b.id), isDemo: false, voiceAvailable: Boolean(process.env.OPENAI_API_KEY),
        intro: v.intro, outro: v.outro, chapters: v.chapters, language: v.language, country: b.pays, theme: b.theme,
        createdAt: new Date(b.created_at).toISOString(),
      }}
      initialPersona={PERSONAS.some((p) => p.id === voix) ? voix! : PERSONAS[0].id}
      personas={PERSONAS.map((p) => ({ id: p.id, label: p.nomAffiche }))}
      countries={COUNTRIES.map((c) => ({ id: c.id, label: c.label }))}
      themes={THEMES.map((t) => ({ id: t.id, label: t.label }))}
    />
  );
}
