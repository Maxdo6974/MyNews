import { COUNTRIES, FEATURED_TOPICS, PERSONAS, THEMES } from "@flash-info/core";
import Home from "./components/Home";

export default function Page() {
  return (
    <Home
      countries={COUNTRIES.map((c) => ({ id: c.id, label: c.label }))}
      themes={THEMES.map((t) => ({ id: t.id, label: t.label }))}
      personas={PERSONAS.map((p) => ({ id: p.id, label: p.nomAffiche, description: { fr: p.description, en: p.descriptionEn } }))}
      featured={Object.fromEntries(Object.entries(FEATURED_TOPICS).map(([k, v]) => [k, v?.label ?? null]))}
    />
  );
}
