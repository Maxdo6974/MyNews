import { COUNTRIES, THEMES, hasDatabase, listPublished } from "@flash-info/core";
import History from "./History";

export const dynamic = "force-dynamic";

export default async function HistoriquePage() {
  const rows = hasDatabase() ? await listPublished({ limit: 50 }).catch(() => []) : [];
  return (
    <History
      items={rows.map((r) => ({
        id: Number(r.id), pays: r.pays, theme: r.theme, langue: r.langue, duree: r.duree,
        createdAt: new Date(r.created_at).toISOString(), titles: (r.titles as string[] | null) ?? [], voices: (r.voices as string[] | null) ?? [],
      }))}
      countries={COUNTRIES.map((c) => ({ id: c.id, label: c.label }))}
      themes={THEMES.map((t) => ({ id: t.id, label: t.label }))}
    />
  );
}
