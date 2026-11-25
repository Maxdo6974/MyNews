import { COUNTRIES, FEATURED_TOPICS, PERSONAS, THEMES } from "@flash-info/core";
import Player from "./components/Player";

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">L'actualité, rien que les faits.</h1>
      <p className="mt-3 text-ink-soft max-w-xl">
        Un bulletin audio de 2 à 3 minutes, construit uniquement à partir d'informations confirmées par plusieurs médias indépendants.
      </p>
      <div className="mt-8">
        <Player
          countries={COUNTRIES.map((c) => ({ id: c.id, label: c.label.fr, flag: c.flag }))}
          themes={THEMES.map((t) => ({ id: t.id, label: t.label.fr }))}
          featured={Object.fromEntries(Object.entries(FEATURED_TOPICS).map(([k, v]) => [k, v?.label.fr ?? null]))}
          personas={PERSONAS.map((p) => ({ id: p.id, label: p.nomAffiche, description: p.description }))}
        />
      </div>
    </div>
  );
}
